import { Module } from '@nestjs/common';

import { SorterSpawnerService } from './sorter-spawner.service';

@Module({
	providers: [SorterSpawnerService],
	exports: [SorterSpawnerService]
})
export class SorterModule {}
