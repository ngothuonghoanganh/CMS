import { getModelToken } from '@nestjs/mongoose';

export function tenantModelToken(name: string): string {
  return getModelToken(name);
}

export function masterModelToken(name: string): string {
  return getModelToken(name, 'MasterConnection');
}
