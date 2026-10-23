import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable
} from '@nestjs/common';
import { Request } from 'express';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@Injectable()
export class LocalhostGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();
		const ip = request.socket.remoteAddress ?? '';

		if (!LOOPBACK_IPS.has(ip)) {
			throw new ForbiddenException('Localhost only');
		}
		return true;
	}
}
