# Migração Burger House V2 — concluída

**No ar em 2026-11-18** (commit `b2d4513` no `main`, versão `2.0.0`, 225 testes). V1 preservada na tag `v1-final`.

## O que foi feito no corte (Fase 5)

1. Backup completo: `backups/backup-2026-11-17-2352.json`. Contagens: produtos 35, categorias 5, mesas 15,
   cupons 1, pedidos 44, vendas 8.
2. Limpeza dos dados de teste, confirmada pela usuária: 44 pedidos e 8 vendas apagados (52 operações). Produtos,
   fotos, categorias, adicionais, mesas, configuração e cupom foram mantidos.
3. Variáveis `FIREBASE_PROJECT_ID` e `FIREBASE_API_KEY` cadastradas na Vercel (prévia `/p/ID`).
4. Regras finais publicadas (`firestore.rules`): acrescentam `vendas` (equipe lê/grava, só a dona apaga) e restringem
   a exclusão de pedido à dona.
5. Merge `v2` → `main`; a Vercel publicou.
6. Conferência de produção: `conferir-cabecalhos` "Tudo certo".
   - Cabeçalhos e páginas: `/`, QR `/index.html?mesa=…` 200, `/admin/`, `sw.js` sem cache, `versao.json` 2.0.0,
     JS/CSS revalidando, fotos com 1 dia de cache, `/admin.html` → `/admin/`, `/p/10` com a foto do X-Bacon.
   - Leitura anônima: produtos 35, `config/loja` e cupom legíveis; vendas e pedidos negados.

## Pendente

- Teste completo no celular pela usuária (passo 7 do plano): QR impresso, pedido de mesa, aviso no painel, fechar conta,
  PDV, relatório e prévia no WhatsApp.
- Banner novo (prompt entregue; colocar em Configurações › Dados da loja).

## Pequenos pontos em aberto

Listados nos resultados das Fases 2, 3 e 4 (`docs/superpowers/plans/*-resultado.md`). São detalhes de exibição e de
robustez das ferramentas internas, sem risco para os dados.
