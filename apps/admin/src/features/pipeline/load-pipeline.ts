import { type ContactOptionsResponse, endpoints, type PipelineResponse } from '@plp/contracts';
import { serverApi } from '../../lib/server-api';

export interface PipelineData {
  pipeline: PipelineResponse;
  options: ContactOptionsResponse;
  /** When the data was loaded (epoch ms): its age for the query cache and "quá hạn". */
  loadedAt: number;
}

/** Server-side load of screen 24: every owner's board and the owner filter's choices. */
export async function loadPipelineData(siteId: string): Promise<PipelineData> {
  const [pipeline, options] = await Promise.all([
    serverApi(endpoints.pipeline, [siteId], { query: {} }),
    serverApi(endpoints.contactOptions, [siteId]),
  ]);
  return { pipeline, options, loadedAt: Date.now() };
}
