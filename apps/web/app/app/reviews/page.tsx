import { Badge, Card, EmptyState } from "@growth-manager/ui";
import { listReviews } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";

const replyStatusLabel = {
  none: "Sem resposta",
  draft: "Rascunho",
  awaiting_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  published: "Publicada",
  failed: "Falhou",
  escalated: "Encaminhada"
} as const;

const replyStatusTone = {
  none: "neutral",
  draft: "info",
  awaiting_approval: "warning",
  approved: "info",
  rejected: "danger",
  published: "success",
  failed: "danger",
  escalated: "danger"
} as const;

export default async function ReviewsPage(): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  const tenant = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  const reviewsResult = await listReviews(tenant.id);
  if (!reviewsResult.ok) return <WorkspaceError failure={reviewsResult} />;

  const reviews = reviewsResult.data;
  const unanswered = reviews.filter(
    (review) => review.reply_status === "none" || review.reply_status === "escalated"
  ).length;

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Reputação</p>
          <h1>Avaliações</h1>
          <p>
            {reviews.length === 0
              ? `Nenhuma avaliação sincronizada para ${tenant.name}.`
              : `${String(unanswered)} sem resposta de ${String(reviews.length)} no total.`}
          </p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma avaliação ainda"
            description="Avaliações aparecem depois que a conexão com o Google Business Profile sincronizar pelo menos uma vez."
          />
        </Card>
      ) : (
        <Card>
          {reviews.map((review) => (
            <a className="review-row" href={`/app/reviews/${review.id}`} key={review.id}>
              <div>
                <strong>{review.author_name ?? "Cliente"}</strong>
                <small>{review.rating} de 5</small>
              </div>
              {review.body === null ? null : <p className="muted">{review.body}</p>}
              {review.sensitive_theme ? (
                <p className="review-callout">Tema sensível — resposta automática bloqueada.</p>
              ) : null}
              <Badge tone={replyStatusTone[review.reply_status]}>
                {replyStatusLabel[review.reply_status]}
              </Badge>
            </a>
          ))}
        </Card>
      )}
    </main>
  );
}
