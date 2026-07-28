import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage(): React.ReactNode {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <p className="legal-eyebrow">Atualizados em 27 de julho de 2026</p>
        <h1>Termos de uso</h1>
        <p>
          Estes termos regulam o uso do Growth Manager. Ao utilizar a plataforma, o usuário declara
          possuir autorização para administrar as organizações, propriedades e integrações que
          conectar.
        </p>
        <h2>Uso do serviço</h2>
        <p>
          A plataforma organiza dados e recomendações para apoiar decisões de marketing e SEO. O
          usuário deve manter suas credenciais seguras, fornecer informações corretas e não usar o
          serviço para violar direitos, leis ou limites técnicos de terceiros.
        </p>
        <h2>Integrações externas</h2>
        <p>
          Google e outros fornecedores mantêm seus próprios termos, disponibilidade e limites de
          API. O Growth Manager acessa apenas os recursos autorizados. Permissões podem ser
          revogadas a qualquer momento; isso interrompe novas coletas sem alterar registros que
          devam ser preservados por obrigação legal ou de auditoria.
        </p>
        <h2>Relatórios e responsabilidade</h2>
        <p>
          Métricas são apresentadas com sua origem e período. Recomendações não garantem posições,
          receita ou resultados futuros. O cliente continua responsável por aprovar decisões e
          alterações em seus ativos.
        </p>
        <h2>Suspensão, encerramento e contato</h2>
        <p>
          O acesso pode ser suspenso por risco de segurança, uso abusivo ou inadimplência, com
          observância do contrato comercial aplicável. Pedidos de encerramento e dúvidas podem ser
          enviados para joao.pedro.miguel421@gmail.com.
        </p>
        <nav className="legal-links" aria-label="Links institucionais">
          <Link href="/sobre">Sobre</Link>
          <Link href="/privacidade">Política de privacidade</Link>
          <Link href="/login">Entrar</Link>
        </nav>
      </article>
    </main>
  );
}
