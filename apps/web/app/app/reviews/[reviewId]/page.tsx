import { Badge, Card } from "@growth-manager/ui";
import Link from "next/link";
import type { Review, ReviewReply } from "@growth-manager/contracts";
import { getReview } from "../../../../lib/api";
import { loadWorkspace } from "../../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../../components/workspace-error";
import { SubmitButton } from "../../../../components/submit-button";
import { createDraftAction, submitForApprovalAction } from "../actions";
import { ReplyDraftForm } from "./reply-draft-form";

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

function GenerateDraftButton({
  reviewId,
  label
}: {
  readonly reviewId: string;
  readonly label: string;
}): React.ReactNode {
  return (
    <form action={createDraftAction}>
      <input name="review_id" type="hidden" value={reviewId} />
      <SubmitButton className="primary-button" pendingLabel="Gerando…">
        {label}
      </SubmitButton>
    </form>
  );
}

function DraftReplyEditor({
  review,
  reply
}: {
  readonly review: Review;
  readonly reply: ReviewReply;
}): React.ReactNode {
  return (
    <>
      <ReplyDraftForm
        initialBody={reply.body}
        key={reply.id}
        replyId={reply.id}
        reviewId={review.id}
      />
      <div className="card-actions">
        <form action={submitForApprovalAction}>
          <input name="review_id" type="hidden" value={review.id} />
          <input name="reply_id" type="hidden" value={reply.id} />
          <SubmitButton className="primary-button" pendingLabel="Enviando…">
            Solicitar aprovação
          </SubmitButton>
        </form>
        <form action={createDraftAction}>
          <input name="review_id" type="hidden" value={review.id} />
          <SubmitButton className="tertiary-button" pendingLabel="Gerando…">
            Gerar nova sugestão
          </SubmitButton>
        </form>
      </div>
    </>
  );
}

function ReplyStatusNote({ status }: { readonly status: ReviewReply["status"] }): React.ReactNode {
  if (status === "awaiting_approval") {
    return (
      <p className="muted">
        Enviado para aprovação. <Link href="/app/approvals">Decidir em Aprovações</Link>
      </p>
    );
  }
  if (status === "published") {
    return <p className="muted">Publicada no Google.</p>;
  }
  return null;
}

function ReplySection({
  review,
  latestReply,
  canReply
}: {
  readonly review: Review;
  readonly latestReply: ReviewReply | null;
  readonly canReply: boolean;
}): React.ReactNode {
  if (review.sensitive_theme) {
    return (
      <p className="muted">
        Trate esta avaliação pela tarefa criada para ela, não por resposta automática.
      </p>
    );
  }
  if (latestReply === null) {
    return canReply ? (
      <GenerateDraftButton label="Gerar sugestão" reviewId={review.id} />
    ) : (
      <p className="muted">Nenhum rascunho foi criado ainda.</p>
    );
  }

  return (
    <div className="review-detail__replies">
      <div className="review-detail__reply">
        <Badge tone="neutral">{replyStatusLabel[latestReply.status]}</Badge>
        {latestReply.status === "draft" && canReply ? (
          <DraftReplyEditor review={review} reply={latestReply} />
        ) : (
          <p className="review-detail__body">{latestReply.body}</p>
        )}
        <ReplyStatusNote status={latestReply.status} />
        {latestReply.status === "rejected" && canReply ? (
          <GenerateDraftButton label="Gerar novo rascunho" reviewId={review.id} />
        ) : null}
      </div>
    </div>
  );
}

export default async function ReviewDetailPage({
  params
}: {
  readonly params: Promise<{ readonly reviewId: string }>;
}): Promise<React.ReactNode> {
  const { reviewId } = await params;

  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  const tenant = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  const detailResult = await getReview(tenant.id, reviewId);
  if (!detailResult.ok) return <WorkspaceError failure={detailResult} />;

  const { review, replies } = detailResult.data;
  const latestReply = replies[0] ?? null;
  const canReply = tenant.permissions.includes("reviews.reply");

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Avaliação</p>
          <h1>
            {review.author_name ?? "Cliente"} — {review.rating} de 5
          </h1>
          <p>
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "long",
              timeZone: tenant.timezone
            }).format(new Date(review.published_at))}
          </p>
        </div>
      </div>

      <Card>
        {review.body === null ? (
          <p className="muted">Esta avaliação não tem comentário, apenas a nota.</p>
        ) : (
          <p className="review-detail__body">{review.body}</p>
        )}
        {review.sensitive_theme ? (
          <p className="review-callout">
            Esta avaliação contém um tema sensível. Nenhuma resposta automática é permitida — uma
            tarefa foi criada para atendimento humano direto.
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="card-heading">
          <div>
            <p className="eyebrow">Resposta</p>
            <h2>Rascunho e aprovação</h2>
          </div>
        </div>
        <ReplySection canReply={canReply} latestReply={latestReply} review={review} />
      </Card>
    </main>
  );
}
