# Política normativa de evidências SEO

## Envelope de achado

Todo achado contém código estável, categoria, severidade, confiança decomposta,
evidências, origem, recomendação, impacto e status. Fatos sem `evidence_id` válido são
rejeitados. `null` significa desconhecido; ausência nunca é convertida em zero.

Categorias: `technical`, `content`, `schema`, `performance`, `google_business`,
`local`, `maps`, `competitor`, `backlink`, `ai_visibility`, `sxo`.

Severidades: `critical`, `high`, `medium`, `low`, `info`.

Status: `open`, `acknowledged`, `accepted`, `in_progress`, `resolved`, `dismissed`,
`regressed`, `superseded`, `insufficient_evidence`.

## Confiança

`confidence = 0,40 × coverage + 0,30 × freshness + 0,30 × agreement`.
A autoconfiança declarada pela IA é ignorada. Resultado abaixo de `0,40` fica
`insufficient_evidence` e não origina tarefa automaticamente.

## Proveniência

Cada evidência registra source, referência externa quando houver, captura, hash,
validade e raw import. Cada achado registra capability, provider, ruleset e prompt
opcional. Valores são rotulados como `observed`, `derived`, `estimated` ou `inferred`.

## Lifecycle e regressões

- Baseline incompleto é `provisional` e não resolve nem declara regressão em categorias
  sem cobertura.
- Comparações exigem fonte, dispositivo, localização, idioma, keyword e versão de regra
  compatíveis.
- Achado não crítico requer duas execuções completas limpas para `resolved`.
- Disponibilidade/indexação crítica pode ser resolvida após uma confirmação limpa.
- Recorrência de achado resolvido produz `regressed`.
- `dismissed` exige motivo e expiração.
- Mudança de ruleset não é regressão; inicia nova série ou migração explícita.

## IA

DeepSeek recebe apenas evidências selecionadas e conteúdo delimitado como não confiável.
Não define código, categoria, severidade, confiança, métricas, posição, status ou custo.
Claims factuais sem todas as citações são descartados. Há uma tentativa de reparo JSON;
depois disso aplica-se fallback determinístico.
