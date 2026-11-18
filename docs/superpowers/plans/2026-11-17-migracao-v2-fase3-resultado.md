# Migração Burger House V2 — Fase 3 (adaptações): resultado e entradas para as Fases 4 e 5

**Plano:** `2026-11-17-migracao-v2-fase3-adaptacoes.md` · concluída em 2026-11-17 (commits `3e3e1a4..b899ae0`,
172 testes, versão `2.0.0-f3`). Nada foi gravado no banco real; toda verificação foi no modo demo com a cópia
convertida do backup (ensaio geral 9/9).

## O que a V2 passou a fazer

- **QR impresso:** `?mesa=<id do documento>` é usado literalmente (`js/nucleo/mesas.js`). Mesas aparecem pelo `nome`
  ("Comanda 11"). Os QR novos usam o mesmo formato `/index.html?mesa=<id>`. O nome da mesa é editável.
- **Pedidos:** rótulo legível (`rotuloPedido`), endereço/pagamento antigos (`enderecoTexto`, `pagamentoRotulo`),
  aba **Histórico** com período e busca, e excluir pedido só para o dono. Pedido de mesa grava `mesaNome`.
- **Vendas como na V1** (`js/nucleo/vendas.js`):
  - Pedido online entregue → 1 venda com id `ped-<pedidoId>`.
  - Fechar mesa → 1 venda consolidada com id `mesa-<menor pedidoId>`, gravada numa **transação** que relê os pedidos
    e recusa conta já fechada.
  - Itens das vendas seguem a convenção da V1: preço base, com os adicionais à parte. Item V2 é identificado por
    `produtoId`.
  - O desconto da venda da mesa é a soma dos descontos dos pedidos.
  - O cupom usado em mesa conta no limite de usos.
- **Finalizar uma vez só:** `mudarStatus` relê o pedido e ignora status repetido. `contabilizar` roda em
  transação (fidelidade/cliente/cupom contam uma vez, mesmo com dois aparelhos).
- **Dashboard e Financeiro** leem `vendas` (`js/nucleo/faturamento.js`). O fiado entra no faturamento na data da
  venda e no caixa na data de cada pagamento, e o saldo aberto aparece em "a receber". 'Fiado' saiu das categorias
  de contas a receber.
- **Prévia `/p/ID` no WhatsApp** com a foto do site.
- **Atendente sem abas definidas** vê Pedidos, Mesas e PDV; Cardápio é do dono. O painel não quebra se a pessoa
  ficar sem abas.
- **Identidade:** dourado `#d4af37` e preto `#1c1c1c`, com texto calculado por contraste (WCAG). `og-image.png`
  feito com o logo.
- **Delivery sem bairros cadastrados:** endereço livre e taxa = `config.loja.taxaPadrao`, como a V1 faz hoje.
  Com bairros cadastrados, vale a regra por bairro.
- **Correção crítica achada no ensaio:** o campo numérico `id` dos produtos da V1 sobrescrevia o id do
  documento, e nenhum produto abria. Agora `comId()` em `js/db.js` faz o id do documento sempre vencer.

## Entradas para a Fase 4 (PDV, Fiado, Relatório)

- Gravar vendas no **mesmo formato** das vendas que a V2 já grava, com itens na convenção V1. Se o PDV gravar
  `produtoId` nos itens, ele também precisa seguir `itemDaVenda` (preço base). Os testes da convenção estão em
  `tests/vendas.test.mjs`.
- O fiado deve gravar `pagamentosFiado: [{ valor, data: 'AAAA-MM-DD' }]` e `valorPago`, como a V1. O Financeiro já lê
  esse formato.
- O Relatório deve usar `total` (a taxa de entrega só está dentro do total) e `msDe` para as datas.
- Aba `pdv` já está na lista padrão do atendente. Ao criar a rota, ela passa a aparecer.

## Entradas para a Fase 5 (corte) — regras do Firestore finais

O `firestore.rules` atual (V2) **não tem `match /vendas`**: sem isso toda venda seria negada depois do corte.
Acrescentar:
1. `/vendas/{id}`: `read` e `list` para `equipe()`; `create` e `update` para `equipe()` (o mesmo id é regravado
   numa nova tentativa, e a transação da mesa faz `set`); `delete` só `dono()`. A Fase 4 acrescenta a
   atualização de `pagamentosFiado`/`valorPago`.
2. `/pedidos` delete → só `dono()`.
3. Conferir se nenhuma tela usa `usuarios`, `configuracoes`, `tiposVariacao` ou `gruposAdicionais` antes de
   publicar as regras finais, porque elas não têm essas coleções.
4. Testar uma vez o fechamento de mesa contra as regras de transição. Testar também no emulador ou na prévia o
   limite de 20 acessos `exists/get` das regras numa transação com muitos pedidos.
5. Manter: cliente só muda `chamado`/`chamadoEm`/`contaPagamento` na mesa; equipe só muda `usos` no cupom.

Também para a Fase 5 (do resultado da Fase 2): conversão dos pedidos e vendas com `planejarCorte` (não criar o
contador com n=0), backup do corte, `scripts/conferir-cabecalhos.mjs` na produção, `/index.html?mesa=` sem
redirecionar.

## Decisões tomadas durante a execução (com custo se estiverem erradas)

- Antes do corte, a prévia não acha vendas/pedidos antigos com data no formato Timestamp. Aceito: o corte
  converte tudo. Custo: dashboard vazio na prévia até o corte.
- Pedidos com id de mesa "limpo" pela V2 antiga não existem em produção. Custo: nenhum.
- Ids fixos para as vendas, além do `vendaId`. Custo: nenhum.
- Desconto da venda online = cupom + fidelidade; a taxa fica só dentro do total. Custo: relatório de descontos
  diferente da V1.
- O Financeiro busca as vendas fiado à parte e junta por id. Custo: uma leitura a mais.
- O dinheiro recebido aparece em dois cards ("Vendas recebidas no mês" e "Recebido"), e o saldo soma os dois.
  Custo: ajuste de rótulo.
- O texto sobre a cor reaproveita `--on-pri`/`--on-sec` calculados por contraste. Custo: nenhum.
- Paleta dourada acrescentada às opções de cor. Custo: nenhum.
- D1, D2 e D3: delivery sem bairros, convenção de item nas vendas e valor da linha do item (descritos acima).
  Custo: dona precisa cadastrar bairros para cobrar por bairro; o resto afeta só a exibição ou o relatório.

## Pequenos pontos deixados para depois

- Uma falha de rede durante o `contabilizar` em transação não é refeita. O toast "cancelado" aparece mesmo quando
  outro aparelho já finalizou. Um card velho do kanban pode voltar um pedido de etapa (pré-existente).
- Um listener se acumula a cada abertura da aba Pedidos. A regravação da mesma venda troca o `criadoEm`. O
  título da mesa não se redesenha enquanto o campo de nome tem foco.
- Opção "24h" do ensaio sem `config.loja` não avisa. `x-forwarded-host` é aceito na prévia de produto
  (a Vercel sobrescreve). Faltam testes de hex de 3 dígitos e da classe `.vazio`.
