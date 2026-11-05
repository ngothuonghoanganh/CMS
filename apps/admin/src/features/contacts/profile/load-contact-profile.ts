import {
  type ContactOptionsResponse,
  type ContactProfileResponse,
  endpoints,
  type TimelineResponse,
} from '@plp/contracts';
import { serverApi } from '../../../lib/server-api';

export interface ContactProfileData {
  profile: ContactProfileResponse;
  timeline: TimelineResponse;
  options: ContactOptionsResponse;
  /** When the data was loaded (epoch ms): its age for the query cache and "Quá hạn". */
  loadedAt: number;
}

/** Server-side load of screen 23: the profile, the first page of its timeline, the choices. */
export async function loadContactProfileData(
  siteId: string,
  contactId: string,
): Promise<ContactProfileData> {
  const [profile, timeline, options] = await Promise.all([
    serverApi(endpoints.contactProfile, [siteId, contactId]),
    serverApi(endpoints.contactTimeline, [siteId, contactId], { query: {} }),
    serverApi(endpoints.contactOptions, [siteId]),
  ]);
  return { profile, timeline, options, loadedAt: Date.now() };
}
