import Link from "next/link";
import { Badge, Card, EmptyState } from "@growth-manager/ui";
import type { SessionTenant } from "@growth-manager/contracts";
import { loadWorkspace, roleLabel } from "../../../lib/session";
import { getTenant } from "../../../lib/api";
import { WorkspaceError } from "../../../components/workspace-error";
import { ClientForm, type OrganizationOption } from "./client-form";
import { SubmitButton } from "../../../components/submit-button";
import { editClientAction } from "../actions";

const statusLabels: Readonly<Record<SessionTenant["status"], string>> = {
  onboarding: "Em configuração",
  active: "Ativo",
  suspended: "Suspenso",
  closing: "Encerrando",
  closed: "Encerrado"
};

const statusTones = {
  onboarding: "warning",
  active: "success",
  suspended: "danger",
  closing: "neutral",
  closed: "neutral"
} as const;

export default async function ClientsPage(): Promise<React.ReactNode> {
  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;

  // The session already carries every tenant with its status and role, so the
  // list needs no extra round trip.
  const tenants = result.workspace.session.tenants;
  const canCreate = tenants.some((tenant) => tenant.permissions.includes("tenant.create"));
  const detailResults = await Promise.all(tenants.map((tenant) => getTenant(tenant.id)));
  const details = new Map(
    detailResults.flatMap((result) => (result.ok ? [[result.data.id, result.data] as const] : []))
  );

  const organizations: readonly OrganizationOption[] = [
    ...new Map(
      tenants
        .filter((tenant) => tenant.permissions.includes("tenant.create"))
        .map((tenant) => [tenant.organization_id, tenant.organization_name])
    )
  ].map(([id, name]) => ({ id, name }));

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Carteira</p>
          <h1>Clientes</h1>
          <p>
            {tenants.length === 0
              ? "Você ainda não tem clientes. Cadastre o primeiro para começar."
              : `${String(tenants.length)} cliente${tenants.length === 1 ? "" : "s"} na sua carteira.`}
          </p>
        </div>
      </div>

      {canCreate ? <ClientForm organizations={organizations} /> : null}

      {tenants.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum cliente cadastrado"
            description={
              canCreate
                ? "Cadastre um cliente acima. Em seguida você conecta as fontes de dados dele e as prioridades passam a aparecer na Central."
                : "Seu papel não permite cadastrar clientes. Peça a um administrador da organização."
            }
          />
        </Card>
      ) : (
        <div className="module-stats">
          {tenants.map((tenant) => (
            <Card key={tenant.id}>
              <div className="card-heading">
                <h2>{tenant.name}</h2>
                <Badge tone={statusTones[tenant.status]}>{statusLabels[tenant.status]}</Badge>
              </div>
              <p className="muted">{tenant.organization_name}</p>
              <p className="muted">{roleLabel(tenant.role)}</p>
              {tenant.status === "onboarding" ? (
                <p>
                  {/* Onboarding is only finished once a real source is linked. */}
                  <Link className="tertiary-button" href="/app/connections">
                    Conectar fontes de dados
                  </Link>
                </p>
              ) : null}
              {tenant.permissions.includes("tenant.update") && details.has(tenant.id) ? (
                <details>
                  <summary>Editar cliente</summary>
                  <form action={editClientAction} className="task-form">
                    <input name="tenant_id" type="hidden" value={tenant.id} />
                    <input name="version" type="hidden" value={details.get(tenant.id)?.version} />
                    <div className="field">
                      <label htmlFor={`client-name-${tenant.id}`}>Nome</label>
                      <input
                        defaultValue={details.get(tenant.id)?.name}
                        id={`client-name-${tenant.id}`}
                        maxLength={160}
                        name="name"
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`client-legal-${tenant.id}`}>Razão social</label>
                      <input
                        defaultValue={details.get(tenant.id)?.legal_name ?? ""}
                        id={`client-legal-${tenant.id}`}
                        maxLength={200}
                        name="legal_name"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`client-industry-${tenant.id}`}>Segmento</label>
                      <input
                        defaultValue={details.get(tenant.id)?.industry ?? ""}
                        id={`client-industry-${tenant.id}`}
                        maxLength={80}
                        name="industry"
                      />
                    </div>
                    <input name="timezone" type="hidden" value={tenant.timezone} />
                    <div className="field">
                      <label htmlFor={`client-status-${tenant.id}`}>Status</label>
                      <select
                        defaultValue={tenant.status}
                        id={`client-status-${tenant.id}`}
                        name="status"
                      >
                        <option value="onboarding">Em configuração</option>
                        <option value="active">Ativo</option>
                        <option value="suspended">Suspenso</option>
                        <option value="closing">Encerrar</option>
                      </select>
                    </div>
                    <SubmitButton className="secondary-button" pendingLabel="Salvando…">
                      Salvar cliente
                    </SubmitButton>
                  </form>
                </details>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
