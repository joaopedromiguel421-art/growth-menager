import { Badge, Card, EmptyState } from "@growth-manager/ui";
import { getTeam } from "../../../../lib/api";
import { loadWorkspace, roleLabel } from "../../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../../components/workspace-error";
import { SubmitButton } from "../../../../components/submit-button";
import { revokeInvitationAction, revokeMemberAction } from "../../actions";
import { TeamInviteForm } from "./team-invite-form";

export default async function TeamPage(): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  const tenant = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  const teamResult = await getTeam(tenant.id);
  if (!teamResult.ok) return <WorkspaceError failure={teamResult} />;

  const { members, invitations } = teamResult.data;
  const canManage = tenant.permissions.includes("members.manage");
  const currentUserId = result.workspace.session.user.id;

  const dateFormat = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: tenant.timezone
  });

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Acesso</p>
          <h1>Equipe e permissões</h1>
          <p>
            Quem pode ver e agir sobre {tenant.name}. O cadastro é somente por convite: cada pessoa
            recebe um link de uso único para definir a própria senha.
          </p>
        </div>
      </div>

      {canManage ? <TeamInviteForm tenantName={tenant.name} /> : null}

      <Card>
        <div className="card-heading">
          <h2>Pessoas com acesso</h2>
          <span className="score">{members.length}</span>
        </div>
        {members.length === 0 ? (
          <EmptyState
            title="Nenhuma pessoa listada"
            description="Nem a sua própria conta apareceu aqui, o que indica um problema de permissão e não uma equipe vazia."
          />
        ) : (
          <div className="task-list">
            {members.map((member) => (
              <div className="task-list__row" key={member.membership_id}>
                <span>
                  <strong>{member.name}</strong>
                  <small>
                    {member.email} ·{" "}
                    {member.tenant_id === null ? "Toda a organização" : `Somente ${tenant.name}`}
                  </small>
                </span>
                <Badge tone={member.status === "active" ? "success" : "neutral"}>
                  {roleLabel(member.role)}
                </Badge>
                {/* Revoking your own access would lock you out of this screen. */}
                {canManage && member.user_id !== currentUserId && member.status === "active" ? (
                  <form action={revokeMemberAction}>
                    <input name="membership_id" type="hidden" value={member.membership_id} />
                    <SubmitButton className="tertiary-button" pendingLabel="Removendo…">
                      Remover
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="card-heading">
          <h2>Convites pendentes</h2>
          <span className="score">{invitations.length}</span>
        </div>
        {invitations.length === 0 ? (
          <p className="muted">Nenhum convite aguardando resposta.</p>
        ) : (
          <div className="task-list">
            {invitations.map((invitation) => (
              <div className="task-list__row" key={invitation.id}>
                <span>
                  <strong>{invitation.email}</strong>
                  <small>
                    {roleLabel(invitation.role)} · expira em{" "}
                    {dateFormat.format(new Date(invitation.expires_at))}
                  </small>
                </span>
                <Badge tone="warning">Pendente</Badge>
                {canManage ? (
                  <form action={revokeInvitationAction}>
                    <input name="invitation_id" type="hidden" value={invitation.id} />
                    <SubmitButton className="tertiary-button" pendingLabel="Cancelando…">
                      Cancelar
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
