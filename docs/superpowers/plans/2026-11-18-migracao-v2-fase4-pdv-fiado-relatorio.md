# Migração Burger House V2 — Fase 4: PDV, Pagamento a Prazo e Relatório — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer da V1 (`git show v1-final:admin.html`) para módulos da V2 o **PDV**, o **Pagamento a Prazo (fiado)**
e o **Relatório**, com o mesmo comportamento de hoje, gravando e lendo `vendas` no formato atual. O cupom usado no
PDV soma `usos`.

**Architecture:** Regras sem tela ficam em `js/nucleo/` (puras, testadas com `node --test`). Telas novas ficam em
`js/admin/pdv.js`, `js/admin/fiado.js` e `js/admin/relatorio.js`, registradas em `ROTAS` (`js/admin/app.js`). Elas
usam `db.js` (inclusive `db.transacao` para pagamento de fiado) e o visual/componentes da V2 (`modal`, `toast`,
`confirmar`, classes de `css/admin.css`). A conferência de tela é feita no ensaio geral (Edge headless sobre o modo
demo com a cópia convertida do backup).

**Tech Stack:** igual às fases anteriores. Sem bibliotecas novas: o gráfico do Relatório usa o mesmo desenho em
HTML/CSS do Dashboard (`js/admin/dashboard.js`), sem Chart.js.

**Spec:** `docs/superpowers/specs/2026-11-16-migracao-burger-house-v2-design.md` (decisões 9, 10, 13).
Entradas: `docs/superpowers/plans/2026-11-17-migracao-v2-fase3-resultado.md` ("Entradas para a Fase 4").
Referência de comportamento: V1 em `v1-final:admin.html`, linhas ~353–520 (HTML) e ~2280–3125 (PDV, fiado,
recibo, relatório, CSV).

## Global Constraints

- **Nada desta fase escreve no banco real.** Toda verificação é no modo demo, e o site no ar continua na V1.
- **Venda do PDV no formato da V1:**
  - venda normal: `{ itens, subtotal, desconto, total, fiado: false, pagamentos: [{forma, valor}] (1 ou 2),
    pagamento: rótulos unidos por ' + ', recebidoDinheiro, troco, cliente (texto ou null), cupom (código ou null),
    criadoEm (ms) }`;
  - fiado: `{ …, fiado: true, valorPago: 0, pagamentosFiado: [], pagamentos: [], pagamento: 'Pagamento a Prazo',
    recebidoDinheiro: null, troco: null, cliente obrigatório }`.
- **Itens da venda na convenção V1** (igual à Fase 3): `{ nome, preco: preço base do produto, qtd, adicionais:
  [{ grupoNome, opcaoNome, nome, preco }], observacao: texto ou null }`, **sem `produtoId`**. Assim
  `valorLinhaItem`/`itemDaVenda` tratam o item como V1.
- **Formas de pagamento do PDV:** `dinheiro`, `pix`, `debito`, `credito`, com rótulos `Dinheiro`, `Pix`, `Débito`,
  `Crédito` (os mesmos da V1).
- **Desconto** = desconto manual + cupom (`percentual` = % do subtotal; `valor`/`fixo` = valor fixo), limitado ao
  subtotal. Cupom `frete` não vale no PDV. Cupom inativo, vencido, abaixo do mínimo ou com `limite` atingido é
  recusado com a mesma mensagem da V2/V1.
- **Dinheiro:** "valor recebido" é obrigatório e precisa ser ≥ a parte em dinheiro. `troco` = recebido − parte em
  dinheiro.
- **Pagamento de fiado:** `{ valor, data: 'AAAA-MM-DD' }` acrescentado a `pagamentosFiado`, e `valorPago` += valor
  aplicado. O valor aplicado é `min(valor, saldo)`, `saldo = max(0, total − valorPago)` e "quitado" = saldo ≤ 0,004.
  É gravado em **transação** que relê a venda.
- **Acesso:**
  - PDV: dono e atendente (a aba `pdv` já está na lista padrão do atendente);
  - Pagamento a Prazo e Relatório: só dono, salvo liberação na Equipe;
  - **Excluir venda: só dono.**
- Toda data de venda é lida com `msDe` (`js/nucleo/faturamento.js`), e todo valor de linha de item com `valorLinhaItem`.
- **Versão:** imports com `?v=` (`node scripts/versao.mjs`). No fim da fase, versão `2.0.0-f4` e `--check` 0.
- Nenhum texto visível com `null`, `undefined` ou `NaN`.

## Review Focus

- **Clique duplo em "Finalizar venda"** (ou F4 apertado duas vezes) não pode gravar duas vendas. Teste
  `finalizar duas vezes grava uma venda` (Task 2, verificação headless), além do botão travado durante a gravação.
- **Pagamento de fiado maior que o saldo, ou feito ao mesmo tempo em dois aparelhos**, nunca deixa `valorPago` >
  `total`. Teste `pagamento maior que o saldo aplica so o saldo` (Task 4) e a transação.
- **Venda antiga da V1** (`criadoEm` já convertido, itens só com `opcaoNome` nos adicionais, `pagamento` como texto)
  aparece certa no Relatório, no recibo e no CSV. Teste `relatorio aceita venda antiga da v1` (Task 5).
- **Recibo compartilhado** (`recibo.html#…`): as linhas somam o subtotal mesmo com adicionais. Teste
  `linhas do recibo somam o subtotal` (Task 3).
- **Atendente** vê o PDV mas não vê Pagamento a Prazo, Relatório nem o botão de excluir venda. Verificação no
  ensaio (Task 6).

---

### Task 1: Regras do PDV (carrinho, desconto, pagamento, montagem da venda)

**Files:**
- Create: `js/nucleo/pdv.js`
- Test: `tests/pdv.test.mjs`

**Interfaces (todas puras):**
- `chaveItem(produtoId, adicionais, observacao) => string`: o mesmo produto com adicionais ou observação diferentes
  vira outra linha.
- `adicionarAoCarrinho(carrinho, produto, adicionais = [], observacao = '') => carrinho novo`. A linha é
  `{ produtoId, nome, preco: preço base (precoPromo se menor), qtd, adicionais: [{grupoNome, opcaoNome, preco}],
  observacao }`; linha com a mesma chave soma `qtd`.
- `alterarQtd(carrinho, indice, delta)`: `qtd` 0 remove a linha. `removerLinha(carrinho, indice)`.
- `precoUnitario(linha) => preco + Σ adicionais.preco`; `subtotalCarrinho(carrinho)`.
- `descontoPDV({ subtotal, manual, cupom }) => number`: segue a constraint e arredonda em 2 casas.
- `validarCupomPDV(cupom, subtotal, hojeISO) => { ok, erro }`.
- `pagamentosPDV({ total, forma1, dividir, forma2, valor2 }) => [{forma, valor}]`: `valor2` fica entre 0 e total, e
  `valor1 = total − valor2`.
- `dinheiroNecessario(pagamentos)`.
- `montarVendaPDV({ carrinho, desconto, cupomCodigo, fiado, pagamentos, recebido, cliente, agora }) => venda`, no
  formato da constraint, itens na convenção V1 (`adicionais[].nome = opcaoNome`).
- `validarVendaPDV({ carrinho, fiado, cliente, pagamentos, recebido, dividir }) => string | null`, com as mensagens
  da V1:
  - carrinho vazio → "Adicione ao menos um produto ao carrinho.";
  - fiado sem cliente → "Informe o nome do cliente para registrar o pagamento a prazo.";
  - 2ª forma com valor inválido → "Informe um valor válido para a 2ª forma de pagamento (menor que o total).";
  - dinheiro recebido menor → "Informe quanto o cliente pagou em dinheiro (valor recebido menor que o necessário).".
- `produtoPorCodigo(produtos, codigo)`: `codigoBarras === codigo` e `disponivel !== false`.
- [ ] **Step 1: Testes que falham** (`tests/pdv.test.mjs`):
  - `mesmo produto com adicionais diferentes vira outra linha`;
  - `qtd zero remove a linha`;
  - `subtotal com adicionais` (X-Bacon 28 + Bacon 10, qtd 2 → 76);
  - `desconto manual mais cupom percentual limitado ao subtotal`;
  - `cupom valor fixo`;
  - `cupom frete recusado no pdv`;
  - `cupom vencido ou no limite recusado`;
  - `pagamento dividido` (total 50, 2ª forma 20 → `[{forma1,30},{forma2,20}]`);
  - `troco so da parte em dinheiro`;
  - `venda normal no formato v1` (chaves exatas, `pagamento 'Dinheiro + Crédito'`, `criadoEm` = agora);
  - `venda fiado no formato v1` (`valorPago 0`, `pagamentosFiado []`, `pagamentos []`, `pagamento 'Pagamento a Prazo'`);
  - `itens sem produtoId e com preco base`;
  - `mensagens de validacao da v1` (as 4 frases exatas);
  - `busca por codigo de barras`;
  - `sem undefined`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** — "Fase 4: regras do PDV".

### Task 2: Tela do PDV

**Files:**
- Create: `js/admin/pdv.js`
- Modify: `js/admin/app.js` (rota `pdv`: nome "PDV", ícone `ti-cash-register`, perfis `['dono','atendente']`),
  `js/admin/cardapio.js` (campo "Código de barras" no formulário do produto, salvo em `codigoBarras`; vazio → `null`),
  `css/admin.css` (layout grade + carrinho; no celular, carrinho embaixo)
- Test: `tests/pdv.test.mjs` (`rota pdv registrada para dono e atendente`, verificação de fonte)

**Comportamento (igual à V1):**
- **Topo:** cards "Vendas hoje" e "Total vendido hoje".
- **Grade de produtos:**
  - busca por nome;
  - o mesmo campo recebe o leitor de código de barras (Enter → `produtoPorCodigo`; achou → adiciona com toast
    "<nome> adicionado!"; senão "Código de barras não encontrado.");
  - produto com grupos de adicionais abre um modal de escolha (respeitando min/max da V2) com campo de observação.
- **Carrinho:**
  - linhas com +/−/remover;
  - cupom (Aplicar);
  - desconto manual;
  - caixa "Pagamento a Prazo (cliente paga depois)": esconde as formas, mostra o aviso da V1 e torna o cliente
    obrigatório;
  - forma de pagamento; "Dividir em 2 formas de pagamento" (2ª forma + valor);
  - quando há dinheiro: "Valor recebido" e "Troco" (vermelho "faltam R$ …" quando insuficiente);
  - campo cliente;
  - subtotal, desconto, total;
  - "Finalizar venda" e "Limpar carrinho";
  - atalhos **F2** (foco na busca), **F4** (finalizar) e **Esc** (limpar).
- **Finalizar:**
  1. trava o botão;
  2. `validarVendaPDV`;
  3. `db.add('vendas', montarVendaPDV(...))`;
  4. com cupom, `cupons/<código>.usos` +1 (melhor esforço, erro só registrado);
  5. toast "Venda finalizada com sucesso!" ou "Pagamento a prazo registrado!";
  6. limpa o carrinho e destrava o botão.
- **"Vendas de hoje"** em tempo real: `db.watch('vendas', { where: [['criadoEm','>=', início do dia]], orderBy:
  ['criadoEm','desc'] })`.
  - Colunas: Horário, Cliente (+ selo de origem: "Online · Entrega/Retirada" se `pedidoOrigem`, nome da mesa se
    `mesaFechamento`), Itens, Pagamento (fiado: "A Prazo — deve R$ X" / "A Prazo — pago"), Total.
  - Ações: imprimir recibo, recibo no WhatsApp e excluir (só dono, com confirmação). Os recibos vêm da Task 3.
  - Venda nova vinda de **outro** aparelho toca o som (`bip` de `js/utils.js`) e mostra o toast "Nova venda
    registrada!". A venda feita no próprio aparelho não dispara isso.
- [ ] **Step 1:** teste de fonte que falha → **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS +
  `node scripts/versao.mjs 2.0.0-f3` + `--check`.
- [ ] **Step 5: Commit** — "Fase 4: tela do PDV".
- [ ] **Step 6: Verificação headless:**
  - venda em dinheiro com troco;
  - venda dividida Pix + Crédito;
  - venda com cupom `BEMVINDO10`, que soma 1 em `usos`;
  - produto com adicionais pelo modal;
  - **F4 duas vezes seguidas grava 1 venda só**;
  - atendente demo vê o PDV e não vê o botão excluir.

### Task 3: Recibo (imprimir e link do WhatsApp)

**Files:**
- Create: `js/nucleo/recibo.js`, `js/admin/recibo.js`
- Test: `tests/recibo.test.mjs`

**Interfaces:**
- `textoPagamento(venda) => string`: `pagamentos` com 1 ou 2 entradas → "Pix: R$ 30,00 + Crédito: R$ 20,00"; se
  `pagamentos` estiver vazio, usa o texto de `pagamento`; fiado → "Pagamento a Prazo".
- `payloadRecibo(venda, nomeLoja) => objeto`, mesmo formato da V1 que `recibo.html` já lê:
  - `{ loja, data (ISO de msDe(criadoEm)), cliente, itens: [{ n, q, p }], subtotal, desconto, cupom, total,
    pagamentos, recebido, troco, fiado, pago, deve }`;
  - `p` = `valorLinhaItem(item) / qtd`, arredondado, para as linhas somarem o subtotal.
- `linkRecibo(venda, nomeLoja, origem) => string`: `` `${origem}/recibo.html#${base64(utf8(JSON))}` ``, como na V1.
- `js/admin/recibo.js`:
  - `imprimirRecibo(venda)`: janela de impressão no estilo da comanda da V2 com loja, data/hora, cliente, linhas,
    subtotal, desconto (com cupom), total e pagamento. Com troco mostra Recebido/Troco; no fiado mostra "PAGAMENTO
    A PRAZO — em aberto/quitado", "Pago até agora" e "Falta pagar".
  - `compartilharRecibo(venda)`: abre `https://wa.me/?text=` com "Aqui está o recibo da sua compra:\n<link>".
- [ ] **Step 1: Testes que falham:**
  - `linhas do recibo somam o subtotal` (venda com adicional);
  - `link decodifica no formato do recibo.html` (base64 → JSON com acentos intactos, chaves exatas);
  - `texto de pagamento dividido`;
  - `fiado mostra pago e deve`;
  - `venda antiga sem pagamentos usa o texto`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar e ligar nas ações do PDV. **Step 4:** PASS.
- [ ] **Step 5: Commit** — "Fase 4: recibo impresso e pelo WhatsApp".

### Task 4: Pagamento a Prazo (fiado)

**Files:**
- Create: `js/nucleo/fiado.js`, `js/admin/fiado.js`
- Modify: `js/admin/app.js` (rota `fiado`: "Pagamento a Prazo", ícone `ti-hand-finger` ou equivalente, perfis
  `['dono']`)
- Test: `tests/fiado.test.mjs`

**Interfaces:**
- `saldoFiado(v)`, `quitado(v)`.
- `aplicarPagamentoFiado(venda, valor, dataISO) => { valorPago, pagamentosFiado, aplicado, quitado } | { erro }`:
  - valor ≤ 0 → erro "Informe um valor de pagamento válido.";
  - sem data → erro "Informe a data do pagamento.";
  - venda já quitada → erro.
- `filtrarFiados(vendas, filtro: 'aberto' | 'quitado' | 'todos')`: do mais novo para o mais antigo, por `msDe`.
- **Tela:**
  - cards "Em aberto" (quantidade) e "Total a receber";
  - filtro;
  - tabela: Cliente, Data da venda, Itens, Total, Pago, Deve (vermelho/verde), Status ("A Prazo"/"Pago");
  - ações: registrar pagamento (só em aberto), imprimir recibo, WhatsApp, excluir (dono).
  - **Registrar pagamento:** modal com resumo ("<cliente> — deve R$ X"), valor e data (padrão hoje). Grava com
    `db.transacao`, que relê a venda, aplica `aplicarPagamentoFiado` e faz `update` de `valorPago` e
    `pagamentosFiado`. Toast "Pagamento registrado — dívida quitada!" ou "Pagamento registrado. Ainda falta
    receber.".
- [ ] **Step 1: Testes que falham:**
  - `pagamento parcial`;
  - `pagamento maior que o saldo aplica so o saldo`;
  - `quita com centavos de arredondamento` (saldo 0,004 = quitado);
  - `valor invalido e sem data`;
  - `filtros`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `--check`.
- [ ] **Step 5: Commit** — "Fase 4: Pagamento a Prazo".

### Task 5: Relatório

**Files:**
- Create: `js/nucleo/relatorio.js`, `js/admin/relatorio.js`
- Modify: `js/admin/app.js` (rota `relatorio`: "Relatório", ícone `ti-report-analytics`, perfis `['dono']`)
- Test: `tests/relatorio.test.mjs`

**Interfaces:**
- `periodoRelatorio(mesISO 'AAAA-MM', dia: number|null) => { ini, fim }`, em ms e horário local.
- `diasDoMes(mesISO)`.
- `resumoRelatorio(vendas) => { quantidade, faturamento, ticket }`: soma de `total`, inclusive fiado, como na V1.
- `totaisPorDia(vendas, mesISO) => number[]`.
- `csvRelatorio(vendas) => string`:
  - BOM + cabeçalho `Data;Hora;Cliente;Itens;Pagamento;Cupom;Subtotal;Desconto;Total`;
  - campos entre aspas, `"` duplicado, linhas separadas por `\r\n`, valores com 2 casas e ponto;
  - itens "2x X-Bacon | 1x Coca"; pagamento por `textoPagamento`.
- **Tela:**
  - mês (`<input type=month>`, padrão o mês atual) + dia ("Mês inteiro", Dia 01…), Limpar, Exportar CSV;
  - cards Vendas, Faturamento e Ticket médio, com rótulos "no mês"/"no dia";
  - gráfico de barras por dia (mesmo desenho do Dashboard);
  - tabela com Data, Hora, Cliente + selo de origem, Itens, Pagamento, Total e ações (recibo, WhatsApp, excluir só
    dono).
  - Consulta: `db.list('vendas', { where: [['criadoEm','>=',ini],['criadoEm','<',fim]], orderBy:
    ['criadoEm','desc'] })`.
  - Download do CSV: `vendas-AAAA-MM.csv`.
- [ ] **Step 1: Testes que falham:**
  - `periodo do mes e do dia` (fevereiro de 2028 com 29 dias);
  - `resumo inclui fiado`;
  - `totais por dia`;
  - `csv com aspas e acentos`;
  - `relatorio aceita venda antiga da v1` (adicionais só com `opcaoNome`, `pagamento` texto, `pedidoOrigem`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `--check`.
- [ ] **Step 5: Commit** — "Fase 4: Relatório".

### Task 6: Ensaio geral da Fase 4 e versão `2.0.0-f4`

- [ ] **Step 1:** `node scripts/versao.mjs 2.0.0-f4`; `npm test` e `--check` → PASS/0. **Commit** — "Fase 4: versão 2.0.0-f4".
- [ ] **Step 2: Ensaio headless** (Edge + CDP, scripts e capturas no scratchpad), com a cópia do backup mais novo e
  "Loja aberta 24h". Conferir e registrar no relatório, com captura:
  1. PDV: venda em dinheiro com troco; venda dividida; venda com cupom (`usos` +1); produto com adicionais.
  2. F4 duas vezes → 1 venda.
  3. Venda fiado de R$ 50 → aparece em Pagamento a Prazo; pagar 20 (Deve 30); pagar 40 (aplica 30, "quitada").
     O Financeiro do mês mostra 50 recebidos nas datas dos pagamentos, e o Dashboard conta 50 na data da venda.
  4. Relatório de out/2026: as 8 vendas antigas, com totais iguais aos do backup. Relatório do mês atual: as vendas
     do ensaio. CSV baixado com as linhas corretas.
  5. Recibo: o link do WhatsApp abre `recibo.html` com as linhas somando o subtotal.
  6. Atendente demo: vê PDV, Pedidos e Mesas; não vê Pagamento a Prazo, Relatório nem o excluir venda.
  7. Nenhum texto `null`/`undefined`/`NaN` nas telas novas.
  Falha encontrada é um achado: corrigir na própria tarefa (TDD quando for regra) e repetir o item. Questão de
  decisão (não de defeito) vai para "Precisa de decisão" sem decidir.
