import type { ProgressSink } from './index.ts';

export function bubbleSort(arr: number[], progress?: ProgressSink): void {
	const n = arr.length;

	for (let i = 0; i < n - 1; i++) {
		let swapped = false;
		for (let j = 0; j < n - 1 - i; j++) {
			if (arr[j] > arr[j + 1]) {
				const tmp = arr[j];
				arr[j] = arr[j + 1];
				arr[j + 1] = tmp;
				swapped = true;
			}
		}
		if (!swapped) {
			if (progress) progress.confirmed = n;
			break;
		}
		if (progress) progress.confirmed = i + 1;
	}
}
