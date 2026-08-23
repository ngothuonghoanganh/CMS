import type { HealthResponse } from '@payload/contracts';

const foundation: Pick<HealthResponse, 'service' | 'version'> = {
  service: 'renderer',
  version: 'v1',
};

export default function RendererHomePage() {
  return (
    <main className="shell">
      <div className="eyebrow">{foundation.service} foundation</div>
      <h1>Public renderer shell</h1>
      <p>
        This independent application renders published PagePayloadV1 snapshots. Public
        pages use the /site-slug/page-slug route, while draft preview stays authenticated.
      </p>
      <div className="status" role="status">
        Contract version: {foundation.version}
      </div>
    </main>
  );
}
