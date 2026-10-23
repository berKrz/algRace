import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
	constructor(private readonly health: HealthService) {}

	@Get()
	async get(@Res({ passthrough: true }) res: Response) {
		const report = await this.health.check();
		res.status(
			report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE
		);
		return report;
	}
}
