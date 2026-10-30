import path from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SQSClient } from '@aws-sdk/client-sqs';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { AppModule } from '@/app.module';
import { DRIZZLE, type Database } from '@/database/drizzle.provider';
import * as schema from '@/database/schema';
import { QUEUE_URLS, type QueueUrlMap } from '@/messaging/messaging.tokens';
import { SnsPublisher } from '@/messaging/sns.publisher';

export interface IntegrationEnv {
	app: INestApplication;
	db: Database;
	sns: SnsPublisher;
	sqs: SQSClient;
	queueUrls: QueueUrlMap;
}

/**
 * Derive the test DB URL from the dev DATABASE_URL by appending `_test`
 * to the database name, create the DB on the cluster if it doesn't exist,
 * and point `DATABASE_URL` at it. Called before AppModule compiles so
 * the drizzle provider picks up the test DB from the start.
 */
async function ensureTestDatabase(): Promise<void> {
	const base = process.env.DATABASE_URL;
	if (!base) {
		throw new Error('DATABASE_URL missing - expected from devShell env');
	}

	const u = new URL(base);
	const devDbName = u.pathname.slice(1);
	const testDbName = devDbName.endsWith('_test')
		? devDbName
		: `${devDbName}_test`;

	// Admin connection to the server's `postgres` DB - CREATE DATABASE
	// can't run inside a transaction and can't target itself.
	u.pathname = '/postgres';
	const admin = new Pool({ connectionString: u.toString() });
	try {
		const { rows } = await admin.query(
			'SELECT 1 FROM pg_database WHERE datname = $1',
			[testDbName]
		);
		if (rows.length === 0) {
			// CREATE DATABASE can't be parameterized; the name is derived
			// from an env-vouched source, but quote-escape as hygiene.
			const quoted = '"' + testDbName.replace(/"/g, '""') + '"';
			await admin.query(`CREATE DATABASE ${quoted}`);
		}
	} finally {
		await admin.end();
	}

	u.pathname = `/${testDbName}`;
	process.env.DATABASE_URL = u.toString();
}

async function runMigrations(): Promise<void> {
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	try {
		await migrate(drizzle(pool, { schema }), {
			migrationsFolder: path.resolve(__dirname, '../../migrations')
		});
	} finally {
		await pool.end();
	}
}

/**
 * Boot a Nest app pointed at the test DB and the namespaced MiniStack
 * resources. Returns handles to the providers integration tests reach
 * for most often.
 *
 * Any env writes a test needs to influence config (e.g.
 * `REFEREE_WARMUP_MS`) must happen before calling this.
 */
export async function setupIntegrationApp(): Promise<IntegrationEnv> {
	if (process.env.NODE_ENV !== 'test') {
		throw new Error(
			'Integration tests must run under NODE_ENV=test ' +
				'(set by the `test` script in root package.json).'
		);
	}
	if (!process.env.AWS_ENDPOINT_URL) {
		throw new Error('AWS_ENDPOINT_URL missing - is MiniStack up?');
	}

	// Quiet the logs by default; a test can override before calling us.
	if (!process.env.LOG_LEVEL) {
		process.env.LOG_LEVEL = 'warn';
	}

	await ensureTestDatabase();
	await runMigrations();

	const moduleRef = await Test.createTestingModule({
		imports: [AppModule]
	}).compile();

	const app = moduleRef.createNestApplication();
	await app.init();

	return {
		app,
		db: app.get(DRIZZLE),
		sns: app.get(SnsPublisher),
		sqs: app.get(SQSClient),
		queueUrls: app.get(QUEUE_URLS)
	};
}

/**
 * Wipe all mutable state between tests. Queues aren't purged - MiniStack's
 * `PurgeQueue` is rate-limited to once per 60s per queue, and because
 * `NODE_ENV=test` gives us namespace-isolated `test_*` queues, stale
 * messages belong to since-truncated rounds and are harmlessly ignored
 * by the Referee's evaluate pass.
 */
export async function truncateAll(db: Database): Promise<void> {
	await db.execute(
		sql`TRUNCATE outbox, round_algorithms, rounds, rooms RESTART IDENTITY CASCADE`
	);
}
