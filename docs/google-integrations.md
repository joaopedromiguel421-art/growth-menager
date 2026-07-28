# Integrações Google

## Fronteira ativa

O Growth Manager usa um cliente OAuth Web central e um refresh token separado por
tenant/conexão, armazenado no Vault. Os redirects de produção são fixos e derivados de
`API_BASE_URL`; tenant, redirect e scopes nunca vêm do navegador.

| Provider          | Escopo/fonte          | Dados permitidos                           | Estado esperado                                                     |
| ----------------- | --------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `google_business` | `business.manage`     | locais, performance e avaliações           | leitura real; writes sujeitos a aprovação e reconciliação           |
| `search_console`  | `webmasters.readonly` | clicks, impressions, CTR e posição         | leitura real, com cobertura de top rows explícita                   |
| `ga4`             | `analytics.readonly`  | métricas agregadas por data e landing page | leitura real; User-ID, Client-ID e dimensões pessoais são proibidos |
| `pagespeed`       | API key restrita      | Lighthouse e auditorias da URL pública     | somente leitura                                                     |
| `crux`            | API key restrita      | Core Web Vitals observados por URL/origin  | somente leitura; ausência de amostra é `unknown`                    |

## Regras de evidência

- PSI e CrUX são fontes distintas. Lighthouse não pode ser apresentado como dado de campo.
- Métrica ausente nunca vira zero.
- GA4 persiste somente agregados allowlisted e registra propriedade, período, dimensões e
  captura no raw import.
- A quota retornada pelo GA4 é metadado operacional e não métrica de negócio.
- Reviews GBP dependem de quota/aprovação específica do projeto Google. Sem acesso, o
  workflow fica indisponível e não usa scraping.

## OAuth público

O app inicia em modo externo de teste. A promoção para produção exige páginas públicas de
privacidade e termos, domínio autorizado, contatos válidos, scopes declarados e revisão do
Google quando aplicável. A mudança de status não elimina a revisão jurídica/LGPD.
