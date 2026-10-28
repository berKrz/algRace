import { describe, expect, it } from 'bun:test';

import { bubbleSort } from '@/sorting/algorithms/bubble';
import { generate } from '@/sorting/dataset/generate';

function isSorted(arr: number[]): boolean {
	for (let i = 1; i < arr.length; i++) {
		if (arr[i - 1] > arr[i]) return false;
	}
	return true;
}

describe('bubbleSort', () => {
	it('handles an empty array', () => {
		const arr: number[] = [];
		bubbleSort(arr);
		expect(arr).toEqual([]);
	});

	it('sorts an array with duplicates', () => {
		const arr = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];
		bubbleSort(arr);
		expect(arr).toEqual([1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 9]);
	});

	it('leaves an already-sorted array sorted (exits on first pass)', () => {
		const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		bubbleSort(arr);
		expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it('sorts a nearly-sorted array (exercises early exit)', () => {
		const arr = [1, 2, 3, 5, 4, 6, 7, 8, 9, 10];
		bubbleSort(arr);
		expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it('sorts a reversed array (worst case)', () => {
		const arr = [5, 4, 3, 2, 1];
		bubbleSort(arr);
		expect(arr).toEqual([1, 2, 3, 4, 5]);
	});

	it('sorts a generated random dataset', () => {
		const arr = generate(42, 1000, 'random', { min: 0, max: 10_000 });
		bubbleSort(arr);
		expect(isSorted(arr)).toBe(true);
	});
});
