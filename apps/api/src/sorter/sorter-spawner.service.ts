import { Injectable } from '@nestjs/common';
import type { Subprocess } from 'bun';
import { PinoLogger } from 'nestjs-pino';

import type { AlgorithmName } from '@/sorting/algorithms';

interface SorterHandle {
	subprocess: Subprocess;
	roundId: string;
	algorithm: AlgorithmName;
}

@Injectable()
export class SorterSpawnerService {
	private readonly handles = new Map<string, SorterHandle>();

	constructor(private readonly logger: PinoLogger) {
		this.logger.setContext(SorterSpawnerService.name);
	}

	spawn(roundId: string, algorithm: AlgorithmName): void {
		const key = this.makeKey(roundId, algorithm);
		if (this.handles.has(key)) {
			throw new Error(`Sorter already running for ${key}`);
		}

		const subprocess = Bun.spawn(
			['bun', 'src/sorter/sorter.entry.ts', roundId, algorithm],
			{
				stdout: 'inherit',
				stderr: 'inherit'
			}
		);

		this.handles.set(key, { subprocess, roundId, algorithm });
		this.logger.info(
			{ round_id: roundId, algorithm, pid: subprocess.pid },
			'sorter spawned'
		);

		subprocess.exited.then((code) => {
			this.handles.delete(key);
			if (code !== 0) {
				this.logger.warn(
					{ round_id: roundId, algorithm, code },
					'sorter exited non-zero'
				);
			} else {
				this.logger.debug({ round_id: roundId, algorithm }, 'sorter exited');
			}
		});
	}

	private makeKey(roundId: string, algorithm: AlgorithmName): string {
		return `${roundId}:${algorithm}`;
	}
}
