import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test
} from 'bun:test';

import { and, eq } from 'drizzle-orm';

import * as schema from '@/database/schema';
import { TOPICS } from '@/messaging/topics';

import {
	setupIntegrationApp,
	truncateAll,
	type IntegrationEnv
} from './helpers';

const WARMUP_MS = 500;
const HEARTBEAT_WINDOW_MS = 200;

describe('Referee integration', () => {
	let env: IntegrationEnv;

	beforeAll(async () => {
		// Must be set before AppModule compiles - EnvSchema reads them then.
		process.env.REFEREE_WARMUP_MS = String(WARMUP_MS);
		process.env.REFEREE_HEARTBEAT_WINDOW_MS = String(HEARTBEAT_WINDOW_MS);
		env = await setupIntegrationApp();
	}, 30_000);

	afterAll(async () => {
		await env?.app.close();
	});

	beforeEach(async () => {
		await truncateAll(env.db);
	});

	function makeRoomCode(): string {
		const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
		return Array.from(
			{ length: 6 },
			() => alphabet[Math.floor(Math.random() * alphabet.length)]
		).join('');
	}

	async function seedOpenRound(): Promise<string> {
		const [room] = await env.db
			.insert(schema.rooms)
			.values({
				code: makeRoomCode(),
				roundsTotal: 5
			})
			.returning();
		const [round] = await env.db
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
		const [row] = await env.db
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

		await env.db
			.insert(schema.roundAlgorithms)
			.values({ roundId, algorithm: 'bubble' });

		// Simulate a Sorter completing: wait past warmup, then write
		// execution_time. The UPDATE fires NOTIFY, Referee wakes, resolves.
		await new Promise((r) => setTimeout(r, WARMUP_MS + 50));
		await env.db
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

		const outboxRows = await env.db.select().from(schema.outbox);
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
		await env.db.insert(schema.roundAlgorithms).values({
			roundId,
			algorithm: 'bubble',
			executionTime: '50 milliseconds'
		});

		// Poll for most of the warmup window - finishedAt must stay null.
		const assertNullUntil = Date.now() + WARMUP_MS - 100;
		while (Date.now() < assertNullUntil) {
			const r = await readRound(roundId);
			expect(r.finishedAt).toBeNull();
			await new Promise((res) => setTimeout(res, 25));
		}

		// Past warmup - next tick (or the one after) should resolve.
		const round = await waitFor(async () => {
			const r = await readRound(roundId);
			return r.finishedAt ? r : null;
		});

		expect(round.winnerAlgorithm).toBe('bubble');
	});

	test('resolves as no-winner when progress goes silent past the heartbeat window', async () => {
		const roundId = await seedOpenRound();

		await env.db
			.insert(schema.roundAlgorithms)
			.values({ roundId, algorithm: 'bubble' });

		// Simulate a Sorter emitting a few progress ticks via SNS, then
		// dying. The Referee's SQS consumer records heartbeats; once they
		// go stale past the heartbeat window, the round resolves with no
		// winner.
		for (let i = 0; i < 3; i++) {
			await env.sns.publish(TOPICS.ALGORITHM_PROGRESS, {
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

		const outboxRows = await env.db.select().from(schema.outbox);
		expect(outboxRows).toHaveLength(1);
		expect(outboxRows[0].payload).toMatchObject({
			round_id: roundId,
			winner_algorithm: null
		});
	});
});
