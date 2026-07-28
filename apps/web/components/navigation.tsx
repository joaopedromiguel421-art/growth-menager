"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { switchTenantAction } from "../app/app/actions";
import type { Workspace } from "../lib/session";
import { initials, roleLabel } from "../lib/workspace-display";

const groups = [
  {
    label: "Decidir",
    items: [
      ["CE", "Central", "/app"],
      ["OP", "Oportunidades", "/app/opportunities"],
      ["AV", "Avaliações", "/app/reviews"]
    ]
  },
  {
    label: "Executar",
    items: [
      ["CO", "Conteúdo", "/app/content"],
      ["CA", "Calendário", "/app/calendar"],
      ["TA", "Tarefas", "/app/tasks"],
      ["AP", "Aprovações", "/app/approvals"]
    ]
  },
  {
    label: "Acompanhar",
    items: [
      ["AL", "Alertas", "/app/alerts"],
      ["SE", "Monitoramento SEO", "/app/seo"],
      ["RE", "Relatórios", "/app/reports"],
      ["CU", "Custos", "/app/costs"]
    ]
  },
  {
    label: "Configurar",
    items: [
      ["CL", "Clientes", "/app/clients"],
      ["CN", "Conexões", "/app/connections"],
      ["EQ", "Equipe", "/app/settings/team"],
      ["MA", "Marca", "/app/settings/brand"]
    ]
  }
] as const;

function TenantSwitcher({ workspace }: { readonly workspace: Workspace }): React.ReactNode {
  const { activeTenant, session } = workspace;
  if (activeTenant === null) {
    return (
      <div className="tenant-switcher">
        <span className="tenant-switcher__avatar">+</span>
        <div>
          <strong>Nenhum cliente</strong>
          <Link href="/app/clients">Cadastrar o primeiro</Link>
        </div>
      </div>
    );
  }

  const tenantCount = session.tenants.length;
  return (
    <div className="tenant-switcher">
      <span className="tenant-switcher__avatar">{initials(activeTenant.organization_name)}</span>
      <div className="tenant-switcher__copy">
        <strong>{activeTenant.organization_name}</strong>
        <small>
          {tenantCount === 1 ? "1 cliente" : `${String(tenantCount)} clientes`} ·{" "}
          {activeTenant.name}
        </small>
      </div>
      {tenantCount > 1 ? (
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
          <button className="tenant-switcher__submit" type="submit">
            Trocar
          </button>
        </form>
      ) : null}
    </div>
  );
}

function isCurrentRoute(pathname: string, href: string): boolean {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function Navigation({
  workspace
}: {
  readonly workspace: Workspace | null;
}): React.ReactNode {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setNavigating(false);
  }, [pathname]);

  return (
    <>
      {navigating ? (
        <div className="route-progress" role="progressbar" aria-label="Carregando página" />
      ) : null}
      <button
        aria-controls="app-sidebar"
        aria-expanded={menuOpen}
        aria-label="Abrir menu"
        className="mobile-menu"
        onClick={() => {
          setMenuOpen(true);
        }}
        type="button"
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      {menuOpen ? (
        <button
          aria-label="Fechar menu pela área externa"
          className="sidebar-scrim"
          onClick={() => {
            setMenuOpen(false);
          }}
          type="button"
        />
      ) : null}
      <aside className={`sidebar${menuOpen ? " sidebar--open" : ""}`} id="app-sidebar">
        <div className="sidebar__brand-row">
          <Link
            className="brand"
            href="/app"
            onClick={() => {
              setNavigating(pathname !== "/app");
            }}
          >
            <span className="brand__mark">GM</span>
            <span>Growth Manager</span>
          </Link>
          <button
            aria-label="Fechar menu"
            className="sidebar__close"
            onClick={() => {
              setMenuOpen(false);
            }}
            type="button"
          >
            ×
          </button>
        </div>
        {workspace === null ? null : <TenantSwitcher workspace={workspace} />}
        <nav aria-label="Navegação principal">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(([icon, label, href]) => {
                const current = isCurrentRoute(pathname, href);
                return (
                  <Link
                    aria-current={current ? "page" : undefined}
                    href={href}
                    key={href}
                    onClick={() => {
                      setMenuOpen(false);
                      setNavigating(!current);
                    }}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {icon}
                    </span>
                    <span className="nav-label">{label}</span>
                  </Link>
                );
              })}
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
    </>
  );
}
