'use client';

import '@plp/ui/tokens.css';
import './globals.css';
import { CenteredPage } from '../features/shell/CenteredPage';
import { RouteError } from '../features/shell/RouteError';

/** The root layout itself failed: this replaces it, so it renders its own document. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="vi">
      <body>
        <title>Không tải được trang · Payload</title>
        <CenteredPage>
          <RouteError error={error} retry={retry} />
        </CenteredPage>
      </body>
    </html>
  );
}
