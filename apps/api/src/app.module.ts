import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { AppLoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './messaging/messaging.module';
import { HealthModule } from './health/health.module';
import { SorterModule } from './sorter/sorter.module';
import { RoundsModule } from './rounds/rounds.module';
import { OutboxPubModule } from './workers/outbox-pub/outbox-pub.module';
import { RefereeModule } from './workers/referee/referee.module';

@Module({
	imports: [
		AppConfigModule,
		AppLoggerModule,
		DatabaseModule,
		MessagingModule,
		HealthModule,
		SorterModule,
		RoundsModule,
		OutboxPubModule,
		RefereeModule
	]
})
export class AppModule {}
