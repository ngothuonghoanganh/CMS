import { describe, expect, it } from 'vitest';

import { TenantContext } from '../tenancy/tenant-context';
import { CapabilityRegistry } from './capability-registry';
import { ContributionRegistry } from './contribution-registry';
import { EventBus } from './event-bus';
import { ExtensionRegistry, type PlatformExtension } from './extension-registry';
import { demoBuilderExtension } from './demo-extensions';

function registry(
  extensions: readonly PlatformExtension[] = [],
  contributions?: ContributionRegistry,
): ExtensionRegistry {
  const capabilities = new CapabilityRegistry();
  const events = new EventBus(new TenantContext());
  return new ExtensionRegistry(extensions, capabilities, events, contributions);
}

function manifest(id: string): PlatformExtension {
  return {
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      apiVersion: '1',
      capabilities: [],
      dependencies: [],
      permissions: [],
    },
  };
}

describe('ExtensionRegistry', () => {
  it('registers valid extensions and rejects duplicate or invalid manifests', () => {
    const current = registry([manifest('example')]);
    expect(current.has('example')).toBe(true);
    expect(() => current.register(manifest('example'))).toThrow('EXTENSION_ID_DUPLICATE');
    expect(() =>
      current.register({ manifest: { ...manifest('bad').manifest, id: 'Bad ID' } }),
    ).toThrow();
  });

  it('validates dependencies and exposes capabilities after lifecycle initialization', async () => {
    const missing = manifest('dependent');
    missing.manifest.dependencies = [{ extensionId: 'missing', version: '>=1.0.0' }];
    const missingRegistry = registry([missing]);
    expect(() => missingRegistry.validate()).toThrow('EXTENSION_DEPENDENCY_MISSING');

    const capabilities = new CapabilityRegistry();
    const contributions = new ContributionRegistry();
    const events = new EventBus(new TenantContext());
    const initialized = new ExtensionRegistry(
      [demoBuilderExtension],
      capabilities,
      events,
      contributions,
    );
    await initialized.onModuleInit();
    expect(initialized.lifecycle(demoBuilderExtension.manifest.id)).toBe('active');
    expect(capabilities.has('builder.element.countdown')).toBe(true);
    expect(
      initialized.contribution(demoBuilderExtension.manifest.id)?.builder?.elements,
    ).toHaveLength(1);
    expect(initialized.runtime(demoBuilderExtension.manifest.id).runtimeIds).toEqual([
      'countdown.runtime',
    ]);
    expect(contributions.get('builder.element', 'countdown')).toMatchObject({
      extensionId: demoBuilderExtension.manifest.id,
    });

    const providerExtension = {
      ...manifest('provider'),
      register(context: { capabilities: CapabilityRegistry }) {
        context.capabilities.register('example.capability', 'provider', {
          trusted: true,
        });
      },
    };
    const withProvider = new ExtensionRegistry([providerExtension], capabilities, events);
    await withProvider.onModuleInit();
    expect(capabilities.get('example.capability', 'provider')?.provider).toEqual({
      trusted: true,
    });
  });

  it('detects circular dependencies', () => {
    const first = manifest('first');
    const second = manifest('second');
    first.manifest.dependencies = [{ extensionId: 'second', version: '1.0.0' }];
    second.manifest.dependencies = [{ extensionId: 'first', version: '1.0.0' }];
    expect(() => registry([first, second]).validate()).toThrow(
      'EXTENSION_DEPENDENCY_CYCLE',
    );
  });

  it('orders package initialization after its dependencies', async () => {
    const dependency = manifest('dependency');
    const consumer = manifest('consumer');
    consumer.manifest.dependencies = [{ extensionId: 'dependency', version: '^1.0.0' }];
    const initialized = registry([consumer, dependency]);
    await initialized.onModuleInit();
    expect(initialized.loadOrder()).toEqual(['dependency', 'consumer']);
  });

  it('validates normalized package definitions against their manifest', () => {
    const extension = manifest('package');
    extension.definition = {
      manifest: { ...extension.manifest, id: 'other-package' },
      contributions: [],
    };
    expect(() => registry([extension])).toThrow('EXTENSION_DEFINITION_MANIFEST_MISMATCH');
  });
});
