import { describe, expect, it } from 'vitest';

import { isBlockedIp, resolveSafeWebhookTarget } from './webhook-security';

describe('webhook SSRF policy', () => {
  it('blocks private, loopback, link-local and metadata IPv4 ranges', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.4.5',
      '192.168.1.2',
      '169.254.169.254',
    ]) {
      expect(isBlockedIp(address), address).toBe(true);
    }
  });

  it('blocks loopback, link-local and unique-local IPv6 ranges', () => {
    for (const address of ['::1', 'fe80::1', 'fd00::1']) {
      expect(isBlockedIp(address), address).toBe(true);
    }
  });

  it('rejects local targets unless an explicit controlled-local policy is enabled', async () => {
    await expect(
      resolveSafeWebhookTarget('http://127.0.0.1:4317/hook', {
        allowHttp: true,
      }),
    ).rejects.toThrow(/local|private|metadata/i);

    await expect(
      resolveSafeWebhookTarget('http://127.0.0.1:4317/hook', {
        allowHttp: true,
        allowLocalNetwork: true,
      }),
    ).resolves.toMatchObject({ address: '127.0.0.1', family: 4 });
  });
});
