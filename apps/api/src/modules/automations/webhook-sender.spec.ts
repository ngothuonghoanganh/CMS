import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebhookError, WebhookSender } from './webhook-sender.js';

describe('WebhookSender with a test receiver (E2E, ADR-034)', () => {
  let server: Server;
  let receiver: string;
  const received: Array<{ headers: IncomingHttpHeaders; body: string }> = [];
  const answers: number[] = [];

  beforeAll(async () => {
    server = createServer((incoming, answer) => {
      let body = '';
      incoming.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      incoming.on('end', () => {
        received.push({ headers: incoming.headers, body });
        answer.writeHead(answers.shift() ?? 204).end('kept nowhere');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    receiver = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hooks`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('sends to the receiver what the address would get, and keeps its status only', async () => {
    const sender = new WebhookSender({ WEBHOOK_TEST_RECEIVER: receiver });
    const status = await sender.send({
      url: 'https://crm.example.vn/api/leads',
      headers: { 'x-plp-event': 'lead_created' },
      body: '{"version":1}',
    });
    expect(status).toBe(204);
    expect(received.at(-1)).toMatchObject({
      body: '{"version":1}',
      headers: {
        'content-type': 'application/json',
        'x-plp-event': 'lead_created',
        'x-plp-target': 'https://crm.example.vn/api/leads',
      },
    });

    answers.push(500);
    await expect(
      sender.send({ url: 'https://crm.example.vn/api/leads', headers: {}, body: '{}' }),
    ).rejects.toMatchObject({ code: 'http_error', retryable: true, httpStatus: 500 });
  });

  it('still refuses an address outside HTTPS on 443', async () => {
    const sender = new WebhookSender({ WEBHOOK_TEST_RECEIVER: receiver });
    const sent = received.length;
    await expect(
      sender.send({ url: 'http://crm.example.vn/', headers: {}, body: '{}' }),
    ).rejects.toBeInstanceOf(WebhookError);
    expect(received).toHaveLength(sent);
  });
});
