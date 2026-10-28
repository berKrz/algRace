import { Global, Module } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { EnvSchema } from './env.schema';

function validate(raw: Record<string, unknown>): EnvSchema {
	const parsed = plainToInstance(EnvSchema, raw, {
		enableImplicitConversion: true
	});
	const errors = validateSync(parsed, { skipMissingProperties: false });
	if (errors.length > 0) {
		throw new Error(
			`Environment validation failed:\n${errors.map((e) => e.toString()).join('\n')}`
		);
	}
	return parsed;
}

@Global()
@Module({
	providers: [
		{
			provide: EnvSchema,
			useFactory: () => validate(process.env)
		}
	],
	exports: [EnvSchema]
})
export class AppConfigModule {}
