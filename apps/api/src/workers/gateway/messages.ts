import type { AlgorithmName } from '@/sorting/algorithms';

//Payload shape for the `algorithm-progress` SNS topic
//Published by the Sorter, consumed here (WS fan-out) and by the Referee (heartbeats)
export interface ProgressMessage {
	round_id: string;
	algorithm: AlgorithmName;
	progress: number;
}

// Discriminated union of every frame the server pushes to connected WebSocket clients
export type ServerMessage =
	| {
			type: 'algorithm.progress';
			round_id: string;
			algorithm: AlgorithmName;
			progress: number;
	  }
	| {
			type: 'round.finished';
			round_id: string;
			winner_algorithm: AlgorithmName | null;
	  };
