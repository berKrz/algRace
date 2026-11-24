import { Module } from '@nestjs/common';

import { SorterModule } from '@/sorter/sorter.module';
import { GatewayModule } from '@/workers/gateway/gateway.module';

import { RoundsController } from './rounds.controller';
import { RoundsService } from './rounds.service';
import { RoundPrepService } from './round-prep.service';

@Module({
	imports: [SorterModule, GatewayModule],
	controllers: [RoundsController],
	providers: [RoundsService, RoundPrepService]
})
export class RoundsModule {}
