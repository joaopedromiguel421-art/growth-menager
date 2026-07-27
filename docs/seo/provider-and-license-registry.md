# Registro de providers, proveniência e licenças SEO

## Referência de implementação

O núcleo de `claude-seo` está sob MIT. O Growth Manager pode reimplementar algoritmos e
adaptar estruturas mantendo o aviso de copyright. O commit de origem é
`09d37c7b66ed3ca9c6efbdb765a805a6c76a8f01`.

Conteúdo FLOW marcado como CC BY 4.0 só pode ser adaptado com crédito, link e indicação
de alterações. Catálogos derivados do Wikipedia AI Cleanup/CC BY-SA não serão copiados;
regras equivalentes serão criadas de forma independente. Dados OpenStreetMap são ODbL e
exigem atribuição visível e revisão antes de formar base derivada pública.

## Registro inicial

| Código          | Origem                   | Uso                                   | Licença/termos                | Política inicial                 |
| --------------- | ------------------------ | ------------------------------------- | ----------------------------- | -------------------------------- |
| `claude_seo`    | GitHub                   | metodologia, regras e fixtures        | MIT + componentes mistos      | pin de commit e notice           |
| `deepseek`      | API                      | explicação e síntese                  | termos DeepSeek/Open Platform | feature flag e revisão LGPD      |
| `google`        | GSC, GA4, GBP, PSI, CrUX | métricas read-only                    | termos Google aplicáveis      | conexão e propriedade explícitas |
| `dataforseo`    | API                      | SERP, Maps, backlinks e AI visibility | contrato DataForSEO           | reserva de custo obrigatória     |
| `openstreetmap` | OSM/Overpass             | geometria e contexto local            | ODbL                          | atribuição e proveniência        |
| `moz`           | API                      | backlinks                             | contrato Moz                  | adapter opcional                 |
| `ahrefs`        | API                      | backlinks/concorrentes                | contrato Ahrefs               | adapter opcional                 |
| `bing`          | Webmaster API            | métricas read-only                    | termos Microsoft              | IndexNow desabilitado            |
| `common_crawl`  | índices públicos         | backlinks/verificação                 | termos do dataset             | snapshot e data da coleta        |
| `profound`      | API                      | AI visibility                         | contrato Profound             | adapter opcional                 |
| `seranking`     | API                      | rankings/AI visibility                | contrato SE Ranking           | adapter opcional                 |

Preços, retenção, bases legais, regiões e atribuições são versionados em
`provider_price_catalog` e `seo_source_registry`. Credenciais ficam no Vault e nunca
entram em prompts, logs ou artefatos.
