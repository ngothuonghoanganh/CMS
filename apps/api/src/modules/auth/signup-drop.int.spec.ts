import { Writable } from 'node:stream';
import { Types } from 'mongoose';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../../../test/app.js';
import { requestSignup, signupInput, TestClient } from '../../../test/client.js';
import { WorkspaceDatabases } from '../../shared/persistence/workspace-databases.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';

/**
 * A sign-up whose confirmation fails, and whose new database cannot be dropped either (ADR-025,
 * ADR-026). A file of its own: the first app of a test file decides where the process logs.
 */
describe('a sign-up whose database cannot be dropped either', () => {
  it('logs both failures without the personal data of the first', async () => {
    const output: string[] = [];
    const logged = await createTestApp('plp_test_ws_drop_log', {
      env: { LOG_LEVEL: 'error' },
      logDestination: new Writable({
        write(chunk: Buffer, _encoding, done) {
          output.push(chunk.toString('utf8'));
          done();
        },
      }),
    });
    // Service logs go through the app's pino logger, with its serializers, as in production.
    logged.app.useLogger(logged.app.get(PinoNestLogger));
    const email = `rieng-tu-${Types.ObjectId.createFromTime(1).toHexString()}@example.com`;
    const input = signupInput({ email });
    const token = await requestSignup(logged.app, input);
    const create = vi
      .spyOn(WorkspacesRepository.prototype, 'createWithOwner')
      // Shaped like MongoDB's: the duplicate value sits in enumerable fields a logger copies.
      .mockRejectedValueOnce(
        Object.assign(new Error('E11000 duplicate key error'), {
          code: 11000,
          keyValue: { email },
          errorResponse: { errmsg: `E11000 duplicate key: { email: "${email}" }` },
        }),
      );
    const drop = vi
      .spyOn(WorkspaceDatabases.prototype, 'drop')
      .mockRejectedValueOnce(new Error('MongoDB went away'));
    try {
      await new TestClient(logged.app).post('/auth/signup/verify', { token }).expect(500);
    } finally {
      create.mockRestore();
      drop.mockRestore();
      await logged.close();
    }

    const line = output.find((item) =>
      item.includes('Database of a workspace not created was not dropped'),
    );
    expect(line).toBeDefined();
    expect(line).toContain('MongoDB went away');
    expect(line).toContain('"cause":"Error"');
    // The duplicate key's message (which carries the email) is not copied into this line.
    expect(line).not.toContain(email);
  });
});
