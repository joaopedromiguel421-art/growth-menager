import { Badge, Card, EmptyState } from "@growth-manager/ui";
import type { Task } from "@growth-manager/contracts";
import { listTasks } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { setTaskStatusAction } from "../actions";
import { TaskForm } from "./task-form";

const columns: readonly { readonly status: Task["status"]; readonly label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "A fazer" },
  { status: "in_progress", label: "Em andamento" },
  { status: "blocked", label: "Bloqueadas" },
  { status: "done", label: "Concluídas" }
];

const priorityTone = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger"
} as const;

export default async function TasksPage(): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  const tenant = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  const tasksResult = await listTasks(tenant.id);
  if (!tasksResult.ok) return <WorkspaceError failure={tasksResult} />;

  const tasks = tasksResult.data;
  const canWrite = tenant.permissions.includes("tasks.write");

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Coordenação</p>
          <h1>Tarefas</h1>
          <p>
            {tasks.length === 0
              ? `Nenhuma tarefa registrada para ${tenant.name}.`
              : `${String(tasks.length)} tarefa${tasks.length === 1 ? "" : "s"} em ${tenant.name}.`}
          </p>
        </div>
      </div>

      {canWrite ? <TaskForm /> : null}

      {tasks.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma tarefa ainda"
            description={
              canWrite
                ? "Crie a primeira tarefa acima ou aceite uma recomendação em Oportunidades."
                : "Seu papel neste cliente não permite criar tarefas."
            }
          />
        </Card>
      ) : (
        <div className="module-stats">
          {columns.map((column) => {
            const columnTasks = tasks.filter((task) => task.status === column.status);
            return (
              <Card key={column.status}>
                <div className="card-heading">
                  <h2>{column.label}</h2>
                  <span className="score">{columnTasks.length}</span>
                </div>
                {columnTasks.length === 0 ? (
                  <p className="muted">Vazio.</p>
                ) : (
                  <div className="task-list">
                    {columnTasks.map((task) => (
                      <div className="task-list__row" key={task.id}>
                        <span>
                          <strong>{task.title}</strong>
                          <small>
                            {task.due_at === null
                              ? "Sem prazo"
                              : new Intl.DateTimeFormat("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                  timeZone: tenant.timezone
                                }).format(new Date(task.due_at))}
                          </small>
                        </span>
                        <Badge tone={priorityTone[task.priority]}>{task.priority}</Badge>
                        {canWrite && task.status !== "done" ? (
                          <form action={setTaskStatusAction}>
                            <input name="task_id" type="hidden" value={task.id} />
                            <input name="version" type="hidden" value={task.version} />
                            <input name="status" type="hidden" value="done" />
                            <button className="tertiary-button" type="submit">
                              Concluir
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
