import { Badge, Card, EmptyState } from "@growth-manager/ui";
import { listRecommendations } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { decideRecommendationAction } from "../actions";

const riskTone = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger"
} as const;

const statusLabel = {
  open: "Aberta",
  accepted: "Aceita",
  dismissed: "Descartada",
  expired: "Expirada"
} as const;

export default async function OpportunitiesPage(): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  const tenant = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  const recommendationsResult = await listRecommendations(tenant.id);
  if (!recommendationsResult.ok) return <WorkspaceError failure={recommendationsResult} />;

  const recommendations = recommendationsResult.data;
  const canDecide = tenant.permissions.includes("recommendations.decide");

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Crescimento orgânico</p>
          <h1>Oportunidades</h1>
          <p>
            {recommendations.length === 0
              ? `Nenhuma recomendação gerada para ${tenant.name}.`
              : `${String(recommendations.length)} recomendação${recommendations.length === 1 ? "" : "ões"} em ${tenant.name}.`}
          </p>
        </div>
      </div>

      {recommendations.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma oportunidade ainda"
            description="As recomendações nascem dos dados sincronizados das fontes conectadas. Conecte uma fonte em Conexões para que a análise comece a produzir prioridades."
          />
        </Card>
      ) : (
        <div className="dashboard-grid">
          {recommendations.map((recommendation) => (
            <Card className="priority-card" key={recommendation.id}>
              <div className="card-heading">
                <div>
                  <p className="eyebrow">{recommendation.category}</p>
                  <h2>{recommendation.title}</h2>
                </div>
                <span className="score">{recommendation.priority_score}</span>
              </div>
              <p className="priority-card__summary">{recommendation.description}</p>
              <div className="evidence-row">
                <Badge tone={riskTone[recommendation.risk]}>Risco {recommendation.risk}</Badge>
                <Badge tone="neutral">{statusLabel[recommendation.status]}</Badge>
                <Badge tone="success">
                  Confiança {Math.round(recommendation.confidence * 100)}%
                </Badge>
              </div>
              {recommendation.rationale.length > 0 ? (
                <p className="muted">{recommendation.rationale}</p>
              ) : null}
              {canDecide && recommendation.status === "open" ? (
                <div className="card-actions">
                  <form action={decideRecommendationAction}>
                    <input name="recommendation_id" type="hidden" value={recommendation.id} />
                    <input name="decision" type="hidden" value="accepted" />
                    <button className="primary-button" type="submit">
                      Aceitar e criar tarefa
                    </button>
                  </form>
                  <form action={decideRecommendationAction}>
                    <input name="recommendation_id" type="hidden" value={recommendation.id} />
                    <input name="decision" type="hidden" value="dismissed" />
                    <button className="tertiary-button" type="submit">
                      Descartar
                    </button>
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
