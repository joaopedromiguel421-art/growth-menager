import { Suspense } from "react";
import { Badge, Card, EmptyState } from "@growth-manager/ui";
import type { ConnectionSummary, IntegrationProperty, Provider } from "@growth-manager/contracts";
import { listConnectionProperties, listConnections } from "../../../lib/api";
import { loadWorkspace } from "../../../lib/session";
import { NoTenantState, WorkspaceError } from "../../../components/workspace-error";
import { SubmitButton } from "../../../components/submit-button";
import {
  connectProviderAction,
  disconnectProviderAction,
  refreshPropertiesAction,
  selectPropertiesAction,
  syncProviderAction
} from "../actions";

// Only the providers with a real adapter are offered; the rest would send the
// operator through a consent screen that cannot lead anywhere yet.
const providers: readonly {
  readonly provider: Provider;
  readonly name: string;
  readonly description: string;
  readonly propertyLabel: string;
}[] = [
  {
    provider: "google_business",
    name: "Google Business Profile",
    description: "Visualizações, cliques e pedidos de rota das suas fichas locais.",
    propertyLabel: "Localizações"
  },
  {
    provider: "search_console",
    name: "Google Search Console",
    description: "Cliques, impressões, CTR e posição média nas buscas.",
    propertyLabel: "Propriedades verificadas"
  },
  {
    provider: "ga4",
    name: "Google Analytics 4",
    description: "Sessões, usuários, eventos e conversões agregadas das propriedades GA4.",
    propertyLabel: "Propriedades GA4"
  }
];

const statusTone = {
  active: "success",
  pending_auth: "warning",
  degraded: "warning",
  expired: "danger",
  revoked: "neutral",
  disconnected: "neutral"
} as const;

const statusLabel = {
  active: "Conectado",
  pending_auth: "Autorização pendente",
  degraded: "Degradado",
  expired: "Expirado",
  revoked: "Revogado",
  disconnected: "Desconectado"
} as const;

function ConnectionFacts({
  connection,
  propertyLabel
}: {
  readonly connection: ConnectionSummary;
  readonly propertyLabel: string;
}): React.ReactNode {
  return (
    <dl className="evidence">
      <div>
        <span>Autorizado em</span>
        <strong>{formatDate(connection.authorized_at)}</strong>
      </div>
      <div>
        <span>Última sincronização</span>
        <strong>{formatDate(connection.last_synced_at)}</strong>
      </div>
      <div>
        <span>{propertyLabel} ativas</span>
        <strong>{connection.selected_properties}</strong>
      </div>
    </dl>
  );
}

function ConnectionActions({
  provider,
  isActive
}: {
  readonly provider: Provider;
  readonly isActive: boolean;
}): React.ReactNode {
  return (
    <div className="card-actions">
      <form action={connectProviderAction}>
        <input name="provider" type="hidden" value={provider} />
        <SubmitButton className="primary-button" pendingLabel="Abrindo Google…">
          {isActive ? "Reautorizar" : "Conectar"}
        </SubmitButton>
      </form>
      {isActive ? (
        <>
          <form action={syncProviderAction}>
            <input name="provider" type="hidden" value={provider} />
            <SubmitButton className="tertiary-button" pendingLabel="Solicitando…">
              Sincronizar agora
            </SubmitButton>
          </form>
          <form action={disconnectProviderAction}>
            <input name="provider" type="hidden" value={provider} />
            <SubmitButton className="tertiary-button" pendingLabel="Desconectando…">
              Desconectar
            </SubmitButton>
          </form>
        </>
      ) : null}
    </div>
  );
}

function ProviderCard({
  meta,
  connection,
  canManage,
  tenantId
}: {
  readonly meta: (typeof providers)[number];
  readonly connection: ConnectionSummary | undefined;
  readonly canManage: boolean;
  readonly tenantId: string;
}): React.ReactNode {
  const status = connection?.status ?? "disconnected";
  const isActive = connection !== undefined && status === "active";
  const errorCode = connection?.error_code ?? null;

  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">{meta.name}</p>
          <h2>{statusLabel[status]}</h2>
        </div>
        <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
      </div>
      <p className="muted">{meta.description}</p>

      {isActive ? (
        <ConnectionFacts connection={connection} propertyLabel={meta.propertyLabel} />
      ) : null}
      {errorCode === null ? null : <p className="muted">Último erro: {errorCode}</p>}

      {canManage ? (
        <ConnectionActions isActive={isActive} provider={meta.provider} />
      ) : (
        <p className="muted">Seu papel neste cliente não permite gerenciar conexões.</p>
      )}

      {isActive ? (
        <Suspense fallback={<p className="muted">Carregando propriedades…</p>}>
          <PropertyPanel
            canManage={canManage}
            label={meta.propertyLabel}
            provider={meta.provider}
            tenantId={tenantId}
          />
        </Suspense>
      ) : null}
    </Card>
  );
}

async function PropertyPanel({
  provider,
  label,
  canManage,
  tenantId
}: {
  readonly provider: Provider;
  readonly label: string;
  readonly canManage: boolean;
  readonly tenantId: string;
}): Promise<React.ReactNode> {
  const properties = await listConnectionProperties(tenantId, provider);
  if (!properties.ok) {
    return <p className="muted">A lista de propriedades não respondeu. Tente atualizar.</p>;
  }
  return (
    <PropertyPicker
      canManage={canManage}
      label={label}
      properties={properties.data}
      provider={provider}
    />
  );
}

function PropertyPicker({
  provider,
  label,
  properties,
  canManage
}: {
  readonly provider: Provider;
  readonly label: string;
  readonly properties: readonly IntegrationProperty[];
  readonly canManage: boolean;
}): React.ReactNode {
  if (properties.length === 0) {
    return (
      <div className="property-heading">
        <p className="muted">Nenhuma {label.toLowerCase()} disponível nesta conta Google.</p>
        {canManage ? <RefreshPropertiesButton provider={provider} /> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="property-heading">
        <h3>{label}</h3>
        {canManage ? <RefreshPropertiesButton provider={provider} /> : null}
      </div>
      <form action={selectPropertiesAction}>
        <input name="provider" type="hidden" value={provider} />
        <div className="task-list">
          {properties.map((property) => (
            <label key={property.external_id}>
              <input
                defaultChecked={property.selected}
                disabled={!canManage}
                name="property_id"
                type="checkbox"
                value={property.external_id}
              />
              <span>
                <strong>{property.name}</strong>
                <small>{property.external_id}</small>
              </span>
            </label>
          ))}
        </div>
        {canManage ? (
          <SubmitButton className="secondary-button" pendingLabel="Salvando…">
            Salvar seleção
          </SubmitButton>
        ) : null}
      </form>
    </div>
  );
}

function RefreshPropertiesButton({ provider }: { readonly provider: Provider }): React.ReactNode {
  return (
    <form action={refreshPropertiesAction}>
      <input name="provider" type="hidden" value={provider} />
      <SubmitButton className="tertiary-button" pendingLabel="Atualizando…">
        Atualizar lista
      </SubmitButton>
    </form>
  );
}

function formatDate(value: string | null): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default async function ConnectionsPage({
  searchParams
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  const tenant = result.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={result.workspace.session.user.email} />;

  const connectionsResult = await listConnections(tenant.id);
  if (!connectionsResult.ok) return <WorkspaceError failure={connectionsResult} />;

  const canManage = tenant.permissions.includes("connections.manage");
  const byProvider = new Map(connectionsResult.data.map((row) => [row.provider, row]));

  // Listing properties calls Google, so it only runs for providers already
  // connected; a failure there must not take the whole page down.
  const params = await searchParams;
  const errorMessage = typeof params.error === "string" ? params.error : null;
  const connected = typeof params.connected === "string" ? params.connected : null;

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fontes de dados</p>
          <h1>Conexões</h1>
          <p>
            Autorize as contas do {tenant.name} para que as métricas e prioridades venham de dados
            reais.
          </p>
        </div>
      </div>

      {errorMessage !== null ? (
        <Card>
          <EmptyState description={errorMessage} title="Não foi possível concluir a ação" />
        </Card>
      ) : null}

      {connected !== null && errorMessage === null ? (
        <Card>
          <p>
            Conta conectada. Selecione as propriedades que devem ser sincronizadas e rode a primeira
            sincronização.
          </p>
        </Card>
      ) : null}

      <div className="dashboard-grid">
        {providers.map((meta) => (
          <ProviderCard
            canManage={canManage}
            connection={byProvider.get(meta.provider)}
            key={meta.provider}
            meta={meta}
            tenantId={tenant.id}
          />
        ))}
      </div>
    </main>
  );
}
