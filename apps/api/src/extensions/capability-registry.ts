import { Injectable } from '@nestjs/common';

export type CapabilityProvider = {
  extensionId: string;
  provider?: unknown;
};

@Injectable()
export class CapabilityRegistry {
  private readonly providersByCapability = new Map<string, CapabilityProvider[]>();

  register(capability: string, extensionId: string, provider?: unknown): void {
    const providers = this.providersByCapability.get(capability) ?? [];
    const existing = providers.find((candidate) => candidate.extensionId === extensionId);
    if (existing && existing.provider === undefined && provider !== undefined) {
      existing.provider = provider;
      return;
    }
    if (existing) {
      throw new Error(`CAPABILITY_PROVIDER_DUPLICATE:${capability}:${extensionId}`);
    }
    providers.push({ extensionId, ...(provider === undefined ? {} : { provider }) });
    this.providersByCapability.set(capability, providers);
  }

  has(capability: string): boolean {
    return (this.providersByCapability.get(capability)?.length ?? 0) > 0;
  }

  providers(capability: string): readonly CapabilityProvider[] {
    return [...(this.providersByCapability.get(capability) ?? [])];
  }

  get(capability: string, extensionId?: string): CapabilityProvider | undefined {
    const providers = this.providersByCapability.get(capability) ?? [];
    return extensionId
      ? providers.find((provider) => provider.extensionId === extensionId)
      : providers[0];
  }

  resolve(capability: string, extensionId?: string): CapabilityProvider | undefined {
    return this.get(capability, extensionId);
  }
}
