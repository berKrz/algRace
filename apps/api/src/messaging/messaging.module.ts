import { Global, Module, OnModuleInit, Logger, Inject } from '@nestjs/common';
import {
	SNSClient,
	CreateTopicCommand,
	SubscribeCommand,
	SetSubscriptionAttributesCommand
} from '@aws-sdk/client-sns';
import {
	SQSClient,
	CreateQueueCommand,
	GetQueueAttributesCommand,
	SetQueueAttributesCommand
} from '@aws-sdk/client-sqs';

import { EnvSchema } from '@/config/env.schema';
import { TOPICS, QUEUES, QUEUE_SUBSCRIPTIONS } from './topics';

export const TOPIC_ARNS = Symbol('TOPIC_ARNS');
export const QUEUE_URLS = Symbol('QUEUE_URLS');

export type TopicArnMap = Map<string, string>;
export type QueueUrlMap = Map<string, string>;

@Global()
@Module({
	providers: [
		{
			provide: SNSClient,
			inject: [EnvSchema],
			useFactory: (env: EnvSchema) =>
				new SNSClient({
					region: env.AWS_REGION,
					endpoint: env.AWS_ENDPOINT_URL
				})
		},
		{
			provide: SQSClient,
			inject: [EnvSchema],
			useFactory: (env: EnvSchema) =>
				new SQSClient({
					region: env.AWS_REGION,
					endpoint: env.AWS_ENDPOINT_URL
				})
		},
		{
			provide: TOPIC_ARNS,
			useValue: new Map<string, string>()
		},
		{
			provide: QUEUE_URLS,
			useValue: new Map<string, string>()
		}
	],
	exports: [SNSClient, SQSClient, TOPIC_ARNS, QUEUE_URLS]
})
export class MessagingModule implements OnModuleInit {
	private readonly logger = new Logger(MessagingModule.name);

	constructor(
		private readonly sns: SNSClient,
		private readonly sqs: SQSClient,
		@Inject(TOPIC_ARNS) private readonly topicArns: TopicArnMap,
		@Inject(QUEUE_URLS) private readonly queueUrls: QueueUrlMap
	) {}

	async onModuleInit(): Promise<void> {
		for (const name of Object.values(TOPICS)) {
			const { TopicArn } = await this.sns.send(
				new CreateTopicCommand({ Name: name })
			);
			if (!TopicArn)
				throw new Error(`SNS CreateTopic returned no ARN for ${name}`);

			this.topicArns.set(name, TopicArn);
			this.logger.log(`Topic ready: ${name}`);
		}

		for (const name of Object.values(QUEUES)) {
			const { QueueUrl } = await this.sqs.send(
				new CreateQueueCommand({ QueueName: name })
			);
			if (!QueueUrl)
				throw new Error(`SQS CreateQueue returned no URL for ${name}`);

			this.queueUrls.set(name, QueueUrl);
			this.logger.log(`Queue ready: ${name}`);
		}

		for (const [queueName, topicName] of Object.entries(QUEUE_SUBSCRIPTIONS)) {
			const queueUrl = this.queueUrls.get(queueName)!;
			const topicArn = this.topicArns.get(topicName)!;

			// SNS needs the queue's ARN to subscribe it; the queue only exposes its URL
			// directly, so we fetch the ARN attribute.
			const { Attributes } = await this.sqs.send(
				new GetQueueAttributesCommand({
					QueueUrl: queueUrl,
					AttributeNames: ['QueueArn']
				})
			);
			const queueArn = Attributes?.QueueArn;
			if (!queueArn)
				throw new Error(`Could not read ARN for queue ${queueName}`);

			const { SubscriptionArn } = await this.sns.send(
				new SubscribeCommand({
					TopicArn: topicArn,
					Protocol: 'sqs',
					Endpoint: queueArn,
					ReturnSubscriptionArn: true
				})
			);

			// RawMessageDelivery=true means SQS receives the SNS payload as-is instead
			// of wrapped in SNS's JSON envelope
			if (SubscriptionArn) {
				await this.sns.send(
					new SetSubscriptionAttributesCommand({
						SubscriptionArn,
						AttributeName: 'RawMessageDelivery',
						AttributeValue: 'true'
					})
				);
			}

			// Allow SNS to deliver to this queue. The queue policy is set per-queue;
			// we overwrite each time (idempotent)
			await this.sqs.send(
				new SetQueueAttributesCommand({
					QueueUrl: queueUrl,
					Attributes: {
						Policy: JSON.stringify({
							Version: '2012-10-17', // latest AWS IAM policy language
							Statement: [
								{
									Effect: 'Allow',
									Principal: { Service: 'sns.amazonaws.com' },
									Action: 'sqs:SendMessage',
									Resource: queueArn,
									Condition: { ArnEquals: { 'aws:SourceArn': topicArn } }
								}
							]
						})
					}
				})
			);

			this.logger.log(`Subscribed: ${queueName} → ${topicName}`);
		}
	}
}
