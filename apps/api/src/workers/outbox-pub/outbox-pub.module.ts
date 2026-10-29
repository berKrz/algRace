import { Module } from '@nestjs/common';

import { MessagingModule } from '@/messaging/messaging.module';

import { OutboxPubService } from './outbox-pub.service';

@Module({
	imports: [MessagingModule],
	providers: [OutboxPubService]
})
export class OutboxPubModule {}
