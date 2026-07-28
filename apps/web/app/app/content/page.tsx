import { Badge, Card, EmptyState } from "@growth-manager/ui";
import { listContent } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { ContentForm } from "../../../components/operation-forms";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { SubmitButton } from "../../../components/submit-button";
import { submitContentAction } from "../actions";

const statusLabel = {
  draft: "Rascunho",
  review: "Em revisão",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
  cancelled: "Cancelado"
} as const;

export default async function ContentPage(): Promise<React.ReactNode> {
  const workspace = await loadWorkspace();
  if (!workspace.ok) return <WorkspaceError failure={workspace.failure} />;
  const tenant = workspace.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={workspace.workspace.session.user.email} />;
  const result = await listContent(tenant.id);
  if (!result.ok) return <WorkspaceError failure={result} />;
  const canWrite = tenant.permissions.includes("content.write");
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Planejamento editorial</p>
          <h1>Conteúdo</h1>
          <p>Crie, revise e aprove peças alinhadas à identidade de {tenant.name}.</p>
        </div>
      </div>
      {canWrite ? <ContentForm /> : null}
      {result.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum conteúdo criado"
            description="Crie a primeira peça editorial para iniciar o fluxo de revisão."
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
                    item.status === "approved" || item.status === "published"
                      ? "success"
                      : "neutral"
                  }
                >
                  {statusLabel[item.status]}
                </Badge>
              </div>
              <p className="muted">
                {item.channel} · versão {item.current_version}
              </p>
              <p>{item.body}</p>
              {canWrite && item.status === "draft" ? (
                <form action={submitContentAction}>
                  <input name="content_id" type="hidden" value={item.id} />
                  <SubmitButton className="secondary-button" pendingLabel="Enviando…">
                    Enviar para aprovação
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
