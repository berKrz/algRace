import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test
} from 'bun:test';
import path from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PurgeQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { AppModule } from '@/app.module';
import { DRIZZLE, type Database } from '@/database/drizzle.provider';
import * as schema from '@/database/schema';
import { QUEUE_URLS, type QueueUrlMap } from '@/messaging/messaging.tokens';
import { SnsPublisher } from '@/messaging/sns.publisher';
import { QUEUES, TOPICS } from '@/messaging/topics';

process.env.LOG_LEVEL = 'warn';

const WARMUP_MS = 500;
const HEARTBEAT_WINDOW_MS = 200;

describe('Referee integration', () => {
	let app: INestApplication;
	let db: Database;
	let sns: SnsPublisher;
	let sqs: SQSClient;
	let queueUrls: QueueUrlMap;

	beforeAll(async () => {
		const databaseUrl = process.env.DATABASE_URL;
		const ministackUrl = process.env.AWS_ENDPOINT_URL;
		if (!databaseUrl || !ministackUrl) {
			throw new Error(
				'Integration tests expect DATABASE_URL and AWS_ENDPOINT_URL from the direnv devShell. ' +
					'Make sure `bun run db:up` and `bun run ministack:up` have run.'
			);
		}

		// Migrations are idempotent via drizzle's journal — safe to re-run on
		// every test boot against the dev DB.
		const migrationPool = new Pool({ connectionString: databaseUrl });
		try {
			await migrate(drizzle(migrationPool, { schema }), {
				migrationsFolder: path.resolve(__dirname, '../../migrations')
			});
		} finally {
			await migrationPool.end();
		}

		process.env.REFEREE_WARMUP_MS = String(WARMUP_MS);
		process.env.REFEREE_HEARTBEAT_WINDOW_MS = String(HEARTBEAT_WINDOW_MS);

		const moduleRef = await Test.createTestingModule({
			imports: [AppModule]
		}).compile();

		app = moduleRef.createNestApplication();
		await app.init();

		db = app.get(DRIZZLE);
		sns = app.get(SnsPublisher);
		sqs = app.get(SQSClient);
		queueUrls = app.get(QUEUE_URLS);
	}, 30_000);

	afterAll(async () => {
		await app?.close();
	});

	beforeEach(async () => {
		await db.execute(
			sql`TRUNCATE outbox, round_algorithms, rounds, rooms RESTART IDENTITY CASCADE`
		);
		for (const name of Object.values(QUEUES)) {
			const url = queueUrls.get(name)!;
			// PurgeQueue is rate-limited to once per 60s per queue. If it
			// fails, we inherit a few stale messages, which the tests
			// tolerate (progress for a since-truncated round is harmless).
			await sqs.send(new PurgeQueueCommand({ QueueUrl: url })).catch(() => {});
		}
	});

	async function seedOpenRound(): Promise<string> {
		const [room] = await db
			.insert(schema.rooms)
			.values({
				code: Array.from(
					{ length: 6 },
					() =>
						'abcdefghijklmnopqrstuvwxyz0123456789'[
							Math.floor(Math.random() * 36)
						]
				).join(''),
				roundsTotal: 5
			})
			.returning();
		const [round] = await db
			.insert(schema.rounds)
			.values({
				roomId: room.id,
				number: 1,
				datasetSeed: 42,
				datasetSize: 10,
				distributionType: 'random',
				valueRangeMin: 0,
				valueRangeMax: 100,
				startedAt: new Date()
			})
			.returning();
		return round.id;
	}

	async function readRound(roundId: string) {
		const [row] = await db
			.select()
			.from(schema.rounds)
			.where(eq(schema.rounds.id, roundId));
		return row;
	}

	async function waitFor<T>(
		check: () => Promise<T | null | undefined>,
		timeout = 3000,
		interval = 25
	): Promise<T> {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const result = await check();
			if (result !== null && result !== undefined) return result;
			await new Promise((r) => setTimeout(r, interval));
		}
		throw new Error(`waitFor timed out after ${timeout}ms`);
	}

	test('resolves a round when an algorithm finishes', async () => {
		const roundId = await seedOpenRound();

		await db
			.insert(schema.roundAlgorithms)
			.values({ roundId, algorithm: 'bubble' });

		// Simulate a Sorter completing: wait past warmup, then write
		// execution_time. The UPDATE fires NOTIFY, Referee wakes, resolves.
		await new Promise((r) => setTimeout(r, WARMUP_MS + 50));
		await db
			.update(schema.roundAlgorithms)
			.set({ executionTime: '100 milliseconds' })
			.where(
				and(
					eq(schema.roundAlgorithms.roundId, roundId),
					eq(schema.roundAlgorithms.algorithm, 'bubble')
				)
			);

		const round = await waitFor(async () => {
			const r = await readRound(roundId);
			return r.finishedAt ? r : null;
		});

		expect(round.winnerAlgorithm).toBe('bubble');
		expect(round.finishedAt).not.toBeNull();

		const outboxRows = await db.select().from(schema.outbox);
		expect(outboxRows).toHaveLength(1);
		expect(outboxRows[0].payload).toMatchObject({
			round_id: roundId,
			winner_algorithm: 'bubble'
		});
	});

	test('does not resolve during warmup', async () => {
		const roundId = await seedOpenRound();

		// execution_time pre-set, so the only thing preventing immediate
		// resolution on the INSERT NOTIFY is the warmup guard.
		await db.insert(schema.roundAlgorithms).values({
			roundId,
			algorithm: 'bubble',
			executionTime: '50 milliseconds'
		});

		// Poll for most of the warmup window — finishedAt must stay null.
		const assertNullUntil = Date.now() + WARMUP_MS - 100;
		while (Date.now() < assertNullUntil) {
			const r = await readRound(roundId);
			expect(r.finishedAt).toBeNull();
			await new Promise((res) => setTimeout(res, 25));
		}

		// Past warmup — next tick (or the one after) should resolve.
		const round = await waitFor(async () => {
			const r = await readRound(roundId);
			return r.finishedAt ? r : null;
		});

		expect(round.winnerAlgorithm).toBe('bubble');
	});

	test('resolves as no-winner when progress goes silent past the heartbeat window', async () => {
		const roundId = await seedOpenRound();

		await db
			.insert(schema.roundAlgorithms)
			.values({ roundId, algorithm: 'bubble' });

		// Simulate a Sorter emitting a few progress ticks via SNS, then
		// dying. The Referee's SQS consumer records heartbeats; once they
		// go stale past the heartbeat window, the round resolves with no
		// winner.
		for (let i = 0; i < 3; i++) {
			await sns.publish(TOPICS.ALGORITHM_PROGRESS, {
				round_id: roundId,
				algorithm: 'bubble',
				progress: (i + 1) * 10
			});
			await new Promise((r) => setTimeout(r, 50));
		}

		const round = await waitFor(async () => {
			const r = await readRound(roundId);
			return r.finishedAt ? r : null;
		}, 5000);

		expect(round.winnerAlgorithm).toBeNull();
		expect(round.finishedAt).not.toBeNull();

		const outboxRows = await db.select().from(schema.outbox);
		expect(outboxRows).toHaveLength(1);
		expect(outboxRows[0].payload).toMatchObject({
			round_id: roundId,
			winner_algorithm: null
		});
	});
});
