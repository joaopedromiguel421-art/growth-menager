import { redirect } from "next/navigation";
import { Navigation } from "../../components/navigation";
import { WorkspaceError } from "../../components/workspace-error";
import { loadWorkspace } from "../../lib/session";
import { signOutAction } from "./actions";

// Every screen under /app is per-user and per-tenant: it must be rendered on
// demand, never prerendered or cached at the edge.
export const dynamic = "force-dynamic";

export default async function ApplicationLayout({
  children
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok && result.failure.status === 401) {
    redirect("/login");
  }

  const workspace = result.ok ? result.workspace : null;
  const activeTenant = workspace?.activeTenant ?? null;

  return (
    <div className="app-shell">
      <Navigation workspace={workspace} />
      <div className="app-main">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Abrir menu">
            ☰
          </button>
          <div className="topbar__tenant">
            <span>Cliente</span>
            <strong>{activeTenant?.name ?? "Nenhum cliente ativo"}</strong>
          </div>
          <div className="topbar__actions">
            {workspace === null ? null : (
              <span className="muted">{workspace.session.user.email}</span>
            )}
            <form action={signOutAction}>
              <button className="tertiary-button" type="submit">
                Sair
              </button>
            </form>
          </div>
        </header>
        {result.ok ? children : <WorkspaceError failure={result.failure} />}
      </div>
    </div>
  );
}
