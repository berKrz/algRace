import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

import { consumerEnum } from './enums';

export const processedEvents = pgTable(
	'processed_events',
	{
		outboxId: uuid('outbox_id').notNull(),
		consumer: consumerEnum('consumer').notNull(),
		processedAt: timestamp('processed_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(table) => [primaryKey({ columns: [table.outboxId, table.consumer] })]
);
