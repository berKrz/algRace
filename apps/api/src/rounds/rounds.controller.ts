import {
	Controller,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	UseGuards
} from '@nestjs/common';

import { LocalhostGuard } from '@/common/guards/localhost.guard';

import { RoundsService } from './rounds.service';

@Controller('rounds')
export class RoundsController {
	constructor(private readonly rounds: RoundsService) {}

	@Post(':id/advance')
	@HttpCode(HttpStatus.OK)
	@UseGuards(LocalhostGuard)
	async advance(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
		await this.rounds.advance(id);
	}
}
