import type { CustomExtensionDefinition, ExtensionManifest } from '@payload/contracts';

export function customExtensionManifest(
  definition: CustomExtensionDefinition,
): ExtensionManifest {
  return {
    id: definition.id,
    name: definition.name,
    version: definition.version,
    apiVersion: '1',
    ...(definition.description ? { description: definition.description } : {}),
    capabilities: ['custom.banner'],
    dependencies: [],
    permissions: [],
    contributions: {
      builder: {
        elements: [
          {
            id: `${definition.id}.banner`,
            label: definition.name,
            nodeType: 'extension',
            capability: 'custom.banner',
            propertyKeys: [],
          },
        ],
        blocks: [],
        actions: [],
        dataBindings: [],
      },
      page: {
        settings: [],
        hooks: [],
        slots: [],
      },
      renderer: {
        runtimeIds: [],
        styleAssetIds: [],
        slots: [],
      },
    },
  };
}
