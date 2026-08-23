import { describe, expect, it } from 'vitest';

import { IntegrationSecretVault } from './integration-secret-vault';

describe('IntegrationSecretVault', () => {
  it('encrypts and decrypts without storing plaintext', () => {
    const vault = new IntegrationSecretVault('unit-test-key-with-at-least-32-characters');
    const ciphertext = vault.encrypt('webhook-secret-value');

    expect(ciphertext).not.toContain('webhook-secret-value');
    expect(vault.decrypt(ciphertext)).toBe('webhook-secret-value');
  });

  it('rejects tampered ciphertext', () => {
    const vault = new IntegrationSecretVault('unit-test-key-with-at-least-32-characters');
    const ciphertext = vault.encrypt('secret');
    const tampered = `${ciphertext.slice(0, -1)}x`;

    expect(() => vault.decrypt(tampered)).toThrow();
  });
});
