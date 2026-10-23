import createSubscriber, { Subscriber } from 'pg-listen';

import { EnvSchema } from '@/config/env.schema';

export function createPgListener(env: EnvSchema): Subscriber {
	return createSubscriber({ connectionString: env.DATABASE_URL });
}
