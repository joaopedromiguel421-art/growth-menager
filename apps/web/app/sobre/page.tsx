import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre",
  description: "Conheça o Growth Manager e as integrações Google usadas pela plataforma."
};

export default function AboutPage(): React.ReactNode {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <p className="legal-eyebrow">Growth Manager</p>
        <h1>Gestão contínua de crescimento para clientes</h1>
        <p>
          O Growth Manager reúne dados autorizados de marketing, presença local e SEO para monitorar
          resultados, detectar regressões e transformar evidências em prioridades de trabalho.
        </p>
        <h2>Finalidade do aplicativo</h2>
        <p>
          O Growth Manager é uma plataforma SaaS B2B de gestão pós-venda. Sua finalidade é permitir
          que agências e seus clientes acompanhem, em um único painel, métricas agregadas,
          avaliações, presença local e evolução de SEO. A plataforma não é afiliada ao Google e não
          altera propriedades Google sem uma ação autorizada e auditável do usuário.
        </p>
        <h2>Integrações Google</h2>
        <p>
          Quando um usuário conecta sua conta, a plataforma pode ler dados das propriedades que ele
          selecionar no Google Analytics, Search Console e Perfil da Empresa. O acesso é somente ao
          necessário para relatórios e acompanhamento; nenhuma conta é conectada sem consentimento
          explícito.
        </p>
        <nav className="legal-links" aria-label="Links institucionais">
          <a href="/login">Entrar</a>
          <a href="/privacidade">Política de privacidade</a>
          <a href="/termos">Termos de uso</a>
        </nav>
      </article>
    </main>
  );
}
