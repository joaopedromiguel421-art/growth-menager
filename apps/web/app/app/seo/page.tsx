import { Suspense } from "react";
import { Badge, Card, EmptyState } from "@growth-manager/ui";
import Link from "next/link";
import type { SeoAnalysisRun, SeoFinding, SeoTarget } from "@growth-manager/contracts";
import { getSeoBaseline, listSeoFindings, listSeoHistory, listSeoTargets } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { SubmitButton } from "../../../components/submit-button";
import { createSeoTargetAction, runSeoAnalysisAction } from "./actions";

const severityTone = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
  info: "neutral"
} as const;

function FindingCard({ finding }: { readonly finding: SeoFinding }): React.ReactNode {
  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">{finding.code}</p>
          <h2>{finding.title}</h2>
        </div>
        <Badge tone={severityTone[finding.severity]}>{finding.severity}</Badge>
      </div>
      <p>{finding.description}</p>
      <p className="muted">
        Confiança {Math.round(finding.confidence.score * 100)}% · {finding.evidence_ids.length}{" "}
        evidência(s) · {finding.status}
      </p>
      <p>
        <strong>Recomendação:</strong> {finding.recommendation}
      </p>
    </Card>
  );
}

function RunCard({ run }: { readonly run: SeoAnalysisRun }): React.ReactNode {
  const tone = run.status === "succeeded" ? "success" : run.status === "failed" ? "danger" : "info";
  return (
    <Card>
      <div className="card-heading">
        <strong>{run.mode}</strong>
        <Badge tone={tone}>{run.status}</Badge>
      </div>
      <p className="muted">
        Cobertura {Math.round(run.coverage * 100)}% · custo {run.currency}{" "}
        {run.actual_cost.toFixed(4)}
      </p>
      <small>
        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
          new Date(run.created_at)
        )}
      </small>
    </Card>
  );
}

// The page coordinates independent empty, permission, target, finding and history states.
// eslint-disable-next-line complexity
export default async function SeoPage({
  searchParams
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}): Promise<React.ReactNode> {
  const workspace = await loadWorkspace();
  if (!workspace.ok) return <WorkspaceError failure={workspace.failure} />;
  const tenant = workspace.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={workspace.workspace.session.user.email} />;
  const params = await searchParams;
  const targets = await listSeoTargets(tenant.id);
  if (!targets.ok) return <WorkspaceError failure={targets} />;
  const selectedId = typeof params.target === "string" ? params.target : targets.data[0]?.id;
  const selected = targets.data.find((target) => target.id === selectedId);
  const error = typeof params.error === "string" ? params.error : null;
  const canManage = tenant.permissions.includes("seo.manage");
  const canRun = tenant.permissions.includes("seo.run");

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Evolução e regressões</p>
          <h1>Monitoramento SEO</h1>
          <p>Achados verificáveis, execução condicional e histórico por cliente.</p>
        </div>
      </div>
      {error === null ? null : (
        <Card>
          <EmptyState title="Não foi possível concluir" description={error} />
        </Card>
      )}
      {canManage ? (
        <Card>
          <form action={createSeoTargetAction}>
            <label htmlFor="seo-url">
              <strong>Adicionar site</strong>
            </label>
            <div className="card-actions">
              <input
                id="seo-url"
                name="url"
                placeholder="https://exemplo.com.br"
                required
                type="url"
              />
              <SubmitButton className="primary-button" pendingLabel="Adicionando…">
                Monitorar site
              </SubmitButton>
            </div>
          </form>
        </Card>
      ) : null}
      {targets.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum site monitorado"
            description="Cadastre a origem principal para criar o baseline inicial."
          />
        </Card>
      ) : (
        <Card>
          <div className="card-actions">
            {targets.data.map((target) => (
              <Link
                className="tertiary-button"
                href={`/app/seo?target=${target.id}`}
                key={target.id}
              >
                {target.normalized_origin}
              </Link>
            ))}
          </div>
        </Card>
      )}
      {selected === undefined ? null : (
        <Suspense
          fallback={
            <Card className="skeleton-card">
              <p className="muted">Carregando detalhes do monitoramento…</p>
            </Card>
          }
        >
          <SeoDetail canRun={canRun} selected={selected} tenantId={tenant.id} />
        </Suspense>
      )}
    </main>
  );
}

async function SeoDetail({
  tenantId,
  selected,
  canRun
}: {
  readonly tenantId: string;
  readonly selected: SeoTarget;
  readonly canRun: boolean;
}): Promise<React.ReactNode> {
  const detail = await Promise.all([
    listSeoFindings(tenantId),
    listSeoHistory(tenantId, selected.id),
    getSeoBaseline(tenantId, selected.id)
  ]);
  const findings = detail[0].ok
    ? detail[0].data.filter((finding) => finding.target_id === selected.id)
    : [];
  const history = detail[1].ok ? detail[1].data : [];
  const baseline = detail[2].ok ? detail[2].data : null;

  return (
    <>
      <Card>
        <div className="card-heading">
          <div>
            <p className="eyebrow">Site ativo</p>
            <h2>{selected.normalized_origin}</h2>
          </div>
          <Badge tone={selected.status === "active" ? "success" : "neutral"}>
            {selected.status}
          </Badge>
        </div>
        <p className="muted">
          Baseline:{" "}
          {baseline === null
            ? "ainda não criado"
            : `${baseline.status} (${String(Math.round(baseline.coverage * 100))}%)`}
        </p>
        {canRun ? (
          <form action={runSeoAnalysisAction}>
            <input name="target_id" type="hidden" value={selected.id} />
            <SubmitButton className="primary-button" pendingLabel="Iniciando…">
              Executar análise
            </SubmitButton>
          </form>
        ) : null}
      </Card>
      <section>
        <h2>Achados</h2>
        <div className="dashboard-grid">
          {findings.length > 0 ? (
            findings.map((finding) => <FindingCard finding={finding} key={finding.id} />)
          ) : (
            <Card>
              <EmptyState
                title="Sem achados"
                description="Execute a primeira análise para coletar evidências."
              />
            </Card>
          )}
        </div>
      </section>
      <section>
        <h2>Histórico</h2>
        <div className="dashboard-grid">
          {history.length > 0 ? (
            history.map((run) => <RunCard key={run.id} run={run} />)
          ) : (
            <Card>
              <EmptyState
                title="Sem execuções"
                description="O histórico aparecerá após a primeira análise."
              />
            </Card>
          )}
        </div>
      </section>
    </>
  );
}
