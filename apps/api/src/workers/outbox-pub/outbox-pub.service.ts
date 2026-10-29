import {
	Inject,
	Injectable,
	OnApplicationBootstrap,
	OnApplicationShutdown
} from '@nestjs/common';
import { asc, eq, isNull } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import type { Subscriber } from 'pg-listen';

import { EnvSchema } from '@/config/env.schema';
import { DRIZZLE, type Database } from '@/database/drizzle.provider';
import { createPgListener } from '@/database/pg-listen.factory';
import * as schema from '@/database/schema';
import { SnsPublisher } from '@/messaging/sns.publisher';
import { TOPICS } from '@/messaging/topics';

const OUTBOX_CHANNEL = 'outbox_insert';

@Injectable()
export class OutboxPubService
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private subscriber?: Subscriber;
	private draining = false;
	private pending = false;

	constructor(
		private readonly env: EnvSchema,
		@Inject(DRIZZLE) private readonly db: Database,
		private readonly sns: SnsPublisher,
		private readonly logger: PinoLogger
	) {
		this.logger.setContext(OutboxPubService.name);
	}

	async onApplicationBootstrap(): Promise<void> {
		this.subscriber = createPgListener(this.env);

		this.subscriber.notifications.on(OUTBOX_CHANNEL, () => this.schedule());

		this.subscriber.events.on('error', (err) => {
			this.logger.error({ err }, 'pg-listen error');
		});

		this.subscriber.events.on('reconnect', (attempt) => {
			this.logger.warn({ attempt }, 'pg-listen reconnected');
			this.schedule();
		});

		await this.subscriber.connect();
		await this.subscriber.listenTo(OUTBOX_CHANNEL);

		this.logger.info('listening for outbox notifications');

		// Catch up on any rows that landed while we were down.
		this.schedule();
	}

	async onApplicationShutdown(): Promise<void> {
		await this.subscriber?.close();
	}

	private schedule(): void {
		if (this.draining) {
			this.pending = true;
			return;
		}
		this.drain().catch((err) => {
			this.logger.error({ err }, 'drain crashed');
		});
	}

	private async drain(): Promise<void> {
		this.draining = true;
		try {
			do {
				this.pending = false;
				const rows = await this.db
					.select()
					.from(schema.outbox)
					.where(isNull(schema.outbox.publishedAt))
					.orderBy(asc(schema.outbox.createdAt));

				for (const row of rows) {
					await this.publishOne(row.id, row.payload);
				}
			} while (this.pending);
		} finally {
			this.draining = false;
		}
	}

	private async publishOne(id: string, payload: unknown): Promise<void> {
		try {
			await this.sns.publish(TOPICS.ROUND_RESOLVED, {
				...(payload as object),
				outbox_id: id
			});
		} catch (err) {
			this.logger.error({ err, outbox_id: id }, 'sns publish failed');
			return;
		}

		try {
			await this.db
				.update(schema.outbox)
				.set({ publishedAt: new Date() })
				.where(eq(schema.outbox.id, id));
		} catch (err) {
			this.logger.error({ err, outbox_id: id }, 'published_at update failed');
		}
	}
}
