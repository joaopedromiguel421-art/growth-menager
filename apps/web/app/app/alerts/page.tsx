import { Badge, Card, EmptyState } from "@growth-manager/ui";
import { listAlerts } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { SubmitButton } from "../../../components/submit-button";
import { updateAlertAction } from "../actions";

export default async function AlertsPage(): Promise<React.ReactNode> {
  const workspace = await loadWorkspace();
  if (!workspace.ok) return <WorkspaceError failure={workspace.failure} />;
  const tenant = workspace.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={workspace.workspace.session.user.email} />;
  const result = await listAlerts(tenant.id);
  if (!result.ok) return <WorkspaceError failure={result} />;
  const canWrite = tenant.permissions.includes("tasks.write");
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operação</p>
          <h1>Alertas</h1>
          <p>Sinais acionáveis, deduplicados e com responsável.</p>
        </div>
      </div>
      {result.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Tudo sob controle"
            description="Nenhum alerta foi detectado para este cliente."
          />
        </Card>
      ) : (
        <div className="module-stats">
          {result.data.map((item) => (
            <Card key={item.id}>
              <div className="card-heading">
                <h2>{item.title}</h2>
                <Badge
                  tone={
                    item.severity === "critical"
                      ? "danger"
                      : item.severity === "warning"
                        ? "warning"
                        : "info"
                  }
                >
                  {item.severity}
                </Badge>
              </div>
              <p className="muted">
                {item.occurrences} ocorrência(s) · {item.status}
              </p>
              {canWrite && item.status === "open" ? (
                <div className="card-actions">
                  <form action={updateAlertAction}>
                    <input name="alert_id" type="hidden" value={item.id} />
                    <input name="version" type="hidden" value={item.version} />
                    <input name="status" type="hidden" value="acknowledged" />
                    <SubmitButton className="secondary-button" pendingLabel="Registrando…">
                      Reconhecer
                    </SubmitButton>
                  </form>
                  <form action={updateAlertAction}>
                    <input name="alert_id" type="hidden" value={item.id} />
                    <input name="version" type="hidden" value={item.version} />
                    <input name="status" type="hidden" value="resolved" />
                    <SubmitButton className="tertiary-button" pendingLabel="Resolvendo…">
                      Resolver
                    </SubmitButton>
                  </form>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
