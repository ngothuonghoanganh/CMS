'use client';

import { useEffect } from 'react';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="loading-page">
      <section className="panel route-error-state" role="alert">
        <span className="eyebrow">Workspace error</span>
        <h1>We couldn’t load this workspace.</h1>
        <p className="muted">Try again, or return to the workspace overview.</p>
        <button className="button button-primary" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
