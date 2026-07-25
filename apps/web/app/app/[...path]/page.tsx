import { notFound } from "next/navigation";
import { Badge, Card, EmptyState } from "@growth-manager/ui";

const modules: Readonly<
  Record<
    string,
    {
      readonly eyebrow: string;
      readonly title: string;
      readonly description: string;
      readonly action: string;
      readonly items: readonly string[];
    }
  >
> = {
  opportunities: {
    eyebrow: "Crescimento orgânico",
    title: "Oportunidades",
    description: "Consultas, páginas e concorrentes com potencial comprovado.",
    action: "Analisar oportunidade",
    items: ["Páginas perdendo cliques", "Termos perto do top 3", "Lacunas contra concorrentes"]
  },
  reviews: {
    eyebrow: "Reputação",
    title: "Avaliações",
    description: "Classifique, responda e acompanhe avaliações com segurança.",
    action: "Sincronizar avaliações",
    items: ["Sem resposta", "Tema sensível", "Publicadas esta semana"]
  },
  content: {
    eyebrow: "Planejamento editorial",
    title: "Conteúdo",
    description: "Crie versões orientadas pelos sinais do cliente e pela marca.",
    action: "Novo conteúdo",
    items: ["Rascunhos", "Em revisão", "Prontos para publicar"]
  },
  calendar: {
    eyebrow: "Execução",
    title: "Calendário",
    description: "Organize publicações aprovadas por canal e fuso.",
    action: "Agendar conteúdo",
    items: ["Esta semana", "Aguardando aprovação", "Publicados"]
  },
  tasks: {
    eyebrow: "Coordenação",
    title: "Tarefas",
    description: "Transforme cada recomendação aceita em trabalho rastreável.",
    action: "Nova tarefa",
    items: ["Backlog", "Em andamento", "Bloqueadas"]
  },
  approvals: {
    eyebrow: "Controle de risco",
    title: "Aprovações",
    description: "Decida sobre versões imutáveis antes de qualquer write externo.",
    action: "Revisar próxima",
    items: ["Vencem hoje", "Conteúdo", "Relatórios"]
  },
  alerts: {
    eyebrow: "Operação",
    title: "Alertas",
    description: "Condições acionáveis, deduplicadas e com responsável.",
    action: "Atualizar alertas",
    items: ["Críticos", "Reconhecidos", "Resolvidos"]
  },
  reports: {
    eyebrow: "Comprovação de valor",
    title: "Relatórios",
    description: "Snapshots mensais, narrativa explicável e entrega segura.",
    action: "Gerar prévia",
    items: ["Em revisão", "Aprovados", "Entregues"]
  },
  costs: {
    eyebrow: "FinOps",
    title: "Custos",
    description: "Consumo por tenant, provedor e operação antes de afetar a margem.",
    action: "Configurar orçamento",
    items: ["IA", "DataForSEO", "Infraestrutura"]
  },
  connections: {
    eyebrow: "Fontes de dados",
    title: "Conexões",
    description: "Autorize propriedades, acompanhe escopos e recupere falhas.",
    action: "Conectar fonte",
    items: ["Google Business", "Search Console e GA4", "Instagram"]
  },
  "settings/team": {
    eyebrow: "Acesso",
    title: "Equipe e permissões",
    description: "Convide pessoas e atribua apenas o papel necessário.",
    action: "Convidar pessoa",
    items: ["Agência", "Clientes", "Convites pendentes"]
  },
  "settings/brand": {
    eyebrow: "Identidade",
    title: "Marca",
    description: "Tom, públicos, claims e tokens visuais usados pela IA.",
    action: "Editar brand kit",
    items: ["Voz da marca", "Claims permitidos", "Identidade visual"]
  }
};

export default async function ModulePage({
  params
}: {
  readonly params: Promise<{ readonly path: readonly string[] }>;
}): Promise<React.ReactNode> {
  const path = (await params).path.join("/");
  const module = modules[path];
  if (module === undefined) notFound();

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{module.eyebrow}</p>
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
        <button className="primary-button">{module.action}</button>
      </div>
      <div className="module-stats">
        {module.items.map((item, index) => (
          <Card key={item}>
            <span className="module-stats__number">0{index + 1}</span>
            <h2>{item}</h2>
            <p>Os dados aparecem aqui assim que a fonte correspondente estiver conectada.</p>
            <Badge tone={index === 0 ? "info" : "neutral"}>
              {index === 0 ? "Prioridade" : "Acompanhar"}
            </Badge>
          </Card>
        ))}
      </div>
      <Card>
        <EmptyState
          title={`Nenhum item em ${module.title.toLowerCase()}`}
          description="Conecte uma fonte ou use a ação principal para começar com dados verificáveis."
        />
      </Card>
    </main>
  );
}
