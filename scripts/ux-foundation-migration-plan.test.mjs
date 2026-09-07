import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicUuid,
  normalizeSiteDesignSystemOverride,
  planCollectionMigrations,
  planNavigationMigrations,
} from './ux-foundation-migration-plan.mjs';

const legacy = (id, siteId, key = 'main') => ({
  _id: id,
  workspaceId: 'workspace-1',
  siteId,
  key,
});

test('collection collision planning is deterministic and preserves every record id', () => {
  const records = [legacy('collection-b', 'site-b'), legacy('collection-a', 'site-a')];
  const first = planCollectionMigrations(records);
  const second = planCollectionMigrations([...records].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((item) => item.collectionId),
    ['collection-a', 'collection-b'],
  );
  assert.notEqual(first[0].canonicalKey, first[1].canonicalKey);
});

test('navigation planning preserves legacy rows and is idempotent', () => {
  const records = [legacy('navigation-a', 'site-a'), legacy('navigation-b', 'site-b')];
  const plan = planNavigationMigrations(records);
  assert.equal(
    plan.every((item) => !item.alreadyPresent),
    true,
  );
  assert.equal(
    plan[0].canonicalId,
    deterministicUuid('navigation:workspace-1:navigation-a'),
  );
  const rerun = planNavigationMigrations(records, [
    {
      _id: plan[0].canonicalId,
      workspaceId: 'workspace-1',
      key: plan[0].canonicalKey,
      migrationSourceId: plan[0].sourceId,
    },
    {
      _id: plan[1].canonicalId,
      workspaceId: 'workspace-1',
      key: plan[1].canonicalKey,
      migrationSourceId: plan[1].sourceId,
    },
  ]);
  assert.equal(
    rerun.every((item) => item.alreadyPresent),
    true,
  );
  assert.deepEqual(
    rerun.map((item) => item.canonicalId),
    plan.map((item) => item.canonicalId),
  );
});

test('legacy full design-system snapshots normalize to sparse deltas', () => {
  const workspace = {
    version: 1,
    colors: [{ id: 'primary', name: 'Primary', value: 'blue' }],
    typography: [],
    spacing: [],
    radii: [{ id: 'radius', name: 'Radius', value: '4px' }],
    shadows: [],
    containerWidths: [],
  };
  const site = {
    ...workspace,
    colors: [{ id: 'primary', name: 'Primary', value: 'purple' }],
    radii: [],
  };

  assert.deepEqual(normalizeSiteDesignSystemOverride(workspace, site), {
    version: 1,
    colors: [{ id: 'primary', name: 'Primary', value: 'purple' }],
    removedTokenIds: { radii: ['radius'] },
  });
});
