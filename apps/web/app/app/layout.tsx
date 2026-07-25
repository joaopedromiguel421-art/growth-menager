import { Navigation } from "../../components/navigation";
import { requireAccessToken } from "../../lib/auth";

export default async function ApplicationLayout({
  children
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactNode> {
  await requireAccessToken();
  return (
    <div className="app-shell">
      <Navigation />
      <div className="app-main">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Abrir menu">
            ☰
          </button>
          <div className="topbar__tenant">
            <span>Cliente</span>
            <strong>Clínica Aurora</strong>
          </div>
          <div className="topbar__actions">
            <button aria-label="Buscar">⌕</button>
            <button aria-label="Notificações">
              ♢<span className="notification-dot" />
            </button>
            <span className="health-pill">
              <i /> Dados parciais
            </span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
