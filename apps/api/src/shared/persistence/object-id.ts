import { Types } from 'mongoose';
import { notFound } from '../errors.js';

export type ObjectId = Types.ObjectId;

export function isObjectIdString(value: string): boolean {
  return /^[a-f0-9]{24}$/.test(value);
}

/** Parses an id from a URL or body. An invalid id cannot exist, so it is reported as not found. */
export function toObjectId(value: string, notFoundTitle?: string): ObjectId {
  if (!isObjectIdString(value)) {
    throw notFound(notFoundTitle);
  }
  return new Types.ObjectId(value);
}

export function newObjectId(): ObjectId {
  return new Types.ObjectId();
}
