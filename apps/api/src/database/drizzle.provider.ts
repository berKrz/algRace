import { Provider } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { EnvSchema } from '@/config/env.schema';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type Database = NodePgDatabase<typeof schema>;

export const drizzleProvider: Provider = {
	provide: DRIZZLE,
	inject: [EnvSchema],
	useFactory: (env: EnvSchema): Database => {
		const pool = new Pool({ connectionString: env.DATABASE_URL });
		return drizzle(pool, { schema });
	}
};
