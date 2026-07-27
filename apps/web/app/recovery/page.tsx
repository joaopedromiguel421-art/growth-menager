import type { Metadata } from "next";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = { title: "Recuperar acesso" };

export default function RecoveryPage(): React.ReactNode {
  return (
    <main className="login-page">
      <section className="login-brand">
        <a className="brand brand--light" href="/" aria-label="Growth Manager">
          <span className="brand__mark">G</span>
          <span>Growth Manager</span>
        </a>
        <div className="login-brand__message">
          <p className="eyebrow eyebrow--light">Acesso seguro</p>
          <h1>Vamos recuperar o acesso à sua conta.</h1>
          <p>Enviamos um link de redefinição de senha para o e-mail cadastrado.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Recuperar senha</p>
          <h2>Informe seu e-mail</h2>
          <p className="muted">Você receberá um link de uso único para definir uma nova senha.</p>
          <RecoveryForm />
          <p className="login-help">
            Lembrou a senha? <a href="/login">Voltar para o login</a>
          </p>
        </div>
      </section>
    </main>
  );
}
