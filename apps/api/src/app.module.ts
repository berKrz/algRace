import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { AppLoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './messaging/messaging.module';
import { HealthModule } from './health/health.module';
import { SorterModule } from './sorter/sorter.module';

@Module({
	imports: [
		AppConfigModule,
		AppLoggerModule,
		DatabaseModule,
		MessagingModule,
		HealthModule,
		SorterModule
	]
})
export class AppModule {}
