export const CORE_EVENT_PUBLISHER = Symbol('CORE_EVENT_PUBLISHER');

export type CoreEventBase = {
  tenantId: string;
  occurredAt: string;
  eventId?: string;
  correlationId?: string;
  causationId?: string;
  rootExecutionId?: string;
  requestId?: string;
};

/**
 * Events become part of this contract only as a core service migrates to it.
 * Keeping the first boundary explicit avoids making the core depend on the
 * extension platform's larger event vocabulary.
 */
export type CoreEventMap = {
  'workspace.created': CoreEventBase & {
    workspaceId: string;
  };
  'page.created': CoreEventBase & {
    pageId: string;
    workspaceId: string;
    siteId: string;
  };
  'page.updated': CoreEventBase & {
    pageId: string;
    workspaceId: string;
    versionNumber?: number;
  };
  'page.published': CoreEventBase & {
    pageId: string;
    workspaceId: string;
    versionNumber: number;
  };
};

export type CoreEventName = keyof CoreEventMap;

export interface CoreEventPublisher {
  publish<K extends CoreEventName>(eventName: K, event: CoreEventMap[K]): Promise<void>;
}
