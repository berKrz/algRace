import { Global, Inject, Module, OnModuleInit } from '@nestjs/common';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PinoLogger } from 'nestjs-pino';

import { DRIZZLE, drizzleProvider, type Database } from './drizzle.provider';

@Global()
@Module({
	providers: [drizzleProvider],
	exports: [DRIZZLE]
})
export class DatabaseModule implements OnModuleInit {
	constructor(
		@Inject(DRIZZLE) private readonly db: Database,
		private readonly logger: PinoLogger
	) {
		this.logger.setContext(DatabaseModule.name);
	}

	async onModuleInit() {
		this.logger.info('Running database migrations');
		await migrate(this.db, { migrationsFolder: './migrations' });
		this.logger.info('Database migrations complete');
	}
}
