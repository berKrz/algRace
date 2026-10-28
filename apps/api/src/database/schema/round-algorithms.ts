import {
	interval,
	pgTable,
	primaryKey,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

import { algorithmEnum } from './enums';
import { rounds } from './rounds';

export const roundAlgorithms = pgTable(
	'round_algorithms',
	{
		roundId: uuid('round_id')
			.notNull()
			.references(() => rounds.id, { onDelete: 'cascade' }),
		algorithm: algorithmEnum('algorithm').notNull(),
		executionTime: interval('execution_time'),
		processMarker: varchar('process_marker')
	},
	(table) => [primaryKey({ columns: [table.roundId, table.algorithm] })]
);
