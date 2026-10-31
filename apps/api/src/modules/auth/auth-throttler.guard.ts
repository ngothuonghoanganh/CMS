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
    const address = request.ip ?? request.socket.remoteAddress;
    if (address === undefined) {
      throw new Error('An auth request without a client address reached the throttler');
    }
    return Promise.resolve(addressNetwork(address));
  }
}
