import Link from "next/link";

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
      ["▤", "Relatórios", "/app/reports"],
      ["$", "Custos", "/app/costs"]
    ]
  },
  {
    label: "Configurar",
    items: [
      ["⌁", "Conexões", "/app/connections"],
      ["♙", "Equipe", "/app/settings/team"],
      ["◇", "Marca", "/app/settings/brand"]
    ]
  }
] as const;

export function Navigation(): React.ReactNode {
  return (
    <aside className="sidebar">
      <Link className="brand" href="/app">
        <span className="brand__mark">G</span>
        <span>Growth Manager</span>
      </Link>
      <div className="tenant-switcher">
        <span className="tenant-switcher__avatar">AM</span>
        <div>
          <strong>Agência Modelo</strong>
          <small>3 clientes ativos</small>
        </div>
        <span aria-hidden="true">⌄</span>
      </div>
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
        <a href="mailto:suporte@growthmanager.com.br">? Central de ajuda</a>
        <div className="user-mini">
          <span>JM</span>
          <div>
            <strong>João Miguel</strong>
            <small>Gestor</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
