import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE, type Database } from '@/database/drizzle.provider';
import { HealthIndicator, HealthIndicatorResult } from './health.types.ts';

@Injectable()
export class DatabaseHealthIndicator implements HealthIndicator {
	readonly name = 'database';

	constructor(@Inject(DRIZZLE) private readonly db: Database) {}

	async check(): Promise<HealthIndicatorResult> {
		try {
			await this.db.execute(sql`SELECT 1`);
			return { ok: true };
		} catch (err) {
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	}
}
