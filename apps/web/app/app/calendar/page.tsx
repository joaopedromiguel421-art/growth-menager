import { Badge, Card, EmptyState } from "@growth-manager/ui";
import { listConnectionProperties, listContent, listPublications } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { ScheduleForm } from "../../../components/operation-forms";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { SubmitButton } from "../../../components/submit-button";
import { cancelPublicationAction } from "../actions";

export default async function CalendarPage(): Promise<React.ReactNode> {
  const workspace = await loadWorkspace();
  if (!workspace.ok) return <WorkspaceError failure={workspace.failure} />;
  const tenant = workspace.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={workspace.workspace.session.user.email} />;
  const [publications, content, properties] = await Promise.all([
    listPublications(tenant.id),
    listContent(tenant.id),
    listConnectionProperties(tenant.id, "google_business")
  ]);
  if (!publications.ok) return <WorkspaceError failure={publications} />;
  const canWrite = tenant.permissions.includes("content.write");
  const approved = content.ok ? content.data.filter((item) => item.status === "approved") : [];
  const propertyRows = properties.ok ? properties.data : [];
  const schedulePanel = buildSchedulePanel(canWrite, approved, propertyRows);
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Execução</p>
          <h1>Calendário</h1>
          <p>Agende conteúdos aprovados no fuso de {tenant.name}.</p>
        </div>
      </div>
      {schedulePanel}
      {publications.data.length === 0 ? (
        <Card>
          <EmptyState
            title="Agenda vazia"
            description="Os próximos conteúdos publicados aparecerão aqui."
          />
        </Card>
      ) : (
        <div className="module-stats">
          {publications.data.map((item) => (
            <Card key={item.id}>
              <div className="card-heading">
                <h2>{item.content_title}</h2>
                <Badge
                  tone={
                    item.status === "published"
                      ? "success"
                      : item.status === "failed"
                        ? "danger"
                        : "info"
                  }
                >
                  {item.status}
                </Badge>
              </div>
              <p>
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: tenant.timezone
                }).format(new Date(item.scheduled_at))}
              </p>
              {canWrite && (item.status === "scheduled" || item.status === "queued") ? (
                <form action={cancelPublicationAction}>
                  <input name="publication_id" type="hidden" value={item.id} />
                  <input name="version" type="hidden" value={item.version} />
                  <SubmitButton className="tertiary-button" pendingLabel="Cancelando…">
                    Cancelar
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

function buildSchedulePanel(
  canWrite: boolean,
  content: Parameters<typeof ScheduleForm>[0]["content"],
  properties: Parameters<typeof ScheduleForm>[0]["properties"]
): React.ReactNode {
  if (!canWrite) return null;
  if (content.length > 0 && properties.some((item) => item.selected)) {
    return <ScheduleForm content={content} properties={properties} />;
  }
  return (
    <Card>
      <EmptyState
        title="Prepare o agendamento"
        description="Aprove um conteúdo e selecione uma propriedade do Google Business em Conexões."
      />
    </Card>
  );
}
