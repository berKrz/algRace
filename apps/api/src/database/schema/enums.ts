import { pgEnum } from 'drizzle-orm/pg-core';

export const algorithmEnum = pgEnum('algorithm', [
	'bubble',
	'insertion',
	'merge',
	'quick',
	'tim',
	'counting',
	'radix',
	'heap'
]);

export const consumerEnum = pgEnum('consumer', ['settler', 'referee']);
