# Migração Burger House V2 — Fase 2 (dados): resultado e entradas para as próximas fases

**Plano:** `2026-11-16-migracao-v2-fase2-dados.md` · concluída em 2026-11-17 (commits `0ddbe34..4f7e3aa`, 102 testes).

## O que foi feito no banco real (moda-63d8d)

- Backups: `backups/backup-2026-11-16-2317.json` e `backups/backup-2026-11-16-2346.json` (fora do git e do deploy).
  Contagens V1: produtos 35, categorias 5, cupons 1, configuracoes 1, gruposAdicionais 5,
  tiposVariacao 0, mesas 15, pedidos 44, vendas 8, usuarios 0.
- Regras de transição (`regras/transicao.rules`) publicadas pela usuária. As regras publicadas antes eram
  idênticas a `regras/v1.rules`.
- Migração aditiva aplicada (62 operações; replanejar → 0). Conferido por REST: campos V1 intactos em
  35/35 produtos; mesas numeradas 1–15 com nomes intactos; `config/loja` e 5 `adicionais` criados;
  `configuracoes/geral` e `gruposAdicionais` idênticos.
- V1 em produção conferida pela usuária depois de cada passo (cardápio, carrinho, admin).

## Entradas para a Fase 3 (do ensaio geral com a cópia completa)

1. **QR impresso quebra (prioridade máxima):** `js/cliente.js:826` faz `soDigitos(q.get('mesa'))` e
   corrompe o id real da mesa (`0T0IAUJFCzRUchfFR7a3` → `0073`).
2. A V2 abre a mesa por id do documento; mesas reais têm id automático e `numero` 1–15. Decidir: QR antigo
   por id (obrigatório) e QR novo por id ou por número.
3. Mesa não encontrada mostra o valor bruto ("Mesa 0073"); o banner usa `d.numero ?? E.mesa` e ignora o
   `nome` ("Comanda 11" aparece como "Mesa 11").
4. Admin › Mesas mostra "Mesa N" para todas; deve usar `nome` quando houver.
5. Admin › Pedidos só observa os últimos 2 dias (`js/admin/app.js:154`); os 44 pedidos antigos não aparecem
   em lugar nenhum. Falta tela/consulta de histórico.
6. 43 de 44 pedidos têm `numero: null` (a V1 não numerava pedidos de mesa) e 1 tem número em código
   (`JC2ZJ5UP`). Telas com `#${numero}` mostrariam "#null" (`js/cliente.js:725`, `js/pedido.js`). Definir a exibição
   (ex.: nome da mesa / código).
7. Pedidos antigos de mesa guardam `mesa` = id do documento da mesa e `mesaNome`; telas de conta de mesa
   devem resolver id → nome.
8. Dashboard lê `pedidos`; o faturamento real está em `vendas` (decisão 10 da spec): adaptar Dashboard e
   Financeiro.
9. Nenhuma tela V2 lê `vendas` ainda (formato V1: `pagamentos`, `recebidoDinheiro`, `fiado`,
   `pedidoOrigem`, `mesaFechamento`).
10. `/index.html?mesa=` deve continuar respondendo 200 sem redirecionar na Vercel (sem `cleanUrls`; conferir
    com `scripts/conferir-cabecalhos.mjs` no corte).
11. Horário migrado 06:00–23:00 fecha a loja fora do horário; para ensaiar pedidos fora do horário, ajustar a
    config no modo demo.

Também para a Fase 3: `pagamento.forma` chega em minúsculas (`pix`) e o endereço de delivery antigo vem em
`endereco: { texto, cep }`.

## Entradas para a Fase 5 (corte)

- A conversão de pedidos/vendas no corte usa `planejarCorte` (`ferramentas/plano.mjs`), segura para rodar
  várias vezes. No backup real: 44 pedidos + 8 vendas a converter; replanejar → 0. Falta a tela de
  execução (no estilo de `ferramentas/migrar.html`).
- `contadores/pedidos`: as regras só permitem criar com `n == 1`. Com os dados reais o maior número é 0,
  então o corte **não** deve criar o contador (a V2 cria no primeiro pedido). Ajustar `planejarCorte` para
  pular a criação quando `n` for 0, e ler o contador com `getDoc`: a listagem de `contadores` é negada.
- Conferir de novo, no backup do corte, que os pedidos V1 continuam usando `mesaId` (e não `mesa`).
- Não há ferramenta de restauração. O rollback é Instant Rollback da Vercel + regras V1, e funciona porque a
  migração é aditiva. A conversão do corte reescreve `status`/`criadoEm`, então o backup do corte é
  a rede de segurança.
- Spot-check em `cupons/BEMVINDO10.descricao` no banco ("10% de desconto").

## Decisões tomadas durante a execução (com custo se estiverem erradas)

- `usuarios` está vazio → `equipe` fica vazia; o acesso é pelo superadmin `admin@gmail.com`. Custo: nenhum.
- `numero` null (mesa) e em código mantidos como estão. Custo: ajuste visual na Fase 3.
- `pagamento.forma` em minúsculas; endereço do delivery copiado para `endereco {texto, cep}`. Custo: exibição, corrigível na Fase 3.
- Comparação das regras publicadas antes de publicar a transição. Custo: nenhum.
- `cupons.validade` null mantido (a V2 trata null como "sem validade"). Custo: nenhum.
- `categorias.ativo: true` acrescentado (a V1 não lê esse campo). Custo: nenhum.
- Telas não corrigidas na Fase 2; tudo listado acima para a Fase 3. Custo: nenhum (V2 não está em produção).
- `mesa: doc.mesaId ?? null` mantido: 44/44 pedidos têm `mesaId`, 0 têm `mesa`. Custo: nenhum com os dados reais.

## Pequenos pontos deixados para depois

- Cupom percentual/fixo sem `valor` geraria "undefined% de desconto"; "Mesa 0" vira número 0 sem aviso;
  grupo de adicionais sem opções vira `max 0` sem aviso.
- `migrar.html`: botão Aplicar volta habilitado com o plano antigo após erro (seguro pela releitura); sem
  aviso quando a conta logada não é o superadmin; opção de adicional sem nome/preço falha o lote (falha segura).
- Teste de guarda do demo usa janela de 250 caracteres; uma asserção tautológica em `tests/ensaio.test.mjs`.
- `conferir-backup.mjs` sem `--esperado` aceita backup sem `colecoes`; `js/seed.js` sem guarda própria.
