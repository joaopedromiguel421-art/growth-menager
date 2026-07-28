import type { Metadata } from "next";
import Link from "next/link";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Aceitar convite" };

// Lives outside /app on purpose: the proxy matcher only guards /app and /login,
// so an invitee with no session can reach this page.
export default async function InvitePage({
  searchParams
}: {
  readonly searchParams: Promise<{ readonly token?: string }>;
}): Promise<React.ReactNode> {
  const token = (await searchParams).token ?? "";

  return (
    <main className="login-page">
      <section className="login-brand">
        <Link className="brand brand--light" href="/" aria-label="Growth Manager">
          <span className="brand__mark">G</span>
          <span>Growth Manager</span>
        </Link>
        <div className="login-brand__message">
          <p className="eyebrow eyebrow--light">Bem-vindo</p>
          <h1>Ative seu acesso para acompanhar o crescimento do cliente.</h1>
          <p>Você define a senha agora. O link do convite só pode ser usado uma vez.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Convite</p>
          <h2>Criar meu acesso</h2>
          {token.length === 0 ? (
            <p className="form-error" role="alert">
              Este endereço não traz um convite. Abra o link exatamente como recebeu no e-mail.
            </p>
          ) : (
            <>
              <p className="muted">Use o mesmo e-mail em que recebeu o convite.</p>
              <AcceptForm token={token} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
