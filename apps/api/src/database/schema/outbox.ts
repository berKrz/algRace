import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const outbox = pgTable('outbox', {
	id: uuid('id').primaryKey().defaultRandom(),
	payload: jsonb('payload').notNull(),
	publishedAt: timestamp('published_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true })
		.notNull()
		.defaultNow()
});
