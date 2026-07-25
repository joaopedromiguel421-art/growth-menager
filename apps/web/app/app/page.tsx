import { Badge, Card } from "@growth-manager/ui";
import { getDashboard } from "../../lib/api";

const demoTenantId = process.env.DEMO_TENANT_ID ?? "01954d2e-3b80-7000-8000-000000000001";

// The fallback preview deliberately branches beside live dashboard data.
// eslint-disable-next-line complexity
export default async function DashboardPage(): Promise<React.ReactNode> {
  const dashboard = await getDashboard(demoTenantId);
  const recommendations = dashboard?.recommendations ?? [];
  const tasks = dashboard?.tasks ?? [];
  const approvals = dashboard?.approvals ?? [];

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Sábado, 25 de julho</p>
          <h1>O que merece atenção agora</h1>
          <p>Prioridades ordenadas por impacto, urgência e confiança dos dados.</p>
        </div>
        <button className="secondary-button">Atualizar dados</button>
      </div>

      <section className="signal-strip" aria-label="Resumo operacional">
        <div>
          <span className="signal-icon signal-icon--violet">↗</span>
          <p>
            <strong>{recommendations.length || 3}</strong> prioridades
          </p>
          <small>1 de alto impacto</small>
        </div>
        <div>
          <span className="signal-icon signal-icon--amber">◎</span>
          <p>
            <strong>{approvals.length || 2}</strong> aprovações
          </p>
          <small>1 vence hoje</small>
        </div>
        <div>
          <span className="signal-icon signal-icon--blue">✓</span>
          <p>
            <strong>{tasks.length || 7}</strong> tarefas abertas
          </p>
          <small>2 atrasadas</small>
        </div>
        <div>
          <span className="signal-icon signal-icon--green">◒</span>
          <p>
            <strong>82%</strong> cobertura
          </p>
          <small>4 de 5 fontes</small>
        </div>
      </section>

      <div className="dashboard-grid">
        <Card className="priority-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Prioridade #1</p>
              <h2>Recupere a queda nas buscas locais</h2>
            </div>
            <span className="score">87</span>
          </div>
          <p className="priority-card__summary">
            As visualizações no Google caíram 18% nas últimas quatro semanas, enquanto três
            concorrentes ganharam posições para termos de alta intenção.
          </p>
          <div className="evidence-row">
            <Badge tone="danger">Impacto alto</Badge>
            <Badge tone="warning">Urgência alta</Badge>
            <Badge tone="success">Confiança 91%</Badge>
          </div>
          <div className="evidence">
            <div>
              <span>Google Business</span>
              <strong>−18%</strong>
              <small>visualizações</small>
            </div>
            <div>
              <span>Search Console</span>
              <strong>−11</strong>
              <small>cliques locais</small>
            </div>
            <div>
              <span>Concorrência</span>
              <strong>+3</strong>
              <small>novas posições</small>
            </div>
          </div>
          <div className="card-actions">
            <button className="primary-button">Transformar em tarefa</button>
            <button className="tertiary-button">Ver evidências</button>
            <button className="icon-button" aria-label="Mais opções">
              •••
            </button>
          </div>
        </Card>

        <Card className="approvals-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Aguardando decisão</p>
              <h2>Aprovações</h2>
            </div>
            <a href="/app/approvals">Ver todas</a>
          </div>
          <div className="approval-item">
            <span className="channel-icon">G</span>
            <div>
              <strong>Resposta à avaliação de Marina</strong>
              <small>5 estrelas · Google</small>
            </div>
            <Badge tone="warning">Hoje</Badge>
          </div>
          <div className="approval-item">
            <span className="channel-icon channel-icon--instagram">◎</span>
            <div>
              <strong>Post “Cuidados no inverno”</strong>
              <small>Instagram · versão 3</small>
            </div>
            <Badge tone="neutral">Amanhã</Badge>
          </div>
        </Card>

        <Card className="tasks-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Próximos passos</p>
              <h2>Tarefas críticas</h2>
            </div>
            <a href="/app/tasks">Abrir quadro</a>
          </div>
          {tasks.length === 0 ? (
            <div className="task-list">
              <label>
                <input type="checkbox" />
                <span>
                  <strong>Atualizar fotos da unidade Centro</strong>
                  <small>Vence hoje · Ana</small>
                </span>
                <Badge tone="danger">P0</Badge>
              </label>
              <label>
                <input type="checkbox" />
                <span>
                  <strong>Revisar páginas com queda de clique</strong>
                  <small>Vence amanhã · João</small>
                </span>
                <Badge tone="warning">P1</Badge>
              </label>
              <label>
                <input type="checkbox" />
                <span>
                  <strong>Validar calendário de agosto</strong>
                  <small>28 jul · Cliente</small>
                </span>
                <Badge tone="neutral">P2</Badge>
              </label>
            </div>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <label key={task.id}>
                  <input type="checkbox" />
                  <span>
                    <strong>{task.title}</strong>
                    <small>{task.due_at ?? "Sem prazo"}</small>
                  </span>
                  <Badge tone="neutral">{task.priority}</Badge>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card className="sources-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Qualidade do sinal</p>
              <h2>Saúde das fontes</h2>
            </div>
            <a href="/app/connections">Gerenciar</a>
          </div>
          <div className="source-grid">
            <div>
              <i className="source-ok" />
              <span>Google Business</span>
              <small>há 12 min</small>
            </div>
            <div>
              <i className="source-ok" />
              <span>Search Console</span>
              <small>há 2 h</small>
            </div>
            <div>
              <i className="source-ok" />
              <span>GA4</span>
              <small>há 2 h</small>
            </div>
            <div>
              <i className="source-warn" />
              <span>Instagram</span>
              <small>reconectar</small>
            </div>
          </div>
        </Card>
      </div>

      {dashboard === null ? (
        <div className="demo-notice" role="status">
          <strong>Modo de demonstração</strong>
          <span>Conecte a API e defina DEMO_TENANT_ID para carregar dados reais.</span>
        </div>
      ) : null}
    </main>
  );
}
