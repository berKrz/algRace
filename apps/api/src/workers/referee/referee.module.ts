import { Module } from '@nestjs/common';

import { MessagingModule } from '@/messaging/messaging.module';

import { RefereeService } from './referee.service';

@Module({
	imports: [MessagingModule],
	providers: [RefereeService]
})
export class RefereeModule {}
