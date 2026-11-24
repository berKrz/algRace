import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { EnvSchema } from '@/config/env.schema';
import type { DistributionType } from '@/sorting/dataset';

interface PrepParams {
	seed: number;
	size: number;
	distribution: DistributionType;
	range: { min: number; max: number };
}

const FILE_PREFIX = 'algrace-';
const FILE_SUFFIX = '-ref.bin';

@Injectable()
export class RoundPrepService implements OnApplicationBootstrap {
	constructor(
		private readonly env: EnvSchema,
		private readonly logger: PinoLogger
	) {
		this.logger.setContext(RoundPrepService.name);
	}

	async onApplicationBootstrap(): Promise<void> {
		try {
			const entries = await readdir(this.env.SHM_DIR);
			let swept = 0;
			for (const name of entries) {
				if (!name.startsWith(FILE_PREFIX) || !name.endsWith(FILE_SUFFIX))
					continue;
				await rm(join(this.env.SHM_DIR, name));
				swept++;
			}
			if (swept > 0) {
				this.logger.info(
					{ swept, dir: this.env.SHM_DIR },
					'swept stale reference files'
				);
			}
		} catch (err) {
			this.logger.warn({ err, dir: this.env.SHM_DIR }, 'shm sweep failed');
		}
	}

	referencePath(roomId: string): string {
		return join(this.env.SHM_DIR, `${FILE_PREFIX}${roomId}${FILE_SUFFIX}`);
	}

	/**
	 * Run the prep worker: deterministic (seed, size, distribution, range) -> reference
	 * bytes on disk at `referencePath(roomId)`.
	 * Called by RoundsService.advance BEFORE committing the round-advanced state,
	 * so a prep failure leaves no DB mutation to recover.
	 * Throws on worker error / abnormal exit; caller surfaces 500 to the host and the host retries.
	 */
	async prepare(roomId: string, params: PrepParams): Promise<void> {
		const refPath = this.referencePath(roomId);

		await new Promise<void>((resolve, reject) => {
			const worker = new Worker(
				new URL('./round-prep.worker.ts', import.meta.url),
				{ workerData: { ...params, refPath } }
			);

			let settled = false;

			worker.on('message', (msg: { ok: boolean; err?: string }) => {
				if (settled) return;
				settled = true;
				if (msg.ok) resolve();
				else reject(new Error(msg.err ?? 'prep worker reported failure'));
			});

			worker.on('error', (err) => {
				if (settled) return;
				settled = true;
				reject(err);
			});

			worker.on('exit', (code) => {
				if (settled) return;
				settled = true;
				reject(new Error(`prep worker exited without message (code ${code})`));
			});
		});
	}
}
