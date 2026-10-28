import { describe, expect, it } from 'bun:test';

import { generate } from '@/sorting/dataset/generate';

describe('generate', () => {
	it('returns an array of the requested size', () => {
		const arr = generate(42, 1000, 'random', { min: 0, max: 999 });
		expect(arr.length).toBe(1000);
	});

	it('produces identical arrays from the same seed', () => {
		const a = generate(12345, 500, 'random', { min: 0, max: 1_000_000 });
		const b = generate(12345, 500, 'random', { min: 0, max: 1_000_000 });
		expect(a).toEqual(b);
	});

	it('produces different arrays from different seeds', () => {
		const a = generate(1, 100, 'random', { min: 0, max: 999 });
		const b = generate(2, 100, 'random', { min: 0, max: 999 });
		expect(a).not.toEqual(b);
	});

	it('respects the value range (inclusive on both ends)', () => {
		const arr = generate(7, 10_000, 'random', { min: -50, max: 50 });
		for (const v of arr) {
			expect(v).toBeGreaterThanOrEqual(-50);
			expect(v).toBeLessThanOrEqual(50);
		}
	});

	it('throws for distributions not yet implemented', () => {
		expect(() =>
			generate(1, 100, 'nearly-sorted', { min: 0, max: 99 })
		).toThrow(/not implemented/);
	});
});
