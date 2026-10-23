export type HealthIndicatorResult = { ok: true } | { ok: false; error: string };

export interface HealthIndicator {
	readonly name: string;
	check(): Promise<HealthIndicatorResult>;
}
