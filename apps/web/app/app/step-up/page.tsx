import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { enrollTotpFactor, getMfaStatus, requireAccessToken } from "../../../lib/auth";
import { loadWorkspace } from "../../../lib/session";
import { WorkspaceError } from "../../../components/workspace-error";
import { StepUpForm } from "./step-up-form";

export const metadata: Metadata = { title: "Confirmar identidade" };

function safeReturnTo(value: string | undefined): string {
  if (!value?.startsWith("/app")) return "/app";
  return value;
}

export default async function StepUpPage({
  searchParams
}: {
  readonly searchParams: Promise<{ readonly returnTo?: string }>;
}): Promise<React.ReactNode> {
  const returnTo = safeReturnTo((await searchParams).returnTo);

  const result = await loadWorkspace();
  if (!result.ok) return <WorkspaceError failure={result.failure} />;
  if (result.workspace.session.user.aal === "aal2") {
    redirect(returnTo as Parameters<typeof redirect>[0]);
  }

  const accessToken = await requireAccessToken();
  const status = await getMfaStatus(accessToken);

  if (status?.verified === true) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <div className="login-card">
            <p className="eyebrow">Confirmar identidade</p>
            <h2>Confirme o código do seu autenticador</h2>
            <p className="muted">
              Sua conta já tem um autenticador configurado. Informe o código atual para continuar.
            </p>
            <StepUpForm actionLabel="Confirmar" factorId={status.factorId} returnTo={returnTo} />
          </div>
        </section>
      </main>
    );
  }

  // Every visit while unverified starts a fresh enrollment. Supabase's TOTP factor
  // only becomes usable once verify succeeds, so an abandoned attempt here simply
  // leaves an inert unverified factor behind rather than a usable duplicate.
  const enrolled = await enrollTotpFactor(accessToken);
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Confirmar identidade</p>
          <h2>Configure um autenticador</h2>
          <p className="muted">
            Aprovações exigem confirmação em duas etapas. Adicione esta chave em um aplicativo
            autenticador (Google Authenticator, 1Password, Authy) e informe o código gerado.
          </p>
          <p className="totp-secret">{enrolled.secret}</p>
          <StepUpForm
            actionLabel="Ativar e continuar"
            factorId={enrolled.factorId}
            returnTo={returnTo}
          />
        </div>
      </section>
    </main>
  );
}
