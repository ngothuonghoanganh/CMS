'use client';

export default function RendererError() {
  return (
    <main className="renderer-message" data-renderer-state="error">
      <h1>Page unavailable</h1>
      <p>This page could not be loaded right now.</p>
    </main>
  );
}
