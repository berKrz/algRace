import { parentPort, workerData } from 'node:worker_threads';

import { algorithms, type AlgorithmName } from '@/sorting/algorithms';

interface WorkerInput {
	workingSAB: SharedArrayBuffer;
	size: number;
	algorithm: AlgorithmName;
}

/**
 * Sort worker: synchronous sort of the working view, timed on this thread.
 * The main thread's sampler reads the same SharedArrayBuffer while the sort
 * runs and emits progress messages - this thread never touches SNS, DB, or
 * logs, keeping the measured timing as pure as possible.
 */
const { workingSAB, size, algorithm } = workerData as WorkerInput;

const view = new Int32Array(workingSAB, 0, size);
const sortFn = algorithms[algorithm];

if (!sortFn) {
	parentPort!.postMessage({
		ok: false,
		err: `algorithm not implemented: ${algorithm}`
	});
} else {
	try {
		const start = performance.now();
		sortFn(view);
		const executionTimeMs = performance.now() - start;
		parentPort!.postMessage({ ok: true, executionTimeMs });
	} catch (err) {
		parentPort!.postMessage({
			ok: false,
			err: err instanceof Error ? err.message : String(err)
		});
	}
}
