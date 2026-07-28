import { Suspense } from "react";
import { Badge, Card, EmptyState } from "@growth-manager/ui";
import Link from "next/link";
import type { Dashboard, Recommendation, SessionTenant } from "@growth-manager/contracts";
import { getDashboard } from "../../lib/api";
import { loadWorkspace } from "../../lib/session";
import { NoTenantState, WorkspaceError } from "../../components/workspace-error";
import { SubmitButton } from "../../components/submit-button";
import { DashboardContentSkeleton } from "../../components/loading-ui";
import { decideRecommendationAction } from "./actions";

const riskTone = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger"
} as const;

const qualityLabel = {
  complete: "dados completos",
  partial: "dados parciais",
  insufficient: "dados insuficientes"
} as const;

function formatToday(timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone
  }).format(new Date());
}

function formatDate(value: string | null, timezone: string): string {
  if (value === null) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: timezone
  }).format(new Date(value));
}

function isOverdue(dueAt: string | null): boolean {
  return dueAt !== null && new Date(dueAt).getTime() < Date.now();
}

function PriorityCard({
  recommendation,
  canDecide
}: {
  readonly recommendation: Recommendation;
  readonly canDecide: boolean;
}): React.ReactNode {
  return (
    <Card className="priority-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Prioridade #1</p>
          <h2>{recommendation.title}</h2>
        </div>
        <span className="score">{recommendation.priority_score}</span>
      </div>
      <p className="priority-card__summary">{recommendation.description}</p>
      <div className="evidence-row">
        <Badge tone={riskTone[recommendation.risk]}>Risco {recommendation.risk}</Badge>
        <Badge tone="neutral">{recommendation.category}</Badge>
        <Badge tone="success">Confiança {Math.round(recommendation.confidence * 100)}%</Badge>
      </div>
      {recommendation.rationale.length > 0 ? (
        <p className="muted">{recommendation.rationale}</p>
      ) : null}
      {canDecide ? (
        <div className="card-actions">
          <form action={decideRecommendationAction}>
            <input name="recommendation_id" type="hidden" value={recommendation.id} />
            <input name="decision" type="hidden" value="accepted" />
            <SubmitButton className="primary-button" pendingLabel="Aceitando…">
              Aceitar e criar tarefa
            </SubmitButton>
          </form>
          <form action={decideRecommendationAction}>
            <input name="recommendation_id" type="hidden" value={recommendation.id} />
            <input name="decision" type="hidden" value="dismissed" />
            <SubmitButton className="tertiary-button" pendingLabel="Descartando…">
              Descartar
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </Card>
  );
}

function SignalStrip({
  dashboard,
  timezone
}: {
  readonly dashboard: Dashboard;
  readonly timezone: string;
}): React.ReactNode {
  const highImpact = dashboard.recommendations.filter(
    (item) => item.risk === "high" || item.risk === "critical"
  ).length;
  const overdueTasks = dashboard.tasks.filter((task) => isOverdue(task.due_at)).length;
  const overdueApprovals = dashboard.approvals.filter((item) => isOverdue(item.due_at)).length;
  const healthySources = dashboard.sources.filter((item) => item.status === "healthy").length;

  return (
    <section className="signal-strip" aria-label="Resumo operacional">
      <div>
        <span className="signal-icon signal-icon--violet">↗</span>
        <p>
          <strong>{dashboard.recommendations.length}</strong> prioridades
        </p>
        <small>{highImpact} de alto impacto</small>
      </div>
      <div>
        <span className="signal-icon signal-icon--amber">◎</span>
        <p>
          <strong>{dashboard.approvals.length}</strong> aprovações
        </p>
        <small>{overdueApprovals} vencidas</small>
      </div>
      <div>
        <span className="signal-icon signal-icon--blue">✓</span>
        <p>
          <strong>{dashboard.tasks.length}</strong> tarefas abertas
        </p>
        <small>{overdueTasks} atrasadas</small>
      </div>
      <div>
        <span className="signal-icon signal-icon--green">◒</span>
        <p>
          <strong>{healthySources}</strong> fontes saudáveis
        </p>
        <small>
          de {dashboard.sources.length} · {qualityLabel[dashboard.data_quality]}
        </small>
      </div>
      <div>
        <span className="signal-icon signal-icon--amber">!</span>
        <p>
          <strong>{dashboard.alerts_open}</strong> alertas
        </p>
        <small>apurado {formatDate(dashboard.generated_at, timezone)}</small>
      </div>
    </section>
  );
}

function ApprovalsCard({
  dashboard,
  timezone
}: {
  readonly dashboard: Dashboard;
  readonly timezone: string;
}): React.ReactNode {
  return (
    <Card className="approvals-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Aguardando decisão</p>
          <h2>Aprovações</h2>
        </div>
        <Link href="/app/approvals">Ver todas</Link>
      </div>
      {dashboard.approvals.length === 0 ? (
        <p className="muted">Nenhuma aprovação pendente.</p>
      ) : (
        dashboard.approvals.map((approval) => (
          <div className="approval-item" key={approval.id}>
            <span className="channel-icon">{approval.subject_type.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{approval.subject_type}</strong>
              <small>versão {approval.subject_version}</small>
            </div>
            <Badge tone={isOverdue(approval.due_at) ? "danger" : "neutral"}>
              {formatDate(approval.due_at, timezone)}
            </Badge>
          </div>
        ))
      )}
    </Card>
  );
}

function TasksCard({
  dashboard,
  timezone
}: {
  readonly dashboard: Dashboard;
  readonly timezone: string;
}): React.ReactNode {
  return (
    <Card className="tasks-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Próximos passos</p>
          <h2>Tarefas críticas</h2>
        </div>
        <Link href="/app/tasks">Abrir quadro</Link>
      </div>
      {dashboard.tasks.length === 0 ? (
        <p className="muted">Nenhuma tarefa em aberto.</p>
      ) : (
        <div className="task-list">
          {dashboard.tasks.map((task) => (
            <div className="task-list__row" key={task.id}>
              <span>
                <strong>{task.title}</strong>
                <small>{formatDate(task.due_at, timezone)}</small>
              </span>
              <Badge tone={isOverdue(task.due_at) ? "danger" : "neutral"}>{task.priority}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SourcesCard({ dashboard }: { readonly dashboard: Dashboard }): React.ReactNode {
  return (
    <Card className="sources-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Qualidade do sinal</p>
          <h2>Saúde das fontes</h2>
        </div>
        <Link href="/app/connections">Gerenciar</Link>
      </div>
      {dashboard.sources.length === 0 ? (
        <p className="muted">Nenhuma fonte de dados conectada a este cliente.</p>
      ) : (
        <div className="source-grid">
          {dashboard.sources.map((source) => (
            <div key={source.provider}>
              <i className={source.status === "healthy" ? "source-ok" : "source-warn"} />
              <span>{source.provider}</span>
              <small>{source.freshness_label}</small>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NoRecommendationCard(): React.ReactNode {
  return (
    <Card className="priority-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Prioridades</p>
          <h2>Nenhuma recomendação aberta</h2>
        </div>
      </div>
      <p className="muted">
        As recomendações são geradas a partir das fontes conectadas. Nenhuma foi produzida para este
        cliente até agora.
      </p>
    </Card>
  );
}

export default async function DashboardPage(): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  const tenant: SessionTenant | null = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{formatToday(tenant.timezone)}</p>
          <h1>O que merece atenção agora</h1>
          <p>Prioridades ordenadas por impacto, urgência e confiança dos dados.</p>
        </div>
      </div>

      <Suspense fallback={<DashboardContentSkeleton />}>
        <DashboardContent tenant={tenant} />
      </Suspense>
    </main>
  );
}

async function DashboardContent({
  tenant
}: {
  readonly tenant: SessionTenant;
}): Promise<React.ReactNode> {
  const dashboardResult = await getDashboard(tenant.id);
  if (!dashboardResult.ok) return <WorkspaceError failure={dashboardResult} />;

  const dashboard = dashboardResult.data;
  const topRecommendation = dashboard.recommendations[0];
  const canDecide = tenant.permissions.includes("recommendations.decide");
  const everythingEmpty =
    dashboard.recommendations.length === 0 &&
    dashboard.tasks.length === 0 &&
    dashboard.approvals.length === 0 &&
    dashboard.sources.length === 0;

  return (
    <>
      <SignalStrip dashboard={dashboard} timezone={tenant.timezone} />
      {everythingEmpty ? (
        <Card>
          <EmptyState
            title={`Nenhum sinal registrado para ${tenant.name}`}
            description="Este cliente ainda não tem fontes conectadas nem trabalho em aberto. Conecte uma fonte de dados ou crie a primeira tarefa para começar."
          />
        </Card>
      ) : null}
      <div className="dashboard-grid">
        {topRecommendation === undefined ? (
          <NoRecommendationCard />
        ) : (
          <PriorityCard canDecide={canDecide} recommendation={topRecommendation} />
        )}
        <ApprovalsCard dashboard={dashboard} timezone={tenant.timezone} />
        <TasksCard dashboard={dashboard} timezone={tenant.timezone} />
        <SourcesCard dashboard={dashboard} />
      </div>
    </>
  );
}
