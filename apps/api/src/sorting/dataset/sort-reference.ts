/**
 * Produce the sorted-reference Int32 view that Sorter processes mmap from
 * `/<SHM_DIR>/algrace-{roomId}-ref.bin`. The reference is what the Sorter
 * main thread's sampler compares the working buffer against to compute
 * progress as "fraction of positions matching final sorted order."
 *
 * Called once per room per round by the round-prep worker.
 */
export function sortReference(data: readonly number[]): Int32Array {
	const ref = new Int32Array(data.length);
	for (let i = 0; i < data.length; i++) ref[i] = data[i];
	ref.sort();
	return ref;
}
