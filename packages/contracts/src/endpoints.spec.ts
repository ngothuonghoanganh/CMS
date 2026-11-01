import { describe, expect, it } from 'vitest';
import { endpoints } from './endpoints.js';

const SITE_ID = '64b000000000000000000001';
const ID = '64b000000000000000000002';

describe('endpoints', () => {
  it('reaches data of a workspace database through its site (ADR-025)', () => {
    const paths = [
      endpoints.getPage.path(SITE_ID, ID),
      endpoints.saveDraft.path(SITE_ID, ID),
      endpoints.publish.path(SITE_ID, ID),
      endpoints.movePointer.path(SITE_ID, ID),
      endpoints.createPreviewLink.path(SITE_ID, ID),
      endpoints.getLead.path(SITE_ID, ID),
      endpoints.deleteLeadPerson.path(SITE_ID, ID),
      endpoints.getDataRequest.path(SITE_ID, ID),
      endpoints.completeDataRequest.path(SITE_ID, ID),
      endpoints.undoActivity.path(SITE_ID, ID),
      endpoints.updateAsset.path(SITE_ID, ID),
    ];
    for (const path of paths) {
      expect(path.startsWith(`/sites/${SITE_ID}/`)).toBe(true);
      expect(path).toContain(`/${ID}`);
    }
    expect(endpoints.undoActivity.path(SITE_ID, ID)).toBe(`/sites/${SITE_ID}/activity/${ID}/undo`);
    expect(endpoints.updateAsset.path(SITE_ID, ID)).toBe(`/sites/${SITE_ID}/assets/${ID}`);
  });
});
