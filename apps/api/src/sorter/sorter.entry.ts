#!/usr/bin/env bun
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import {
	CreateTopicCommand,
	PublishCommand,
	SNSClient
} from '@aws-sdk/client-sns';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import pino from 'pino';

import * as schema from '@/database/schema';
import { TOPICS } from '@/messaging/topics';
import { algorithms, type AlgorithmName } from '@/sorting/algorithms';
import { generate, type DistributionType } from '@/sorting/dataset';

const [roundId, algorithmArg] = process.argv.slice(2);
if (!roundId || !algorithmArg) {
	console.error('Usage: sorter.entry.ts <roundId> <algorithm>');
	process.exit(2);
}

const algorithm = algorithmArg as AlgorithmName;

const logger = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	transport:
		process.env.NODE_ENV !== 'production'
			? { target: 'pino-pretty' }
			: undefined
}).child({ round_id: roundId, algorithm });

async function main() {
	logger.info('starting');

	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) {
		logger.error('DATABASE_URL missing');
		process.exit(2);
	}

	const shmDir = process.env.SHM_DIR ?? '/tmp';

	const pool = new Pool({ connectionString: dbUrl });
	const db = drizzle(pool, { schema });
	const sns = new SNSClient({
		region: process.env.AWS_REGION,
		endpoint: process.env.AWS_ENDPOINT_URL
	});

	// idempotent - returns ARN whether or not the topic existed.
	const { TopicArn: progressTopicArn } = await sns.send(
		new CreateTopicCommand({ Name: TOPICS.ALGORITHM_PROGRESS })
	);
	if (!progressTopicArn) {
		logger.error('failed to resolve algorithm-progress topic ARN');
		process.exit(2);
	}

	const [round] = await db
		.select()
		.from(schema.rounds)
		.where(eq(schema.rounds.id, roundId));
	if (!round) {
		logger.error('round not found');
		process.exit(2);
	}

	const size = round.datasetSize;
	const refPath = join(shmDir, `algrace-${round.roomId}-ref.bin`);

	logger.info(
		{
			seed: round.datasetSeed,
			size,
			distribution: round.distributionType,
			ref_path: refPath
		},
		'fetched round params'
	);

	// Allocate shared working buffer; regenerate dataset from seed into it.
	// The reference bytes on disk were produced from the same seed by the
	// round-prep worker, so an unsorted working view compared against the
	// reference view gives us the baseline "% already in place" naturally.
	const workingSAB = new SharedArrayBuffer(size * 4);
	const workingView = new Int32Array(workingSAB);

	const genStart = performance.now();
	const data = generate(
		round.datasetSeed,
		size,
		round.distributionType as DistributionType,
		{ min: round.valueRangeMin, max: round.valueRangeMax }
	);
	for (let i = 0; i < size; i++) workingView[i] = data[i];
	logger.info(
		{ elapsed_ms: performance.now() - genStart },
		'dataset generated'
	);

	// mmap the reference file. MAP_SHARED means all Sorter processes in this
	// round see the same physical pages via the kernel's page cache — one
	// physical copy regardless of how many algorithms run.
	const refMmapped = Bun.mmap(refPath, { shared: true });
	const refView = new Int32Array(
		refMmapped.buffer,
		refMmapped.byteOffset,
		size
	);

	// Sampler runs on the main thread; sort runs on a worker thread. They
	// share the working SAB so sampler sees mutations as they happen.
	// Progress = count of positions where working[i] === reference[i],
	// divided by size, floored to percent. Never rejects: publish failures
	// are logged, so interval ticks can fire-and-forget it safely.
	const sample = async (): Promise<void> => {
		let matches = 0;
		for (let i = 0; i < size; i++) {
			if (workingView[i] === refView[i]) matches++;
		}
		const pct = Math.floor((matches / size) * 100);
		try {
			await sns.send(
				new PublishCommand({
					TopicArn: progressTopicArn,
					Message: JSON.stringify({
						round_id: roundId,
						algorithm,
						progress: pct
					})
				})
			);
		} catch (err) {
			logger.warn({ err }, 'progress publish failed');
		}
	};

	// Baseline emission: taken before the worker exists, so it measures the
	// untouched array — the true "% already in place" starting point. Also
	// gives the Referee its first heartbeat without waiting a full tick.
	void sample();
	const sampler = setInterval(() => void sample(), 200);

	const sortFn = algorithms[algorithm];
	if (!sortFn) {
		clearInterval(sampler);
		logger.error('algorithm not implemented');
		process.exit(2);
	}

	// Spawn the sort worker and await its completion envelope.
	const executionTimeMs = await new Promise<number>((resolve, reject) => {
		const worker = new Worker(new URL('./sorter.worker.ts', import.meta.url), {
			workerData: { workingSAB, size, algorithm }
		});

		let settled = false;

		worker.on(
			'message',
			(msg: { ok: boolean; executionTimeMs?: number; err?: string }) => {
				if (settled) return;
				settled = true;
				if (msg.ok && typeof msg.executionTimeMs === 'number') {
					resolve(msg.executionTimeMs);
				} else {
					reject(new Error(msg.err ?? 'sort worker reported failure'));
				}
			}
		);

		worker.on('error', (err) => {
			if (settled) return;
			settled = true;
			reject(err);
		});

		worker.on('exit', (code) => {
			if (settled) return;
			settled = true;
			reject(new Error(`sort worker exited without message (code ${code})`));
		});
	});

	clearInterval(sampler);
	logger.info({ execution_time_ms: executionTimeMs }, 'sort complete');

	// Final emission: the array is fully sorted, so this always reads 100%.
	// Awaited (unlike interval ticks) so process.exit can't kill the publish
	// in flight. Sent before the DB write so the 100% frame is on its way
	// before the Referee can resolve the round.
	await sample();

	await db
		.update(schema.roundAlgorithms)
		.set({ executionTime: `${executionTimeMs} milliseconds` })
		.where(
			and(
				eq(schema.roundAlgorithms.roundId, roundId),
				eq(schema.roundAlgorithms.algorithm, algorithm)
			)
		);

	logger.info('exiting');
	await pool.end();
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		logger.error({ err }, 'fatal');
		process.exit(1);
	});
