function SkeletonBlock({ className = "" }: { readonly className?: string }): React.ReactNode {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function PageSkeleton(): React.ReactNode {
  return (
    <main className="page page--loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando conteúdo…</span>
      <div className="page-heading page-heading--loading">
        <div>
          <SkeletonBlock className="skeleton--eyebrow" />
          <SkeletonBlock className="skeleton--title" />
          <SkeletonBlock className="skeleton--copy" />
        </div>
      </div>
      <DashboardContentSkeleton />
    </main>
  );
}

export function DashboardContentSkeleton(): React.ReactNode {
  return (
    <div className="dashboard-loading" aria-hidden="true">
      <div className="signal-strip skeleton-signals">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <SkeletonBlock className="skeleton--icon" />
            <SkeletonBlock className="skeleton--metric" />
            <SkeletonBlock className="skeleton--label" />
          </div>
        ))}
      </div>
      <div className="dashboard-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <section className="gm-card skeleton-card" key={index}>
            <SkeletonBlock className="skeleton--eyebrow" />
            <SkeletonBlock className="skeleton--card-title" />
            <SkeletonBlock className="skeleton--copy" />
            <SkeletonBlock className="skeleton--copy skeleton--copy-short" />
          </section>
        ))}
      </div>
    </div>
  );
}

export function AppShellSkeleton(): React.ReactNode {
  return (
    <div className="app-shell app-shell--loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">Preparando seu espaço de trabalho…</span>
      <aside className="sidebar sidebar--loading" aria-hidden="true">
        <SkeletonBlock className="skeleton--brand" />
        <SkeletonBlock className="skeleton--tenant" />
        {Array.from({ length: 10 }, (_, index) => (
          <SkeletonBlock className="skeleton--nav" key={index} />
        ))}
      </aside>
      <div className="app-main">
        <header className="topbar topbar--loading" aria-hidden="true">
          <SkeletonBlock className="skeleton--topbar" />
          <SkeletonBlock className="skeleton--topbar-action" />
        </header>
        <PageSkeleton />
      </div>
    </div>
  );
}
