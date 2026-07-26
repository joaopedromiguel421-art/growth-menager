import { notFound } from "next/navigation";
import { Card, EmptyState } from "@growth-manager/ui";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";

/**
 * Modules whose backend is not built yet. They render an explicit "not
 * available" state instead of sample rows, so nothing on screen can be mistaken
 * for real client data. Modules backed by an endpoint have their own route.
 */
const modules: Readonly<
  Record<
    string,
    {
      readonly eyebrow: string;
      readonly title: string;
      readonly description: string;
      readonly blockedBy: string;
    }
  >
> = {
  reviews: {
    eyebrow: "Reputação",
    title: "Avaliações",
    description: "Classifique, responda e acompanhe avaliações com segurança.",
    blockedBy: "a conexão com o Google Business Profile"
  },
  content: {
    eyebrow: "Planejamento editorial",
    title: "Conteúdo",
    description: "Crie versões orientadas pelos sinais do cliente e pela marca.",
    blockedBy: "o módulo de conteúdo e versões"
  },
  calendar: {
    eyebrow: "Execução",
    title: "Calendário",
    description: "Organize publicações aprovadas por canal e fuso.",
    blockedBy: "o módulo de publicação"
  },
  alerts: {
    eyebrow: "Operação",
    title: "Alertas",
    description: "Condições acionáveis, deduplicadas e com responsável.",
    blockedBy: "o motor de alertas"
  },
  reports: {
    eyebrow: "Comprovação de valor",
    title: "Relatórios",
    description: "Snapshots mensais, narrativa explicável e entrega segura.",
    blockedBy: "o fechamento mensal"
  },
  costs: {
    eyebrow: "FinOps",
    title: "Custos",
    description: "Consumo por tenant, provedor e operação antes de afetar a margem.",
    blockedBy: "a captura de eventos de uso"
  },
  "settings/brand": {
    eyebrow: "Identidade",
    title: "Marca",
    description: "Tom, públicos, claims e tokens visuais usados pela IA.",
    blockedBy: "o módulo de brand kit"
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

  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;
  const tenant = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{module.eyebrow}</p>
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
      </div>
      <Card>
        <EmptyState
          title={`${module.title} ainda não está disponível`}
          description={`Este módulo depende de ${module.blockedBy}, que ainda não foi implementado. Nenhum dado de exemplo é exibido aqui — quando a fonte existir, ${tenant.name} aparecerá com números reais.`}
        />
      </Card>
    </main>
  );
}
