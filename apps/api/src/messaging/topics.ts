export const TOPICS = {
	ALGORITHM_PROGRESS: 'algorithm-progress',
	ROUND_RESOLVED: 'round-resolved'
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

export const QUEUES = {
	GATEWAY_ALGORITHM_PROGRESS: 'gateway-algorithm-progress',
	REFEREE_ALGORITHM_PROGRESS: 'referee-algorithm-progress',
	SETTLER_ROUND_RESOLVED: 'settler-round-resolved'
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const QUEUE_SUBSCRIPTIONS: Record<QueueName, TopicName> = {
	[QUEUES.GATEWAY_ALGORITHM_PROGRESS]: TOPICS.ALGORITHM_PROGRESS,
	[QUEUES.REFEREE_ALGORITHM_PROGRESS]: TOPICS.ALGORITHM_PROGRESS,
	[QUEUES.SETTLER_ROUND_RESOLVED]: TOPICS.ROUND_RESOLVED
};
