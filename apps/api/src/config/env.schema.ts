import { IsString, IsNotEmpty, IsOptional, IsIn, IsUrl } from 'class-validator';

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
}
