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

export interface ProgressSink {
	confirmed: number;
}

export type SortFn = (arr: number[], progress?: ProgressSink) => void;

export const algorithms: Partial<Record<AlgorithmName, SortFn>> = {
	bubble: bubbleSort
};
