import type { Request } from 'express';

import type { AuthPrincipal } from '@payload/contracts';

export interface PlatformRequest extends Request {
  auth?: AuthPrincipal;
  requestId?: string;
}
