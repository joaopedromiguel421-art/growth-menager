import { Badge, Card, EmptyState } from "@growth-manager/ui";
import type { ReportArtifact } from "@growth-manager/contracts";
import { getReportArtifact, listReports } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { ReportDeliveryForm, ReportForm } from "../../../components/operation-forms";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { SubmitButton } from "../../../components/submit-button";
import { submitReportAction } from "../actions";

export default async function ReportsPage(): Promise<React.ReactNode> {
  const workspace = await loadWorkspace();
  if (!workspace.ok) return <WorkspaceError failure={workspace.failure} />;
  const tenant = workspace.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={workspace.workspace.session.user.email} />;
  const result = await listReports(tenant.id);
  if (!result.ok) return <WorkspaceError failure={result} />;
  const artifactEntries = await Promise.all(
    result.data.map(async (report) => {
      if (
        report.status === "queued" ||
        report.status === "generating" ||
        report.status === "failed"
      )
        return [report.id, null] as const;
      const artifact = await getReportArtifact(tenant.id, report.id);
      return [report.id, artifact.ok ? artifact.data : null] as const;
    })
  );
  const artifactByReport = new Map(artifactEntries);
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Comprovação de valor</p>
          <h1>Relatórios</h1>
          <p>Fechamentos versionados com dados reais de {tenant.name}.</p>
        </div>
      </div>
      {tenant.permissions.includes("reports.read") ? <ReportForm /> : null}
      {result.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum fechamento"
            description="Gere o primeiro relatório para consolidar o período."
          />
        </Card>
      ) : (
        <div className="module-stats">
          {result.data.map((item) => (
            <Card key={item.id}>
              <div className="card-heading">
                <h2>
                  {item.period_start} — {item.period_end}
                </h2>
                <Badge
                  tone={
                    item.status === "published" || item.status === "approved"
                      ? "success"
                      : item.status === "failed"
                        ? "danger"
                        : "info"
                  }
                >
                  {item.status}
                </Badge>
              </div>
              <p className="muted">
                Versão {item.current_version}
                {item.first_report ? " · primeiro relatório" : ""}
              </p>
              <ReportLinks artifact={artifactByReport.get(item.id) ?? null} />
              {item.status === "draft" ? (
                <form action={submitReportAction}>
                  <input name="report_id" type="hidden" value={item.id} />
                  <SubmitButton className="tertiary-button" pendingLabel="Enviando…">
                    Enviar para aprovação
                  </SubmitButton>
                </form>
              ) : null}
              {item.status === "approved" && tenant.permissions.includes("reports.deliver") ? (
                <ReportDeliveryForm reportId={item.id} />
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

function ReportLinks({ artifact }: { readonly artifact: ReportArtifact | null }): React.ReactNode {
  if (artifact === null) return <p className="muted">A geração continua em segundo plano.</p>;
  return (
    <div className="card-actions">
      <a className="secondary-button" href={artifact.html_url} rel="noreferrer" target="_blank">
        Abrir HTML
      </a>
      {artifact.pdf_url === null ? null : (
        <a className="tertiary-button" href={artifact.pdf_url} rel="noreferrer" target="_blank">
          Baixar PDF
        </a>
      )}
    </div>
  );
}
