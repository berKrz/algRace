import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { AppLoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './messaging/messaging.module';
import { HealthModule } from './health/health.module';

@Module({
	imports: [
		AppConfigModule,
		AppLoggerModule,
		DatabaseModule,
		MessagingModule,
		HealthModule
	]
})
export class AppModule {}
