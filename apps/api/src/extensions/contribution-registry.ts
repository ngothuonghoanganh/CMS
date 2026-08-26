import { Injectable } from '@nestjs/common';
import {
  ExtensionContributionEntrySchema,
  type ExtensionContributionEntry,
  type ExtensionContributionType,
} from '@payload/contracts';

export type RegisteredContribution = {
  extensionId: string;
  contribution: ExtensionContributionEntry;
  /** Trusted in-process implementation. Never serialized to tenant/public APIs. */
  provider?: unknown;
};

@Injectable()
export class ContributionRegistry {
  private readonly entries = new Map<string, RegisteredContribution>();

  register(
    extensionId: string,
    contribution: ExtensionContributionEntry,
    provider?: unknown,
  ): void {
    const parsed = ExtensionContributionEntrySchema.parse(contribution);
    const key = `${parsed.type}:${parsed.id}`;
    if (this.entries.has(key)) {
      const owner = this.entries.get(key)?.extensionId;
      throw new Error(`CONTRIBUTION_ID_DUPLICATE:${key}:${owner}`);
    }
    this.entries.set(key, {
      extensionId,
      contribution: parsed,
      ...(provider === undefined ? {} : { provider }),
    });
  }

  registerMany(
    extensionId: string,
    contributions: readonly ExtensionContributionEntry[],
  ): void {
    for (const contribution of contributions) {
      this.register(extensionId, contribution);
    }
  }

  attachProvider(
    type: ExtensionContributionType,
    id: string,
    extensionId: string,
    provider: unknown,
  ): void {
    const key = `${type}:${id}`;
    const entry = this.entries.get(key);
    if (!entry || entry.extensionId !== extensionId) {
      throw new Error(`CONTRIBUTION_PROVIDER_TARGET_INVALID:${key}:${extensionId}`);
    }
    entry.provider = provider;
  }

  has(type: ExtensionContributionType, id?: string): boolean {
    if (id) return this.entries.has(`${type}:${id}`);
    return [...this.entries.keys()].some((key) => key.startsWith(`${type}:`));
  }

  get(type: ExtensionContributionType, id: string): RegisteredContribution | undefined {
    return this.entries.get(`${type}:${id}`);
  }

  list(type?: ExtensionContributionType): readonly RegisteredContribution[] {
    const entries = [...this.entries.values()];
    return type ? entries.filter((entry) => entry.contribution.type === type) : entries;
  }

  forExtension(extensionId: string): readonly RegisteredContribution[] {
    return this.list().filter((entry) => entry.extensionId === extensionId);
  }

  clear(): void {
    this.entries.clear();
  }
}
