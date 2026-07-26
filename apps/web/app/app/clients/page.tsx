import Link from "next/link";
import { Badge, Card, EmptyState } from "@growth-manager/ui";
import type { SessionTenant } from "@growth-manager/contracts";
import { loadWorkspace, roleLabel } from "../../../lib/session";
import { WorkspaceError } from "../../../components/workspace-error";
import { ClientForm, type OrganizationOption } from "./client-form";

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
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
