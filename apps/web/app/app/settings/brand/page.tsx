import { getBrandKit } from "../../../../lib/api";
import { loadWorkspace } from "../../../../lib/session";
import { BrandKitForm } from "../../../../components/operation-forms";
import { NoTenantState, WorkspaceError } from "../../../../components/workspace-error";

export default async function BrandPage(): Promise<React.ReactNode> {
  const workspace = await loadWorkspace();
  if (!workspace.ok) return <WorkspaceError failure={workspace.failure} />;
  const tenant = workspace.workspace.activeTenant;
  if (tenant === null) return <NoTenantState email={workspace.workspace.session.user.email} />;
  const result = await getBrandKit(tenant.id);
  if (!result.ok) return <WorkspaceError failure={result} />;
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Identidade</p>
          <h1>Marca</h1>
          <p>Defina o tom, os públicos, as afirmações e as cores que orientam o conteúdo.</p>
        </div>
      </div>
      {tenant.permissions.includes("content.write") ? (
        <BrandKitForm brandKit={result.data} />
      ) : (
        <p className="muted">Seu papel permite visualizar, mas não editar a identidade.</p>
      )}
    </main>
  );
}
