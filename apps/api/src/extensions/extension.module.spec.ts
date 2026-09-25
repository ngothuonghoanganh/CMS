import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PAGE_EXTENSION_PORT } from '../shared/page-extension-port';
import { ExtensionModule, PAGE_EXTENSION_PORT_PROVIDER } from './extension.module';
import { PageExtensionService } from './page-extension.service';

describe('ExtensionModule PageExtensionPort binding', () => {
  it('resolves the Core port to the existing PageExtensionService instance', async () => {
    const implementation = {} as PageExtensionService;
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PageExtensionService, useValue: implementation },
        PAGE_EXTENSION_PORT_PROVIDER,
      ],
    }).compile();

    expect(moduleRef.get(PAGE_EXTENSION_PORT)).toBe(implementation);
    expect(moduleRef.get(PageExtensionService)).toBe(implementation);
    await moduleRef.close();
  });

  it('keeps the concrete service and port as separate public module tokens', () => {
    expect(PAGE_EXTENSION_PORT_PROVIDER).toEqual({
      provide: PAGE_EXTENSION_PORT,
      useExisting: PageExtensionService,
    });
    expect(ExtensionModule).toBeDefined();
  });
});
