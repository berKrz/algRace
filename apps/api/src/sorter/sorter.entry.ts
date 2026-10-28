#!/usr/bin/env bun
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
import {
	algorithms,
	type AlgorithmName,
	type ProgressSink
} from '@/sorting/algorithms';
import { generate, type DistributionType } from '@/sorting/dataset/generate';

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

	logger.info(
		{
			seed: round.datasetSeed,
			size: round.datasetSize,
			distribution: round.distributionType
		},
		'fetched round params'
	);

	const genStart = performance.now();
	const data = generate(
		round.datasetSeed,
		round.datasetSize,
		round.distributionType as DistributionType,
		{ min: round.valueRangeMin, max: round.valueRangeMax }
	);
	logger.info(
		{ elapsed_ms: performance.now() - genStart },
		'dataset generated'
	);

	const sortFn = algorithms[algorithm];
	if (!sortFn) {
		logger.error('algorithm not implemented');
		process.exit(2);
	}

	const total = data.length;
	const progress: ProgressSink = { confirmed: 0 };

	const sampler = setInterval(() => {
		const pct = Math.min(100, Math.floor((progress.confirmed / total) * 100));
		sns
			.send(
				new PublishCommand({
					TopicArn: progressTopicArn,
					Message: JSON.stringify({
						round_id: roundId,
						algorithm,
						progress: pct
					})
				})
			)
			.catch((err) => logger.warn({ err }, 'progress publish failed'));
	}, 200);

	const sortStart = performance.now();
	try {
		sortFn(data, progress);
	} finally {
		clearInterval(sampler);
	}
	const executionTimeMs = performance.now() - sortStart;
	logger.info({ execution_time_ms: executionTimeMs }, 'sort complete');

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
