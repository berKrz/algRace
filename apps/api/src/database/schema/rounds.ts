import {
	bigint,
	integer,
	pgTable,
	timestamp,
	unique,
	uuid,
	varchar
} from 'drizzle-orm/pg-core';

import { algorithmEnum } from './enums';
import { rooms } from './rooms';

export const rounds = pgTable(
	'rounds',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		roomId: uuid('room_id')
			.notNull()
			.references(() => rooms.id, { onDelete: 'cascade' }),
		number: integer('number').notNull(),
		datasetSeed: bigint('dataset_seed', { mode: 'number' }).notNull(),
		datasetSize: integer('dataset_size').notNull(),
		distributionType: varchar('distribution_type').notNull(),
		valueRangeMin: integer('value_range_min').notNull(),
		valueRangeMax: integer('value_range_max').notNull(),
		winnerAlgorithm: algorithmEnum('winner_algorithm'),
		startedAt: timestamp('started_at', { withTimezone: true }),
		finishedAt: timestamp('finished_at', { withTimezone: true })
	},
	(table) => [
		unique('rounds_room_number_unique').on(table.roomId, table.number)
	]
);
