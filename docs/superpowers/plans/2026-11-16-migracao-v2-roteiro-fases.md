# Migração Burger House V2 — Roteiro das fases

**Spec:** `docs/superpowers/specs/2026-11-16-migracao-burger-house-v2-design.md`

Cada fase tem o próprio plano detalhado (`2026-11-xx-migracao-v2-faseN-*.md`),
escrito logo antes de ser executada, com o que a fase anterior ensinou. Toda fase
termina com algo testável e com a V1 ainda no ar, sem alteração, até a Fase 5.

## Como o trabalho fica isolado

- O código V1 de produção vive no `main` (tag `v1-final`). A V2 é construída no
  branch `v2`, onde os arquivos da raiz já **são** a V2 (`index.html`, `admin/`,
  `js/`, `css/`, `sw.js`). Não há prefixo `v2-` como no Manejo Mix: o isolamento
  vem do branch, e a Vercel publica só o `main` em produção. O branch `v2` vira um
  endereço de prévia.
- Os testes automáticos rodam com `node --test` (Node 22, sem dependências),
  sobre funções puras: conversões da migração, versionamento e estratégia do SW.

## Fases

| Fase | Entrega | Mexe no banco real? | Visível para clientes? |
|---|---|---|---|
| **1. Fundação** | Base do cardapio-online50k no branch `v2` com a identidade e o Firebase do Burger House; versionamento único de arquivos; SW novo que aposenta o cache da V1; `vercel.json`; prévia na Vercel com cabeçalhos conferidos | Não | Não |
| **2. Dados** | Ferramenta de backup (JSON); funções de conversão de todas as coleções, testadas contra o backup real; regras de transição; passos aditivos aplicados (config, adicionais, equipe, contadores, campos novos em produtos/categorias/mesas/cupons); ensaio geral em modo demo com cópia completa dos dados | Sim, só aditivo (V1 não percebe) | Não |
| **3. Adaptações da V2 ao Burger House** | Mesas pelo nome e IDs antigos (QR impressos); fotos por caminho, inclusive na prévia `/p/ID`; `vendas` como fonte de faturamento no Dashboard e no Financeiro; fechar mesa gera venda consolidada; pedido online entregue gera venda; fiado no Financeiro; abas padrão do atendente; identidade dourado/preto | Não (só testes marcados "TESTE") | Não |
| **4. PDV, Fiado e Relatório** | Os três módulos portados da V1 para módulos da V2, mesmo comportamento, lendo e gravando `vendas` no formato atual; cupom do PDV soma `usos` | Não (só testes marcados) | Não |
| **5. Corte** | Roteiro do corte ensaiado; regras finais; migração dos campos que a V1 lê (status/criadoEm de pedidos e vendas), contador de pedidos; merge no `main`; verificação de cabeçalhos/SW/celular com V1 instalada; rollback pronto | Sim (no horário combinado) | Sim |

## Portões entre as fases

- Fim da Fase 2: o backup foi baixado e conferido (contagens batem com o
  Firestore), e a V1 em produção continua funcionando depois dos passos
  aditivos. Verificar isso abrindo o site e o admin no ar.
- Fim da Fase 4: o ensaio geral em modo demo passa pelo roteiro completo
  (cardápio, QR de uma mesa com ID antigo, pedido, kanban, fechar mesa, PDV,
  fiado com pagamento parcial, relatório, dashboard) com os dados reais copiados.
- Fase 5 só começa com a usuária escolhendo o horário do corte.
