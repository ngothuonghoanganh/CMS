export const PAGE_PUBLISH_COMPATIBILITY = Symbol('PAGE_PUBLISH_COMPATIBILITY');

/**
 * Narrow compatibility capability for the legacy workflow subsystem. Core
 * Page code owns this contract; the workflow module may provide an adapter.
 */
export interface PagePublishCompatibility {
  validateBeforePublish(pageId: string, workspaceId: string): Promise<void>;
}
