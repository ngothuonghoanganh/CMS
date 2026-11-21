import { SiteScreenSkeleton } from '../../../../../../features/shell/ScreenSkeleton';

/** Board 32 while it renders on the server: a heading and rows, not the catalog's cards. */
export default function OwnedItemsLoading() {
  return <SiteScreenSkeleton />;
}
