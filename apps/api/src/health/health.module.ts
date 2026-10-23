import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DatabaseHealthIndicator } from './database.indicator';
import { SnsHealthIndicator } from './sns.indicator';
import { SqsHealthIndicator } from './sqs.indicator';

@Module({
	controllers: [HealthController],
	providers: [
		HealthService,
		DatabaseHealthIndicator,
		SnsHealthIndicator,
		SqsHealthIndicator
	]
})
export class HealthModule {}
