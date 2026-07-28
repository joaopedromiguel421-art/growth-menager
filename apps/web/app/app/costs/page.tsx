import { Card, EmptyState } from "@growth-manager/ui";
import { getCosts } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { BudgetForm } from "../../../components/operation-forms";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";

export default async function CostsPage(): Promise<React.ReactNode> {
  const workspace = await loadWorkspace();
  if (!workspace.ok) return <WorkspaceError failure={workspace.failure} />;
  const tenant = workspace.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={workspace.workspace.session.user.email} />;
  const result = await getCosts(tenant.id);
  if (!result.ok) return <WorkspaceError failure={result} />;
  const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: result.data.currency
  });
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">FinOps</p>
          <h1>Custos</h1>
          <p>
            Consumo real por provedor entre {result.data.period_start} e {result.data.period_end}.
          </p>
        </div>
      </div>
      <div className="module-stats">
        <Card>
          <p className="eyebrow">Total no período</p>
          <span className="score">{money.format(result.data.total)}</span>
        </Card>
        {result.data.by_provider.map((item) => (
          <Card key={item.provider}>
            <h2>{item.provider}</h2>
            <span className="score">{money.format(item.cost)}</span>
            <p className="muted">{item.quantity} unidades consumidas</p>
          </Card>
        ))}
      </div>
      {result.data.by_provider.length === 0 ? (
        <Card>
          <EmptyState
            title="Sem consumo no período"
            description="Os custos aparecerão após a primeira operação de um provedor."
          />
        </Card>
      ) : null}
      {tenant.permissions.includes("costs.manage") ? <BudgetForm /> : null}
    </main>
  );
}
