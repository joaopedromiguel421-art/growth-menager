# Experiência, identidade visual e desempenho percebido

## Objetivo

O Growth Manager deve transmitir clareza operacional: o usuário identifica o cliente ativo, entende
o que exige atenção e alcança qualquer módulo sem perder o contexto. A interface usa português do
Brasil, densidade confortável e feedback imediato para carregamentos e ações.

## Identidade visual

- Azul-violeta profundo representa decisão e navegação; verde-lima sinaliza progresso e saúde.
- Fundo levemente frio, superfícies brancas e bordas discretas criam hierarquia sem depender de
  sombras pesadas.
- Títulos têm alto contraste e ritmo compacto; textos operacionais permanecem legíveis a partir de
  14 px.
- Estados de sucesso, atenção, erro e informação nunca dependem somente de cor.
- O símbolo `GM` e o motivo de sinal/pulso identificam o produto sem imagens decorativas pesadas.

## Shell e navegação

- O shell persiste entre páginas e mostra imediatamente um indicador fino durante transições.
- O item correspondente à rota atual usa `aria-current="page"` e contraste visual explícito.
- Links centrais são pré-carregados pelo framework; nenhuma navegação interna causa recarga completa.
- Em telas de até 760 px, o menu abre como gaveta, mantém foco visível, fecha por botão, sobreposição
  ou mudança de rota e impede interação acidental com o conteúdo ao fundo.
- O cliente ativo e a ação de sair permanecem visíveis sem competir com o conteúdo da página.

## Regras por superfície

| Superfície                  | Prioridade de experiência                                                          |
| --------------------------- | ---------------------------------------------------------------------------------- |
| Login e recuperação         | Promessa clara, formulário como foco, ajuda e documentos legais acessíveis.        |
| Central                     | Primeiro viewport orientado a decisão, sinais escaneáveis e próxima ação evidente. |
| Oportunidades e SEO         | Evidência, impacto, confiança e recomendação na mesma unidade visual.              |
| Tarefas e aprovações        | Estado, prazo e ação distinguíveis sem abrir cada item.                            |
| Avaliações                  | Nota, conteúdo sensível e estágio da resposta com hierarquia explícita.            |
| Clientes, conexões e equipe | Configuração progressiva, permissões claras e estados vazios acionáveis.           |
| Módulos futuros             | Explicar disponibilidade e próximo passo; nunca simular dados reais.               |
| Páginas legais              | Leitura confortável, navegação institucional consistente e largura controlada.     |

## Critérios verificáveis

1. Navegação interna preserva `performance.timeOrigin`.
2. Menu móvel expõe estado aberto/fechado com `aria-expanded` e pode ser fechado sem navegar.
3. A rota atual expõe `aria-current="page"`.
4. Carregamentos usam skeleton ou indicador de progresso sem deslocamento estrutural relevante.
5. Alvos interativos principais têm pelo menos 44 px em telas de toque.
6. Movimento é removido quando `prefers-reduced-motion: reduce` está ativo.
7. Lighthouse móvel mantém performance >= 0,90, acessibilidade >= 0,95, LCP <= 2,5 s, CLS <=
   0,1 e TBT <= 200 ms.
