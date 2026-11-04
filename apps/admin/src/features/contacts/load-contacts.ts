import { type ContactListResponse, type ContactOptionsResponse, endpoints } from '@plp/contracts';
import { serverApi } from '../../lib/server-api';

export interface ContactsData {
  list: ContactListResponse;
  options: ContactOptionsResponse;
  /** When the data was loaded (epoch ms): its age for the query cache and the time labels. */
  loadedAt: number;
}

/** Server-side load of screen 22: the first page of "Tất cả" and the filters' choices. */
export async function loadContactsData(siteId: string): Promise<ContactsData> {
  const [list, options] = await Promise.all([
    serverApi(endpoints.listContacts, [siteId], { query: { view: 'all' } }),
    serverApi(endpoints.contactOptions, [siteId]),
  ]);
  return { list, options, loadedAt: Date.now() };
}
