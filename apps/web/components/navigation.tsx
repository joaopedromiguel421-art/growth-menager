import Link from "next/link";
import { switchTenantAction } from "../app/app/actions";
import { initials, roleLabel, type Workspace } from "../lib/session";

const groups = [
  {
    label: "Decidir",
    items: [
      ["⌂", "Central", "/app"],
      ["↗", "Oportunidades", "/app/opportunities"],
      ["★", "Avaliações", "/app/reviews"]
    ]
  },
  {
    label: "Executar",
    items: [
      ["✎", "Conteúdo", "/app/content"],
      ["□", "Calendário", "/app/calendar"],
      ["✓", "Tarefas", "/app/tasks"],
      ["◎", "Aprovações", "/app/approvals"]
    ]
  },
  {
    label: "Acompanhar",
    items: [
      ["!", "Alertas", "/app/alerts"],
      ["SEO", "Monitoramento SEO", "/app/seo"],
      ["▤", "Relatórios", "/app/reports"],
      ["$", "Custos", "/app/costs"]
    ]
  },
  {
    label: "Configurar",
    items: [
      ["◫", "Clientes", "/app/clients"],
      ["⌁", "Conexões", "/app/connections"],
      ["♙", "Equipe", "/app/settings/team"],
      ["◇", "Marca", "/app/settings/brand"]
    ]
  }
] as const;

function TenantSwitcher({ workspace }: { readonly workspace: Workspace }): React.ReactNode {
  const { activeTenant, session } = workspace;
  if (activeTenant === null) {
    return (
      // Without a visible way forward, an operator with no clients sees an app
      // that appears broken rather than one waiting for its first client.
      <div className="tenant-switcher">
        <span className="tenant-switcher__avatar">—</span>
        <div>
          <strong>Nenhum cliente</strong>
          <Link href="/app/clients">Cadastrar o primeiro</Link>
        </div>
      </div>
    );
  }

  const others = session.tenants.length;
  return (
    <div className="tenant-switcher">
      <span className="tenant-switcher__avatar">{initials(activeTenant.organization_name)}</span>
      <div>
        <strong>{activeTenant.organization_name}</strong>
        <small>
          {others === 1 ? "1 cliente" : `${String(others)} clientes`} · {activeTenant.name}
        </small>
      </div>
      {others > 1 ? (
        <form action={switchTenantAction} className="tenant-switcher__form">
          <label className="sr-only" htmlFor="tenant-switch">
            Trocar de cliente
          </label>
          <select defaultValue={activeTenant.id} id="tenant-switch" name="tenant_id">
            {session.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
          <button className="tertiary-button" type="submit">
            Trocar
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function Navigation({
  workspace
}: {
  readonly workspace: Workspace | null;
}): React.ReactNode {
  return (
    <aside className="sidebar">
      <Link className="brand" href="/app">
        <span className="brand__mark">G</span>
        <span>Growth Manager</span>
      </Link>
      {workspace === null ? null : <TenantSwitcher workspace={workspace} />}
      <nav aria-label="Navegação principal">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map(([icon, label, href]) => (
              <Link href={href} key={href}>
                <span aria-hidden="true">{icon}</span>
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">
        {workspace === null ? null : (
          <div className="user-mini">
            <span>{initials(workspace.session.user.name)}</span>
            <div>
              <strong>{workspace.session.user.name}</strong>
              <small>
                {workspace.activeTenant === null
                  ? workspace.session.user.email
                  : roleLabel(workspace.activeTenant.role)}
              </small>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
