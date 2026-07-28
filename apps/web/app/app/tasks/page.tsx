import { Badge, Card, EmptyState } from "@growth-manager/ui";
import type { Task } from "@growth-manager/contracts";
import { getTeam, listTasks } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { SubmitButton } from "../../../components/submit-button";
import { editTaskAction, setTaskStatusAction } from "../actions";
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

  const [tasksResult, teamResult] = await Promise.all([listTasks(tenant.id), getTeam(tenant.id)]);
  if (!tasksResult.ok) return <WorkspaceError failure={tasksResult} />;

  const tasks = tasksResult.data;
  const canWrite = tenant.permissions.includes("tasks.write");
  const members = teamResult.ok
    ? teamResult.data.members.filter((member) => member.status === "active")
    : [];

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
                            <SubmitButton className="tertiary-button" pendingLabel="Concluindo…">
                              Concluir
                            </SubmitButton>
                          </form>
                        ) : null}
                        {canWrite ? (
                          <details>
                            <summary>Editar</summary>
                            <form action={editTaskAction} className="task-form">
                              <input name="task_id" type="hidden" value={task.id} />
                              <input name="version" type="hidden" value={task.version} />
                              <div className="field">
                                <label htmlFor={`task-title-${task.id}`}>Título</label>
                                <input
                                  defaultValue={task.title}
                                  id={`task-title-${task.id}`}
                                  maxLength={200}
                                  name="title"
                                  required
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`task-description-${task.id}`}>Descrição</label>
                                <textarea
                                  defaultValue={task.description ?? ""}
                                  id={`task-description-${task.id}`}
                                  maxLength={5000}
                                  name="description"
                                  rows={3}
                                />
                              </div>
                              <div className="field">
                                <label htmlFor={`task-status-${task.id}`}>Status</label>
                                <select
                                  defaultValue={task.status}
                                  id={`task-status-${task.id}`}
                                  name="status"
                                >
                                  <option value="backlog">Backlog</option>
                                  <option value="todo">A fazer</option>
                                  <option value="in_progress">Em andamento</option>
                                  <option value="blocked">Bloqueada</option>
                                  <option value="done">Concluída</option>
                                  <option value="cancelled">Cancelada</option>
                                </select>
                              </div>
                              <div className="field">
                                <label htmlFor={`task-priority-${task.id}`}>Prioridade</label>
                                <select
                                  defaultValue={task.priority}
                                  id={`task-priority-${task.id}`}
                                  name="priority"
                                >
                                  <option value="low">Baixa</option>
                                  <option value="medium">Média</option>
                                  <option value="high">Alta</option>
                                  <option value="urgent">Urgente</option>
                                </select>
                              </div>
                              <div className="field">
                                <label htmlFor={`task-assignee-${task.id}`}>Responsável</label>
                                <select
                                  defaultValue={task.assignee_id ?? ""}
                                  id={`task-assignee-${task.id}`}
                                  name="assignee_id"
                                >
                                  <option value="">Sem responsável</option>
                                  {members.map((member) => (
                                    <option key={member.user_id} value={member.user_id}>
                                      {member.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="field">
                                <label htmlFor={`task-due-${task.id}`}>Prazo</label>
                                <input
                                  defaultValue={task.due_at?.slice(0, 10) ?? ""}
                                  id={`task-due-${task.id}`}
                                  name="due_at"
                                  type="date"
                                />
                              </div>
                              <SubmitButton className="secondary-button" pendingLabel="Salvando…">
                                Salvar tarefa
                              </SubmitButton>
                            </form>
                          </details>
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
