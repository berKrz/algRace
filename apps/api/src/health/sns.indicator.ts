import { Inject, Injectable } from '@nestjs/common';
import { SNSClient, GetTopicAttributesCommand } from '@aws-sdk/client-sns';

import { TOPIC_ARNS, type TopicArnMap } from '@/messaging/messaging.module';
import { HealthIndicator, HealthIndicatorResult } from './health.types.ts';

@Injectable()
export class SnsHealthIndicator implements HealthIndicator {
	readonly name = 'sns';

	constructor(
		private readonly sns: SNSClient,
		@Inject(TOPIC_ARNS) private readonly topicArns: TopicArnMap
	) {}

	async check(): Promise<HealthIndicatorResult> {
		try {
			// Verify every topic we provisioned is still reachable.
			for (const [_name, arn] of this.topicArns) {
				await this.sns.send(new GetTopicAttributesCommand({ TopicArn: arn }));
			}
			return { ok: true };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	}
}
