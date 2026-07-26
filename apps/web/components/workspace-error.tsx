import { Card, EmptyState } from "@growth-manager/ui";
import type { ApiFailure } from "../lib/api";

/** Rendered when the signed-in account has no active tenant membership. */
export function NoTenantState({ email }: { readonly email: string }): React.ReactNode {
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Acesso</p>
          <h1>Sua conta ainda não tem um cliente</h1>
          <p>Você está autenticado como {email}, mas nenhuma associação ativa foi encontrada.</p>
        </div>
      </div>
      <Card>
        <EmptyState
          title="Nenhum tenant disponível"
          description="Peça a um administrador para incluir você em uma organização ou cliente."
        />
      </Card>
    </main>
  );
}

/**
 * Shown whenever the workspace cannot be loaded. It states the real failure
 * instead of falling back to sample content, so an outage is never mistaken
 * for an empty account.
 */
export function WorkspaceError({ failure }: { readonly failure: ApiFailure }): React.ReactNode {
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Sem dados</p>
          <h1>Não foi possível carregar seu workspace</h1>
          <p>{failure.message}</p>
        </div>
      </div>
      <Card>
        <dl className="diagnostic">
          <div>
            <dt>Código</dt>
            <dd>{failure.code}</dd>
          </div>
          <div>
            <dt>Status HTTP</dt>
            <dd>{failure.status === 0 ? "sem resposta" : failure.status}</dd>
          </div>
        </dl>
        <p className="muted">
          Nenhum dado de exemplo é exibido aqui: enquanto a API não responder, a tela permanece
          vazia de propósito.
        </p>
      </Card>
    </main>
  );
}
