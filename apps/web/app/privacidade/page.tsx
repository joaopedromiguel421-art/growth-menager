import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage(): React.ReactNode {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <p className="legal-eyebrow">Atualizada em 27 de julho de 2026</p>
        <h1>Política de privacidade</h1>
        <p>
          Esta política explica como o Growth Manager trata dados pessoais e dados obtidos por
          integrações autorizadas pelos usuários da plataforma.
        </p>
        <h2>Dados tratados e finalidade</h2>
        <p>
          Tratamos dados cadastrais, registros técnicos de segurança e, mediante autorização OAuth,
          dados das propriedades selecionadas no Google Analytics, Search Console e Perfil da
          Empresa. Esses dados são usados para produzir relatórios, monitorar desempenho,
          identificar oportunidades e manter o histórico solicitado pelo cliente.
        </p>
        <h2>Uso de dados das APIs Google</h2>
        <p>
          O uso e a transferência de informações recebidas das APIs Google seguem a Política de
          Dados do Usuário dos Serviços de API do Google, inclusive os requisitos de Uso Limitado.
          Não vendemos esses dados, não os usamos para publicidade e não permitimos que modelos de
          inteligência artificial sejam treinados com eles.
        </p>
        <h2>Compartilhamento e armazenamento</h2>
        <p>
          Os dados podem ser processados por fornecedores de infraestrutura estritamente para operar
          o serviço, sob controles de acesso e isolamento por organização. Credenciais e tokens são
          protegidos e não são incluídos em logs. Conservamos os dados enquanto a conta estiver
          ativa ou pelo prazo necessário às finalidades e obrigações aplicáveis.
        </p>
        <h2>Controle do usuário</h2>
        <p>
          O usuário pode desconectar uma integração a qualquer momento no Growth Manager ou na
          página de permissões da conta Google. Também pode solicitar acesso, correção,
          portabilidade ou exclusão dos dados pelo e-mail joao.pedro.miguel421@gmail.com.
          Solicitações são verificadas para proteger a conta e atendidas conforme a legislação
          aplicável.
        </p>
        <h2>Segurança e contato</h2>
        <p>
          Aplicamos autenticação, autorização por tenant, criptografia em trânsito, trilha de
          auditoria e acesso mínimo. Nenhum sistema é isento de riscos; incidentes relevantes serão
          tratados e comunicados conforme a lei. Dúvidas podem ser enviadas ao mesmo e-mail acima.
        </p>
        <nav className="legal-links" aria-label="Links institucionais">
          <Link href="/sobre">Sobre</Link>
          <Link href="/termos">Termos de uso</Link>
          <Link href="/login">Entrar</Link>
        </nav>
      </article>
    </main>
  );
}
