import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Socket } from 'node:net';

import {
	Inject,
	Injectable,
	OnApplicationBootstrap,
	OnApplicationShutdown
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SQSClient, type Message } from '@aws-sdk/client-sqs';
import { eq } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import { WebSocket, WebSocketServer } from 'ws';

import { DRIZZLE, type Database } from '@/database/drizzle.provider';
import * as schema from '@/database/schema';
import { QUEUE_URLS, type QueueUrlMap } from '@/messaging/messaging.tokens';
import { SqsConsumer } from '@/messaging/sqs.consumer';
import { QUEUES } from '@/messaging/topics';
import type { AlgorithmName } from '@/sorting/algorithms';

import type { ProgressMessage, ServerMessage } from './messages';

const PING_INTERVAL_MS = 30_000;
const WS_PATH_PATTERN = /^\/ws\/([A-Za-z0-9]{6})$/;

interface ConnMeta {
	roomId: string;
	code: string;
	isAlive: boolean;
}

@Injectable()
export class GatewayService
	extends SqsConsumer
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private wss?: WebSocketServer;
	private upgradeHandler?: (
		req: IncomingMessage,
		socket: Socket,
		head: Buffer
	) => void;
	private pingInterval?: ReturnType<typeof setInterval>;

	private readonly roomSockets = new Map<string, Set<WebSocket>>();
	private readonly connMeta = new WeakMap<WebSocket, ConnMeta>();
	private readonly roundToRoom = new Map<string, string>();

	constructor(
		sqs: SQSClient,
		@Inject(QUEUE_URLS) queueUrls: QueueUrlMap,
		@Inject(DRIZZLE) private readonly db: Database,
		private readonly httpAdapterHost: HttpAdapterHost,
		private readonly pinoLogger: PinoLogger
	) {
		super(QUEUES.GATEWAY_ALGORITHM_PROGRESS, sqs, queueUrls, pinoLogger);
		this.pinoLogger.setContext(GatewayService.name);
	}

	onApplicationBootstrap(): void {
		super.onApplicationBootstrap();

		const server = this.httpAdapterHost.httpAdapter?.getHttpServer() as
			HttpServer | null | undefined;
		if (!server) {
			throw new Error('HTTP server not available at Gateway bootstrap');
		}

		this.wss = new WebSocketServer({ noServer: true });

		// Selective upgrade: only our WS path handshakes
		// everything else dies here so other HTTP paths remain untouched by this handler.
		this.upgradeHandler = (req, socket, head) => {
			void this.handleUpgrade(req, socket, head);
		};
		server.on('upgrade', this.upgradeHandler);

		this.pingInterval = setInterval(
			() => this.sweepLiveness(),
			PING_INTERVAL_MS
		);

		this.pinoLogger.info('gateway started');
	}

	async onApplicationShutdown(): Promise<void> {
		super.onApplicationShutdown();

		if (this.pingInterval) clearInterval(this.pingInterval);

		const server = this.httpAdapterHost.httpAdapter?.getHttpServer() as
			HttpServer | null | undefined;
		if (server && this.upgradeHandler) {
			server.off('upgrade', this.upgradeHandler);
		}

		if (this.wss) {
			for (const ws of this.wss.clients) ws.terminate();
			const wss = this.wss;
			await new Promise<void>((resolve) => wss.close(() => resolve()));
		}

		this.roomSockets.clear();
		this.roundToRoom.clear();
	}

	/**
	 * Registers the round's room so subsequent `algorithm-progress` messages
	 * can be routed to WS clients without a per-message DB lookup.
	 * */
	registerRound(roundId: string, roomId: string): void {
		this.roundToRoom.set(roundId, roomId);
	}

	broadcastRoundFinished(
		roomId: string,
		roundId: string,
		winnerAlgorithm: AlgorithmName | null
	): void {
		this.broadcastToRoom(roomId, {
			type: 'round.finished',
			round_id: roundId,
			winner_algorithm: winnerAlgorithm
		});
		this.roundToRoom.delete(roundId);
	}

	// RawMessageDelivery is set on this subscription (see MessagingModule),
	// so SQS gives us the raw payload directly.
	protected async handle(message: Message): Promise<void> {
		if (!message.Body) return;
		const payload = JSON.parse(message.Body) as ProgressMessage;

		const roomId = this.roundToRoom.get(payload.round_id);
		if (!roomId) {
			// Round not registered here - cleaned up, delivered after shutdown,
			// or arriving pre-advance due to clock skew. Nothing to forward to.
			this.pinoLogger.debug(
				{ round_id: payload.round_id },
				'progress for unknown round, dropping'
			);
			return;
		}

		this.broadcastToRoom(roomId, {
			type: 'algorithm.progress',
			round_id: payload.round_id,
			algorithm: payload.algorithm,
			progress: payload.progress
		});
	}

	private async handleUpgrade(
		req: IncomingMessage,
		socket: Socket,
		head: Buffer
	): Promise<void> {
		const url = new URL(req.url ?? '', 'http://x');
		const match = WS_PATH_PATTERN.exec(url.pathname);
		if (!match) {
			socket.destroy();
			return;
		}
		const code = match[1];

		let roomId: string;
		try {
			const [room] = await this.db
				.select({ id: schema.rooms.id })
				.from(schema.rooms)
				.where(eq(schema.rooms.code, code));
			if (!room) {
				socket.destroy();
				return;
			}
			roomId = room.id;
		} catch (err) {
			this.pinoLogger.error({ err, code }, 'upgrade DB lookup failed');
			socket.destroy();
			return;
		}

		this.wss!.handleUpgrade(req, socket, head, (ws) => {
			this.registerSocket(ws, roomId, code);
			this.wss!.emit('connection', ws, req);
		});
	}

	private registerSocket(ws: WebSocket, roomId: string, code: string): void {
		let set = this.roomSockets.get(roomId);
		if (!set) {
			set = new Set();
			this.roomSockets.set(roomId, set);
		}
		set.add(ws);
		this.connMeta.set(ws, { roomId, code, isAlive: true });

		ws.on('pong', () => {
			const meta = this.connMeta.get(ws);
			if (meta) meta.isAlive = true;
		});

		ws.on('close', () => this.removeSocket(ws));
		ws.on('error', (err) => {
			this.pinoLogger.debug({ err }, 'ws error');
			this.removeSocket(ws);
		});

		this.pinoLogger.debug({ code, room_id: roomId }, 'ws client connected');
	}

	private removeSocket(ws: WebSocket): void {
		const meta = this.connMeta.get(ws);
		if (!meta) return;
		const set = this.roomSockets.get(meta.roomId);
		if (set) {
			set.delete(ws);
			if (set.size === 0) this.roomSockets.delete(meta.roomId);
		}
		this.connMeta.delete(ws);
	}

	private sweepLiveness(): void {
		if (!this.wss) return;
		for (const ws of this.wss.clients) {
			const meta = this.connMeta.get(ws);
			if (!meta) {
				// Defensive - a client we never registered should never show up
				// in wss.clients, but if it does, we don't want it stuck here.
				ws.terminate();
				continue;
			}
			if (!meta.isAlive) {
				ws.terminate();
				continue;
			}
			meta.isAlive = false;
			ws.ping();
		}
	}

	private broadcastToRoom(roomId: string, msg: ServerMessage): void {
		const sockets = this.roomSockets.get(roomId);
		if (!sockets || sockets.size === 0) return;
		for (const ws of sockets) this.sendTo(ws, msg);
	}

	private sendTo(ws: WebSocket, msg: ServerMessage): void {
		try {
			ws.send(JSON.stringify(msg));
		} catch (err) {
			this.pinoLogger.debug({ err }, 'ws send failed');
		}
	}
}
