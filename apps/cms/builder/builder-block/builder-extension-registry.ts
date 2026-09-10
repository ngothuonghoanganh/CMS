import {
  ExtensionCapabilities,
  ExtensionIds,
  type CountdownProps,
} from '@payload/contracts';

export type BuilderExtensionElement = {
  id: string;
  extensionId: string;
  type: 'countdown';
  label: string;
  capability: string;
  defaultProps: CountdownProps;
};

export const builderExtensionElements: readonly BuilderExtensionElement[] = [
  {
    id: 'countdown',
    extensionId: ExtensionIds.DemoBuilder,
    type: 'countdown',
    label: 'Countdown',
    capability: ExtensionCapabilities.BuilderCountdown,
    defaultProps: {
      label: 'Launch countdown',
      targetAt: '2030-01-01T00:00:00.000Z',
    },
  },
];

export function builderExtensionElement(
  type: BuilderExtensionElement['type'],
): BuilderExtensionElement | undefined {
  return builderExtensionElements.find((element) => element.type === type);
}

export function isBuilderExtensionEnabled(
  type: BuilderExtensionElement['type'],
  enabledExtensionIds: ReadonlySet<string>,
): boolean {
  const element = builderExtensionElement(type);
  return element ? enabledExtensionIds.has(element.extensionId) : false;
}

export function isBuilderExtensionAvailableForPage(
  type: BuilderExtensionElement['type'],
  enabledExtensionIds: ReadonlySet<string>,
  pageExtensionState: ReadonlyMap<string, boolean>,
): boolean {
  const element = builderExtensionElement(type);
  if (!element || !enabledExtensionIds.has(element.extensionId)) return false;
  const pageState = pageExtensionState.get(element.extensionId);
  return pageState === undefined || pageState;
}
