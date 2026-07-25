import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage(): React.ReactNode {
  return (
    <main className="login-page">
      <section className="login-brand">
        <a className="brand brand--light" href="/" aria-label="Growth Manager">
          <span className="brand__mark">G</span>
          <span>Growth Manager</span>
        </a>
        <div className="login-brand__message">
          <p className="eyebrow eyebrow--light">Crescimento com clareza</p>
          <h1>Transforme sinais em prioridades que movem o negócio.</h1>
          <p>Dados próprios, recomendações explicáveis e execução aprovada em um só lugar.</p>
        </div>
        <div className="login-proof">
          <span>01</span>
          <p>Priorize o que tem impacto agora.</p>
          <span>02</span>
          <p>Execute com controle e evidência.</p>
          <span>03</span>
          <p>Comprove valor todos os meses.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Acesso seguro</p>
          <h2>Bom ter você de volta.</h2>
          <p className="muted">Entre para ver as prioridades dos seus clientes.</p>
          <LoginForm />
          <p className="login-help">
            Acesso somente por convite.{" "}
            <a href="mailto:suporte@growthmanager.com.br">Precisa de ajuda?</a>
          </p>
        </div>
      </section>
    </main>
  );
}
