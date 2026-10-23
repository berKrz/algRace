import { Injectable } from '@nestjs/common';

import { HealthIndicator } from './health.types';
import { DatabaseHealthIndicator } from './database.indicator';
import { SnsHealthIndicator } from './sns.indicator';
import { SqsHealthIndicator } from './sqs.indicator';

export interface HealthReport {
	status: 'ok' | 'degraded';
	checks: Record<string, { ok: true } | { ok: false; error: string }>;
}

@Injectable()
export class HealthService {
	private readonly indicators: HealthIndicator[];

	constructor(
		db: DatabaseHealthIndicator,
		sns: SnsHealthIndicator,
		sqs: SqsHealthIndicator
	) {
		this.indicators = [db, sns, sqs];
	}

	async check(): Promise<HealthReport> {
		const results = await Promise.all(
			this.indicators.map(async (i) => [i.name, await i.check()] as const)
		);
		const checks = Object.fromEntries(results);
		const status = results.every(([, r]) => r.ok) ? 'ok' : 'degraded';
		return { status, checks };
	}
}
