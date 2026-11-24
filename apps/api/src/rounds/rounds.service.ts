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
import type { DistributionType } from '@/sorting/dataset';
import { GatewayService } from '@/workers/gateway/gateway.service';

import { RoundPrepService } from './round-prep.service';

@Injectable()
export class RoundsService {
	constructor(
		@Inject(DRIZZLE) private readonly db: Database,
		private readonly sorter: SorterSpawnerService,
		private readonly gateway: GatewayService,
		private readonly prep: RoundPrepService
	) {}

	/**
	 * Flow:
	 *   1. Read round, validate not-already-started (pre-prep guard - cheap).
	 *   2. Run prep worker: generate dataset, sort reference, write bytes.
	 *   3. Commit the round-advanced state in a transaction, re-validating
	 *      startedAt inside the tx since (1) was outside it.
	 *   4. Register round -> room with Gateway, then fork the Sorter.
	 */
	async advance(roundId: string): Promise<void> {
		const [round] = await this.db
			.select()
			.from(schema.rounds)
			.where(eq(schema.rounds.id, roundId));

		if (!round) {
			throw new NotFoundException(`Round ${roundId} not found`);
		}
		if (round.startedAt !== null) {
			throw new ConflictException(`Round ${roundId} already advanced`);
		}

		await this.prep.prepare(round.roomId, {
			seed: round.datasetSeed,
			size: round.datasetSize,
			distribution: round.distributionType as DistributionType,
			range: { min: round.valueRangeMin, max: round.valueRangeMax }
		});

		await this.db.transaction(async (tx) => {
			const [reread] = await tx
				.select({ startedAt: schema.rounds.startedAt })
				.from(schema.rounds)
				.where(eq(schema.rounds.id, roundId));

			if (reread?.startedAt !== null) {
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

		this.gateway.registerRound(roundId, round.roomId);
		this.sorter.spawn(roundId, 'bubble');
	}
}
