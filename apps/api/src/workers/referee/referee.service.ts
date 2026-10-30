import {
	Inject,
	Injectable,
	OnApplicationBootstrap,
	OnApplicationShutdown
} from '@nestjs/common';
import { SQSClient, type Message } from '@aws-sdk/client-sqs';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import type { Subscriber } from 'pg-listen';

import { EnvSchema } from '@/config/env.schema';
import { DRIZZLE, type Database } from '@/database/drizzle.provider';
import { createPgListener } from '@/database/pg-listen.factory';
import * as schema from '@/database/schema';
import { QUEUE_URLS, type QueueUrlMap } from '@/messaging/messaging.tokens';
import { SqsConsumer } from '@/messaging/sqs.consumer';
import { QUEUES } from '@/messaging/topics';
import type { AlgorithmName } from '@/sorting/algorithms';

const CHANNEL = 'round_algorithms_change';
const TICK_INTERVAL_MS = 500;

interface ProgressMessage {
	round_id: string;
	algorithm: AlgorithmName;
	progress: number;
}

@Injectable()
export class RefereeService
	extends SqsConsumer
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly lastSeen = new Map<string, Map<AlgorithmName, number>>();
	private subscriber?: Subscriber;
	private tick?: ReturnType<typeof setInterval>;
	private evaluating = false;
	private pending = false;

	constructor(
		sqs: SQSClient,
		@Inject(QUEUE_URLS) queueUrls: QueueUrlMap,
		@Inject(EnvSchema) private readonly env: EnvSchema,
		@Inject(DRIZZLE) private readonly db: Database,
		private readonly pinoLogger: PinoLogger
	) {
		super(QUEUES.REFEREE_ALGORITHM_PROGRESS, sqs, queueUrls);
		this.pinoLogger.setContext(RefereeService.name);
	}

	async onApplicationBootstrap(): Promise<void> {
		super.onApplicationBootstrap();

		this.subscriber = createPgListener(this.env);
		this.subscriber.notifications.on(CHANNEL, () => this.schedule());
		this.subscriber.events.on('error', (err) =>
			this.pinoLogger.error({ err }, 'pg-listen error')
		);
		this.subscriber.events.on('reconnect', () => this.schedule());

		await this.subscriber.connect();
		await this.subscriber.listenTo(CHANNEL);

		this.tick = setInterval(() => this.schedule(), TICK_INTERVAL_MS);
		this.pinoLogger.info('referee started');
		this.schedule();
	}

	async onApplicationShutdown(): Promise<void> {
		super.onApplicationShutdown();
		if (this.tick) clearInterval(this.tick);
		await this.subscriber?.close();
	}

	// RawMessageDelivery is set on this subscription, so SQS gives us the raw payload directly
	protected async handle(message: Message): Promise<void> {
		if (!message.Body) return;
		const payload = JSON.parse(message.Body) as ProgressMessage;
		this.recordHeartbeat(payload.round_id, payload.algorithm);
	}

	private recordHeartbeat(roundId: string, algorithm: AlgorithmName): void {
		let perRound = this.lastSeen.get(roundId);
		if (!perRound) {
			perRound = new Map();
			this.lastSeen.set(roundId, perRound);
		}
		perRound.set(algorithm, Date.now());
	}

	private schedule(): void {
		if (this.evaluating) {
			this.pending = true;
			return;
		}
		this.evaluate().catch((err) =>
			this.pinoLogger.error({ err }, 'evaluate crashed')
		);
	}

	private async evaluate(): Promise<void> {
		this.evaluating = true;
		try {
			do {
				this.pending = false;
				const openRounds = await this.db
					.select({ id: schema.rounds.id, startedAt: schema.rounds.startedAt })
					.from(schema.rounds)
					.where(
						and(
							isNotNull(schema.rounds.startedAt),
							isNull(schema.rounds.finishedAt)
						)
					);

				for (const round of openRounds) {
					await this.evaluateRound(round.id, round.startedAt!);
				}
			} while (this.pending);
		} finally {
			this.evaluating = false;
		}
	}

	private async evaluateRound(roundId: string, startedAt: Date): Promise<void> {
		const now = Date.now();
		if (now - startedAt.getTime() < this.env.REFEREE_WARMUP_MS) return;

		const rows = await this.db
			.select({
				algorithm: schema.roundAlgorithms.algorithm,
				executionTime: schema.roundAlgorithms.executionTime
			})
			.from(schema.roundAlgorithms)
			.where(eq(schema.roundAlgorithms.roundId, roundId));

		if (rows.length === 0) return;

		const perRound = this.lastSeen.get(roundId);

		for (const row of rows) {
			if (row.executionTime !== null) continue;
			const lastSeen = perRound?.get(row.algorithm) ?? 0;
			if (now - lastSeen <= this.env.REFEREE_HEARTBEAT_WINDOW_MS) return;
		}

		await this.resolve(roundId);
	}

	private async resolve(roundId: string): Promise<void> {
		await this.db.transaction(async (tx) => {
			const [winnerRow] = await tx
				.select({ algorithm: schema.roundAlgorithms.algorithm })
				.from(schema.roundAlgorithms)
				.where(
					and(
						eq(schema.roundAlgorithms.roundId, roundId),
						isNotNull(schema.roundAlgorithms.executionTime)
					)
				)
				.orderBy(asc(schema.roundAlgorithms.executionTime))
				.limit(1);

			const winnerAlgorithm = winnerRow?.algorithm ?? null;

			const updated = await tx
				.update(schema.rounds)
				.set({ winnerAlgorithm, finishedAt: new Date() })
				.where(
					and(eq(schema.rounds.id, roundId), isNull(schema.rounds.finishedAt))
				)
				.returning({ id: schema.rounds.id });

			if (updated.length === 0) return;

			await tx.insert(schema.outbox).values({
				payload: { round_id: roundId, winner_algorithm: winnerAlgorithm }
			});

			this.pinoLogger.info(
				{ round_id: roundId, winner_algorithm: winnerAlgorithm },
				'round resolved'
			);
		});

		this.lastSeen.delete(roundId);
	}
}
