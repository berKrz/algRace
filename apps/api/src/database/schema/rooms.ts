import { char, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const rooms = pgTable('rooms', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: char('code', { length: 6 }).notNull().unique(),
	roundsTotal: integer('rounds_total').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true })
		.notNull()
		.defaultNow()
});
