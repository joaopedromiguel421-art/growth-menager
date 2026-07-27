import { Badge, Card, EmptyState } from "@growth-manager/ui";
import type { Approval } from "@growth-manager/contracts";
import { listApprovals } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { decideApprovalAction } from "../actions";

const riskTone = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger"
} as const;

const statusLabel = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
  expired: "Expirada"
} as const;

const subjectLabel = {
  review_reply: "Resposta a avaliação",
  content: "Conteúdo",
  publication: "Publicação",
  report: "Relatório"
} as const;

function DecisionButtons({ approval }: { readonly approval: Approval }): React.ReactNode {
  return (
    <div className="approval-item__decide">
      <form action={decideApprovalAction}>
        <input name="approval_id" type="hidden" value={approval.id} />
        <input name="subject_version" type="hidden" value={approval.subject_version} />
        <input name="decision" type="hidden" value="approved" />
        <button className="primary-button" type="submit">
          Aprovar
        </button>
      </form>
      <form action={decideApprovalAction}>
        <input name="approval_id" type="hidden" value={approval.id} />
        <input name="subject_version" type="hidden" value={approval.subject_version} />
        <input name="decision" type="hidden" value="rejected" />
        <button className="tertiary-button" type="submit">
          Rejeitar
        </button>
      </form>
    </div>
  );
}

export default async function ApprovalsPage(): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  const tenant = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  const approvalsResult = await listApprovals(tenant.id);
  if (!approvalsResult.ok) return <WorkspaceError failure={approvalsResult} />;

  const approvals = approvalsResult.data;
  const pending = approvals.filter((approval) => approval.status === "pending");
  const canDecide = tenant.permissions.includes("approvals.decide");
  const steppedUp = result.workspace.session.user.aal === "aal2";
  const returnTo = encodeURIComponent("/app/approvals");

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Controle de risco</p>
          <h1>Aprovações</h1>
          <p>
            {approvals.length === 0
              ? `Nenhuma aprovação registrada para ${tenant.name}.`
              : `${String(pending.length)} pendente${pending.length === 1 ? "" : "s"} de ${String(approvals.length)} no total.`}
          </p>
        </div>
      </div>

      {canDecide && pending.length > 0 && !steppedUp ? (
        <Card>
          <p className="muted">
            Decidir uma aprovação exige confirmação de identidade (MFA).{" "}
            <a href={`/app/step-up?returnTo=${returnTo}`}>Confirmar identidade</a>
          </p>
        </Card>
      ) : null}

      {approvals.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma aprovação ainda"
            description="Aprovações aparecem quando um conteúdo, resposta ou relatório é submetido para decisão. Nada foi submetido para este cliente até agora."
          />
        </Card>
      ) : (
        <Card>
          {approvals.map((approval) => (
            <div className="approval-item" key={approval.id}>
              <span className="channel-icon">
                {subjectLabel[approval.subject_type].slice(0, 1)}
              </span>
              <div>
                <strong>{subjectLabel[approval.subject_type]}</strong>
                <small>
                  versão {approval.subject_version} ·{" "}
                  {approval.due_at === null
                    ? "sem prazo"
                    : new Intl.DateTimeFormat("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        timeZone: tenant.timezone
                      }).format(new Date(approval.due_at))}
                </small>
              </div>
              <div className="approval-item__side">
                <div className="approval-item__badges">
                  <Badge tone={riskTone[approval.risk]}>{approval.risk}</Badge>
                  <Badge tone="neutral">{statusLabel[approval.status]}</Badge>
                </div>
                {canDecide && steppedUp && approval.status === "pending" ? (
                  <DecisionButtons approval={approval} />
                ) : null}
              </div>
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}
