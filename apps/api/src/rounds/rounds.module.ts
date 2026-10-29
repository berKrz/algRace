import { Module } from '@nestjs/common';

import { SorterModule } from '@/sorter/sorter.module';

import { RoundsController } from './rounds.controller';
import { RoundsService } from './rounds.service';

@Module({
	imports: [SorterModule],
	controllers: [RoundsController],
	providers: [RoundsService]
})
export class RoundsModule {}
