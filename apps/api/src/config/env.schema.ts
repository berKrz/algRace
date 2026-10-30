import { Type } from 'class-transformer';
import {
	IsString,
	IsNotEmpty,
	IsOptional,
	IsIn,
	IsUrl,
	IsInt,
	Min
} from 'class-validator';

export class EnvSchema {
	@IsString()
	@IsNotEmpty()
	DATABASE_URL!: string;

	@IsOptional()
	@IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
	LOG_LEVEL: string = 'info';

	@IsString()
	@IsNotEmpty()
	AWS_REGION!: string;

	@IsOptional()
	@IsUrl({ require_tld: false, require_protocol: true })
	AWS_ENDPOINT_URL?: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Type(() => Number)
	REFEREE_WARMUP_MS: number = 500;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Type(() => Number)
	REFEREE_HEARTBEAT_WINDOW_MS: number = 1000;
}
