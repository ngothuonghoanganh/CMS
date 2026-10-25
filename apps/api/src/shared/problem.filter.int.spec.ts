import { Logger } from '@nestjs/common';
import { problemSchema } from '@plp/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../test/app.js';
import { TestClient } from '../../test/client.js';

describe('problem filter', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_problem_filter');
  });

  afterAll(async () => {
    await t.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 413 to a JSON body over the limit, without logging an unhandled error', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await new TestClient(t.app)
      .post('/auth/login', { email: 'nobody@example.com', password: 'x'.repeat(1_100_000) })
      .expect(413);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(problemSchema.parse(response.body)).toMatchObject({
      status: 413,
      code: 'payload_too_large',
      title: 'Dữ liệu gửi lên quá lớn',
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it('answers 400 to malformed JSON, without logging an unhandled error', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await new TestClient(t.app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(problemSchema.parse(response.body)).toMatchObject({
      status: 400,
      code: 'validation_failed',
      title: 'Yêu cầu không hợp lệ',
    });
    expect(logged).not.toHaveBeenCalled();
  });
});
