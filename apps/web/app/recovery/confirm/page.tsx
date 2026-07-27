import type { Metadata } from "next";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Definir nova senha" };

export default function RecoveryConfirmPage(): React.ReactNode {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  return (
    <main className="login-page">
      <section className="login-brand">
        <a className="brand brand--light" href="/" aria-label="Growth Manager">
          <span className="brand__mark">G</span>
          <span>Growth Manager</span>
        </a>
        <div className="login-brand__message">
          <p className="eyebrow eyebrow--light">Acesso seguro</p>
          <h1>Defina uma nova senha.</h1>
          <p>O link do seu e-mail confirma quem você é; escolha uma senha nova para continuar.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Nova senha</p>
          <h2>Escolha uma senha forte</h2>
          {supabaseUrl === undefined || supabaseKey === undefined ? (
            <p className="form-error" role="alert">
              A recuperação de senha não está configurada neste ambiente.
            </p>
          ) : (
            <ConfirmForm supabaseKey={supabaseKey} supabaseUrl={supabaseUrl} />
          )}
        </div>
      </section>
    </main>
  );
}
