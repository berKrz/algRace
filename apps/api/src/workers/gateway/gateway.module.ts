import { Module } from '@nestjs/common';

import { MessagingModule } from '@/messaging/messaging.module';

import { GatewayService } from './gateway.service';

@Module({
	imports: [MessagingModule],
	providers: [GatewayService],
	exports: [GatewayService]
})
export class GatewayModule {}
