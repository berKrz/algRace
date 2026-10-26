import { Inject, Injectable } from '@nestjs/common';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

import { TOPIC_ARNS, type TopicArnMap } from './messaging.tokens.ts';
import { TopicName } from './topics';

@Injectable()
export class SnsPublisher {
	constructor(
		private readonly sns: SNSClient,
		@Inject(TOPIC_ARNS) private readonly topicArns: TopicArnMap
	) {}

	async publish(topic: TopicName, payload: unknown): Promise<void> {
		await this.sns.send(
			new PublishCommand({
				TopicArn: this.topicArns.get(topic)!,
				Message: JSON.stringify(payload)
			})
		);
	}
}
