import {
	Inject,
	OnApplicationBootstrap,
	OnApplicationShutdown
} from '@nestjs/common';
import {
	DeleteMessageCommand,
	Message,
	ReceiveMessageCommand,
	SQSClient
} from '@aws-sdk/client-sqs';
import { PinoLogger } from 'nestjs-pino';

import { QUEUE_URLS, type QueueUrlMap } from './messaging.tokens.ts';
import { QueueName } from './topics';

export abstract class SqsConsumer
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private running = false;

	constructor(
		private readonly queueName: QueueName,
		private readonly sqs: SQSClient,
		@Inject(QUEUE_URLS) private readonly queueUrls: QueueUrlMap,
		protected readonly logger: PinoLogger
	) {
		this.logger.setContext(SqsConsumer.name);
	}

	protected abstract handle(message: Message): Promise<void>;

	onApplicationBootstrap(): void {
		this.running = true;
		void this.loop();
	}

	onApplicationShutdown(): void {
		this.running = false;
	}

	private async loop(): Promise<void> {
		const queueUrl = this.queueUrls.get(this.queueName)!;
		this.logger.info(`Polling ${this.queueName}`);

		while (this.running) {
			try {
				const { Messages } = await this.sqs.send(
					new ReceiveMessageCommand({
						QueueUrl: queueUrl,
						WaitTimeSeconds: 20,
						MaxNumberOfMessages: 10
					})
				);

				for (const message of Messages ?? []) {
					try {
						await this.handle(message);
						await this.sqs.send(
							new DeleteMessageCommand({
								QueueUrl: queueUrl,
								ReceiptHandle: message.ReceiptHandle
							})
						);
					} catch (err) {
						this.logger.error(
							{ err, messageId: message.MessageId },
							`Handler failed; message will be redelivered`
						);
					}
				}
			} catch (err) {
				this.logger.error({ err }, `Poll failed; retrying`);
				await new Promise((r) => setTimeout(r, 1000));
			}
		}

		this.logger.info(`Stopped polling ${this.queueName}`);
	}
}
