import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { EnvSchema } from '@/config/env.schema.ts';

@Module({
	imports: [
		LoggerModule.forRootAsync({
			inject: [EnvSchema],
			useFactory: (env: EnvSchema) => ({
				pinoHttp: {
					level: env.LOG_LEVEL,
					transport:
						process.env.NODE_ENV !== 'production'
							? {
									target: 'pino-pretty',
									options: {
										singleLine: false,
										translateTime: 'HH:MM:ss.l',
										ignore: 'pid,hostname'
									}
								}
							: undefined
				}
			})
		})
	]
})
export class AppLoggerModule {}
