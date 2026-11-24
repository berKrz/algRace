import { bubbleSort } from './bubble';

export type AlgorithmName =
	| 'bubble'
	| 'insertion'
	| 'merge'
	| 'quick'
	| 'tim'
	| 'counting'
	| 'radix'
	| 'heap';

export type SortFn = (view: Int32Array) => void;

export const algorithms: Partial<Record<AlgorithmName, SortFn>> = {
	bubble: bubbleSort
};
