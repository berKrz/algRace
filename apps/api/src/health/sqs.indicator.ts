import { Inject, Injectable } from '@nestjs/common';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

import { QUEUE_URLS, type QueueUrlMap } from '@/messaging/messaging.module';
import { HealthIndicator, HealthIndicatorResult } from './health.types.ts';

@Injectable()
export class SqsHealthIndicator implements HealthIndicator {
	readonly name = 'sqs';

	constructor(
		private readonly sqs: SQSClient,
		@Inject(QUEUE_URLS) private readonly queueUrls: QueueUrlMap
	) {}

	async check(): Promise<HealthIndicatorResult> {
		try {
			for (const [_name, url] of this.queueUrls) {
				await this.sqs.send(
					new GetQueueAttributesCommand({
						QueueUrl: url,
						AttributeNames: ['QueueArn']
					})
				);
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
