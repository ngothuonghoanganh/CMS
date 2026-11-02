/** What "Xem thêm" uses of an infinite query (TanStack Query). */
interface PagedList {
  isFetching: boolean;
  isFetchingNextPage: boolean;
  refetch: (options: { cancelRefetch: boolean }) => Promise<unknown>;
  fetchNextPage: (options: { cancelRefetch: boolean }) => Promise<unknown>;
}

/**
 * "Xem thêm" and "Tải thêm": the next page, once a read of the whole list already running (after
 * a change such as "Xóa trang", or a server render) is done. TanStack's `fetchNextPage` would
 * cancel that read and add the page to the rows read before it: a row deleted or changed meanwhile
 * would stay. A click while the next page loads waits for it rather than loading it twice.
 */
export async function fetchNextPageAfterRead(list: PagedList): Promise<void> {
  if (list.isFetching && !list.isFetchingNextPage) {
    await list.refetch({ cancelRefetch: false });
  }
  await list.fetchNextPage({ cancelRefetch: false });
}
