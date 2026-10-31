import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { addressNetwork } from '../../shared/visitor-address.js';

/**
 * The per-address limit of `/auth/*` (ADR-004), counted like the visitor limits of ADR-016: per
 * IPv4 address or per IPv6 /64 network, so a client cannot rotate addresses within its /64, and
 * one address written two ways is one bucket.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Request): Promise<string> {
    return Promise.resolve(addressNetwork(trackedAddress(request)));
  }
}

/**
 * The address a request counts under. Behind a trusted edge (`TRUST_PROXY_HOPS`), Express takes
 * `req.ip` from `X-Forwarded-For` without checking it, so a client can send any text there. Such a
 * request counts under the socket address (the proxy) instead: every sender of garbage then shares
 * one bucket and cannot open a fresh one per string.
 */
function trackedAddress(request: Request): string {
  const forwarded = request.ip;
  if (forwarded !== undefined && isIP(forwarded) !== 0) {
    return forwarded;
  }
  const socket = request.socket.remoteAddress;
  if (socket !== undefined && isIP(socket) !== 0) {
    return socket;
  }
  // Neither address is logged: one of them is whatever the client wrote.
  throw new Error('An auth request without a valid client or socket address reached the throttler');
}
