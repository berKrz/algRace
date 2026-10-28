import seedrandom from 'seedrandom';

export type DistributionType =
	'random' | 'nearly-sorted' | 'reversed' | 'many-duplicates' | 'large-range';

export interface ValueRange {
	min: number;
	max: number;
}

export function generate(
	seed: number,
	size: number,
	distribution: DistributionType,
	range: ValueRange
): number[] {
	const rng = seedrandom(seed.toString());

	switch (distribution) {
		case 'random':
			return randomDistribution(rng, size, range);
		case 'nearly-sorted':
		case 'reversed':
		case 'many-duplicates':
		case 'large-range':
			throw new Error(`Distribution '${distribution}' not implemented yet.`);
	}
}

function randomDistribution(
	rng: () => number,
	size: number,
	range: ValueRange
): number[] {
	const result = new Array<number>(size);
	const span = range.max - range.min + 1;

	for (let i = 0; i < size; i++)
		result[i] = Math.floor(rng() * span) + range.min;

	return result;
}
