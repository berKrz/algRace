import { parentPort, workerData } from 'node:worker_threads';

import {
	computeStats,
	generate,
	sortReference,
	type DistributionType
} from '@/sorting/dataset';

interface PrepParams {
	seed: number;
	size: number;
	distribution: DistributionType;
	range: { min: number; max: number };
	refPath: string;
}

/**
 * Prep worker: generate dataset from seed, compute stats, sort a copy for the
 * reference buffer, write bytes to the shared mmap file.
 *
 * Posts `{ ok: true }` on success, `{ ok: false, err }` on any failure.
 * The reference file is the only artifact
 **/
async function main(): Promise<void> {
	const { seed, size, distribution, range, refPath } = workerData as PrepParams;

	const data = generate(seed, size, distribution, range);

	computeStats(data);

	const sorted = sortReference(data);
	const bytes = new Uint8Array(
		sorted.buffer,
		sorted.byteOffset,
		sorted.byteLength
	);
	await Bun.write(refPath, bytes);

	parentPort!.postMessage({ ok: true });
}

main().catch((err) => {
	parentPort!.postMessage({
		ok: false,
		err: err instanceof Error ? err.message : String(err)
	});
});
