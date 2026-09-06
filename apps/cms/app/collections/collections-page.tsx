'use client';

import { useRouter } from 'next/navigation';

import { useCmsShell } from '../cms-shell';
import { collectionPath } from '../cms-routes';
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
  const scopedCollectionPath = (id?: string, child?: 'entries' | 'schema' | 'settings') =>
    collectionPath(workspaceId, siteId, id, child);
  const closeCollection = () => {
    router.replace(
      collectionId && collectionAction === 'schema'
        ? scopedCollectionPath(collectionId)
        : scopedCollectionPath(),
    );
  };
  const closeEntry = (savedEntryId?: string) => {
    if (collectionId)
      router.replace(
        savedEntryId
          ? `${scopedCollectionPath(collectionId, 'entries')}/${savedEntryId}`
          : entryAction === 'edit' && entryId
            ? `${scopedCollectionPath(collectionId, 'entries')}/${entryId}`
            : scopedCollectionPath(collectionId, 'entries'),
      );
  };
  return (
    <CollectionsView
      canCreateCollection={can('collection.create')}
      canCreateEntry={can('entry.create')}
      canDelete={can('collection.delete')}
      canPublish={can('entry.publish')}
      canUpdateCollection={can('collection.update')}
      canUpdateEntry={can('entry.update')}
      onCloseCollectionEditor={closeCollection}
      onCloseEntry={closeEntry}
      onCreateCollection={() => router.push(`${scopedCollectionPath()}/new`)}
      onCreateEntry={(id) =>
        (id || collectionId) &&
        router.push(`${scopedCollectionPath(id || collectionId, 'entries')}/new`)
      }
      onEditEntry={(id, idCollection) =>
        (idCollection || collectionId) &&
        router.push(
          `${scopedCollectionPath(idCollection || collectionId, 'entries')}/${id}/edit`,
        )
      }
      onEditSchema={(id) => router.push(scopedCollectionPath(id, 'schema'))}
      onSelectCollection={(id) => router.push(scopedCollectionPath(id, 'entries'))}
      {...(collectionAction ? { routeCollectionAction: collectionAction } : {})}
      {...(collectionId ? { routeCollectionId: collectionId } : {})}
      {...(entryAction ? { routeEntryAction: entryAction } : {})}
      {...(entryId ? { routeEntryId: entryId } : {})}
      {...(siteId ? { siteId } : {})}
      workspaceId={workspaceId}
    />
  );
}
