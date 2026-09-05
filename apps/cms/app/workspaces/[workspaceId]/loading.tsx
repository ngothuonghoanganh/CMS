export default function WorkspaceLoading() {
  return (
    <main className="loading-page" aria-busy="true">
      <div className="shell-loading" aria-label="Loading CMS workspace">
        <div className="skeleton skeleton-mark" />
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-copy" />
        <div className="skeleton-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    </main>
  );
}
