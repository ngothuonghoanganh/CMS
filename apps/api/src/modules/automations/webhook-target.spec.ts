import { describe, expect, it } from 'vitest';
import { isBlockedAddress, webhookTarget } from './webhook-target.js';
import { WebhookSender, isRetryableStatus } from './webhook-sender.js';

describe('webhook targets (ADR-034)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:a00:1',
    'not-an-ip',
  ])('refuses %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['93.184.215.14', '8.8.8.8', '2606:4700:4700::1111'])('lets %s through', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('takes HTTPS on port 443 only, without credentials', () => {
    expect(webhookTarget('https://crm.example.com/api/leads?x=1')?.hostname).toBe(
      'crm.example.com',
    );
    expect(webhookTarget('https://crm.example.com:443/a')).not.toBeNull();
    expect(webhookTarget('http://crm.example.com/a')).toBeNull();
    expect(webhookTarget('https://crm.example.com:8443/a')).toBeNull();
    expect(webhookTarget('https://user:pass@crm.example.com/a')).toBeNull();
    expect(webhookTarget('not a url')).toBeNull();
  });

  it('tries 408, 429 and 5xx again, other answers not', () => {
    expect([408, 429, 500, 503].map(isRetryableStatus)).toEqual([true, true, true, true]);
    expect([400, 401, 404, 410].map(isRetryableStatus)).toEqual([false, false, false, false]);
  });

  it('never connects to this machine, whatever name points there', async () => {
    const sender = new WebhookSender({});
    await expect(
      sender.send({ url: 'https://localhost/hook', headers: {}, body: '{}' }),
    ).rejects.toMatchObject({
      code: 'blocked_address',
      retryable: false,
    });
    await expect(
      sender.send({ url: 'https://127.0.0.1/hook', headers: {}, body: '{}' }),
    ).rejects.toMatchObject({
      code: 'blocked_address',
    });
    await expect(
      sender.send({ url: 'https://[::1]/hook', headers: {}, body: '{}' }),
    ).rejects.toMatchObject({
      code: 'blocked_address',
    });
    await expect(
      sender.send({ url: 'http://example.com/hook', headers: {}, body: '{}' }),
    ).rejects.toMatchObject({
      code: 'invalid_url',
    });
  });
});
