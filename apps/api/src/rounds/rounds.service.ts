import {
	ConflictException,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DRIZZLE, type Database } from '@/database/drizzle.provider';
import * as schema from '@/database/schema';
import { SorterSpawnerService } from '@/sorter/sorter-spawner.service';

@Injectable()
export class RoundsService {
	constructor(
		@Inject(DRIZZLE) private readonly db: Database,
		private readonly sorter: SorterSpawnerService
	) {}

	async advance(roundId: string): Promise<void> {
		await this.db.transaction(async (tx) => {
			const [round] = await tx
				.select()
				.from(schema.rounds)
				.where(eq(schema.rounds.id, roundId));

			if (!round) {
				throw new NotFoundException(`Round ${roundId} not found`);
			}
			if (round.startedAt !== null) {
				throw new ConflictException(`Round ${roundId} already advanced`);
			}

			await tx
				.update(schema.rounds)
				.set({ startedAt: new Date() })
				.where(eq(schema.rounds.id, roundId));

			await tx.insert(schema.roundAlgorithms).values({
				roundId,
				algorithm: 'bubble'
			});
		});

		this.sorter.spawn(roundId, 'bubble');
	}
}
