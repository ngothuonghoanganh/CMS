import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnvInput } from '../../../test/env.js';
import { parseEnv } from '../../config/env.js';

/**
 * What an anonymous client can do with the asset bucket of the running storage (docker compose,
 * ADR-012): read objects under `public/`, nothing else. No listing, so object keys cannot be
 * discovered from the bucket itself; no writes, no deletes, no policy.
 */
describe('asset bucket, seen anonymously', () => {
  const env = parseEnv(testEnvInput({ MONGODB_URI: 'mongodb://localhost:1/unused' }));
  const bucketUrl = `${env.S3_ENDPOINT.replace(/\/+$/, '')}/${env.S3_BUCKET}`;
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  const probe = randomUUID();
  const publicKey = `public/exposure-probe/${probe}.txt`;
  const privateKey = `exposure-probe/${probe}.txt`;

  beforeAll(async () => {
    for (const key of [publicKey, privateKey]) {
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: `probe ${probe}`,
          ContentType: 'text/plain',
        }),
      );
    }
  });

  afterAll(async () => {
    for (const key of [publicKey, privateKey]) {
      await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    }
    client.destroy();
  });

  /** Status of an unsigned request, as any visitor could send it. */
  async function anonymous(path: string, init: RequestInit = {}): Promise<number> {
    const response = await fetch(`${bucketUrl}${path}`, init);
    await response.arrayBuffer();
    return response.status;
  }

  it('serves an object under public/ to anyone', async () => {
    const response = await fetch(`${bucketUrl}/${publicKey}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`probe ${probe}`);
  });

  it('refuses an object outside public/', async () => {
    expect(await anonymous(`/${privateKey}`)).toBe(403);
  });

  it('lists nothing, in any form, not even the public prefix', async () => {
    for (const query of [
      '',
      '/',
      '?list-type=2',
      '?list-type=2&prefix=public/',
      '?prefix=public/exposure-probe/',
      '?versions',
      '?uploads',
    ]) {
      expect({ query, status: await anonymous(query) }).toEqual({ query, status: 403 });
    }
    expect(await anonymous('', { method: 'HEAD' })).toBe(403);
  });

  it('reveals no bucket settings', async () => {
    for (const query of ['?policy', '?acl', '?cors', '?location']) {
      expect({ query, status: await anonymous(query) }).toEqual({ query, status: 403 });
    }
  });

  it('accepts no write and no delete, even under public/', async () => {
    const planted = `public/exposure-probe/${probe}-planted.txt`;
    expect(await anonymous(`/${planted}`, { method: 'PUT', body: 'planted' })).toBe(403);
    expect(await anonymous(`/${publicKey}`, { method: 'DELETE' })).toBe(403);
    await expect(
      client.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: planted })),
    ).rejects.toMatchObject({ name: 'NotFound' });
    await client.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: publicKey }));
  });
});
