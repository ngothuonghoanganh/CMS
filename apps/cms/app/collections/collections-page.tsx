'use client';

import {
  AssetListResponseSchema,
  SiteListResponseSchema,
  type Asset,
  type Site,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { collectionPath, cmsViewPath } from '../cms-routes';
import { ApiClientError, api } from '../lib/api';
import { CollectionsView } from './collections-view';

export default function CollectionsPage({
  siteId,
  collectionId,
  collectionAction,
  entryId,
  entryAction,
}: {
  siteId?: string;
  collectionId?: string;
  collectionAction?: 'create' | 'schema';
  entryId?: string;
  entryAction?: 'create' | 'edit';
}) {
  const router = useRouter();
  const { workspaceId, can } = useCmsShell();
  const [sites, setSites] = useState<Site[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeSiteId, setActiveSiteId] = useState(siteId ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([
      api.get(`/workspaces/${workspaceId}/sites?limit=100&offset=0`),
      can('asset.read')
        ? api.get(`/workspaces/${workspaceId}/assets?limit=100`)
        : Promise.resolve(null),
    ])
      .then(([siteResponse, assetResponse]) => {
        const nextSites = SiteListResponseSchema.parse(siteResponse).items;
        setSites(nextSites);
        setActiveSiteId(siteId ?? nextSites[0]?.id ?? '');
        if (assetResponse) setAssets(AssetListResponseSchema.parse(assetResponse).items);
      })
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof ApiClientError
            ? caughtError.message
            : 'Unable to load collections context.',
        ),
      );
  }, [can, siteId, workspaceId]);
  const closeCollection = () => {
    if (!activeSiteId) return;
    router.replace(
      collectionId && collectionAction === 'schema'
        ? collectionPath(workspaceId, activeSiteId, collectionId)
        : collectionPath(workspaceId, activeSiteId),
    );
  };
  const closeEntry = () => {
    if (activeSiteId && collectionId)
      router.replace(collectionPath(workspaceId, activeSiteId, collectionId, 'entries'));
  };
  return (
    <>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <CollectionsView
        assets={assets}
        canCreate={can('collection.create') && can('entry.create')}
        canDelete={can('collection.delete')}
        canPublish={can('entry.publish')}
        canUpdate={can('collection.update') && can('entry.update')}
        onCloseCollectionEditor={closeCollection}
        onCloseEntry={closeEntry}
        onCreateCollection={() =>
          activeSiteId && router.push(`${collectionPath(workspaceId, activeSiteId)}/new`)
        }
        onCreateEntry={(id) =>
          activeSiteId &&
          (id || collectionId) &&
          router.push(
            `${collectionPath(workspaceId, activeSiteId, id || collectionId, 'entries')}/new`,
          )
        }
        onEditEntry={(id, idCollection) =>
          activeSiteId &&
          (idCollection || collectionId) &&
          router.push(
            `${collectionPath(workspaceId, activeSiteId, idCollection || collectionId, 'entries')}/${id}/edit`,
          )
        }
        onEditSchema={(id) =>
          activeSiteId &&
          router.push(collectionPath(workspaceId, activeSiteId, id, 'schema'))
        }
        onSelectCollection={(id) =>
          activeSiteId &&
          router.push(collectionPath(workspaceId, activeSiteId, id, 'entries'))
        }
        onSelectSite={(id) => {
          setActiveSiteId(id);
          router.push(`${cmsViewPath(workspaceId, 'collections', id)}`);
        }}
        {...(collectionAction ? { routeCollectionAction: collectionAction } : {})}
        {...(collectionId ? { routeCollectionId: collectionId } : {})}
        {...(entryAction ? { routeEntryAction: entryAction } : {})}
        {...(entryId ? { routeEntryId: entryId } : {})}
        selectedSiteId={activeSiteId}
        sites={sites}
        workspaceId={workspaceId}
      />
    </>
  );
}
