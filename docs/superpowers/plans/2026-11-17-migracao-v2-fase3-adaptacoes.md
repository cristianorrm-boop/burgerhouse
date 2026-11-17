# Migração Burger House V2 — Fase 3: Adaptações da V2 ao Burger House — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as telas da V2 funcionarem com os dados e costumes do Burger House:
- QR Codes impressos abrem a mesa certa;
- mesas e comandas aparecem pelo nome;
- pedidos antigos têm histórico e rótulo legível;
- fechar mesa e entregar pedido online gravam a venda, como na V1;
- Dashboard e Financeiro leem `vendas`;
- a prévia de produto no WhatsApp mostra a foto;
- o atendente tem as abas certas;
- a identidade dourado/preto vale em toda a V2.

**Architecture:** Toda regra nova sem tela fica em módulos puros em `js/nucleo/`: não importam `db.js`, não tocam DOM nem `localStorage`. Os testes importam esses módulos direto no Node, graças a `js/package.json` com `{"type":"module"}`. As telas (`js/admin/*.js`, `js/cliente.js`, `js/pedido.js`) só chamam esses módulos. O que é tela é conferido no ensaio geral (Edge headless sobre o modo demo com a cópia convertida dos dados reais, `ferramentas/ensaio.html`).

**Tech Stack:** igual às fases anteriores. Módulos ES sem build, Firebase modular via CDN, `node --test`, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-16-migracao-burger-house-v2-design.md` (decisões 3, 6, 7, 10, 13 e "Hospedagem, cache e versionamento").
Entradas desta fase: `docs/superpowers/plans/2026-11-17-migracao-v2-fase2-resultado.md` ("Entradas para a Fase 3", itens 1–11).

## Global Constraints

- **Nada desta fase escreve no banco real.** Toda verificação é em modo demo (`?demo=1`, só em localhost) com a cópia do backup. O site no ar continua na V1 e o `main` não muda.
- **QR impresso:** o link `index.html?mesa=<id do documento>` (ex.: `?mesa=SfyFdUBaBRDchD1MlFFK`) tem que abrir a mesa daquele documento. O valor de `?mesa=` é usado **literalmente**, sem `soDigitos`, como id do documento.
- **Nome da mesa:** `nome` quando existir ("Mesa 3", "Comanda 12"); senão `"Mesa " + numero`.
- **Formato das vendas:** igual ao da V1, para PDV, Fiado e Relatório (Fase 4) lerem tudo igual. Campos:
  - `itens [{nome, preco, qtd, adicionais?, observacao?}]`, `subtotal`, `desconto`, `total`;
  - `fiado: false`;
  - `pagamentos [{forma, valor}]`, `pagamento` (rótulo);
  - `recebidoDinheiro`, `troco`, `cliente` (texto), `cupom`;
  - `criadoEm` em **milissegundos (número)**.
  - Venda de pedido online leva `pedidoOrigem: {pedidoId, origem, numeroPedido}`. Venda de mesa leva `mesaFechamento: {mesaId, mesaNome, pedidoIds}`.
- **Uma venda por fato:**
  - pedido online (delivery/retirada) chegando a `entregue` gera **uma** venda, protegida por `vendaId` no pedido;
  - pedido de mesa **nunca** gera venda sozinho;
  - fechar a conta da mesa gera **uma** venda consolidada; a forma de pagamento é escolhida pela equipe, já marcada com a que o cliente pediu.
- **Fiado:**
  - no Dashboard conta o `total` na data da venda;
  - no Financeiro (caixa), cada `pagamentosFiado[{valor, data:'AAAA-MM-DD'}]` entra na data dele, e o saldo `total − valorPago` aparece em "a receber";
  - a categoria manual "Fiado" sai de `contas_receber`.
- **Atendente sem lista de abas** vê `['pedidos', 'mesas', 'pdv']`. Cardápio, Cupons, Clientes, Financeiro, Entrega, Configurações e Dashboard são só do dono, salvo liberação na Equipe.
- **Identidade:** `tema.primaria #d4af37`, `tema.secundaria #1c1c1c`. Texto sobre a cor primária com contraste ≥ 4,5:1.
- **Versão:** todo `import` novo leva `?v=` (via `node scripts/versao.mjs`). No fim da fase a versão passa a `2.0.0-f3`, e `node scripts/versao.mjs --check` sai 0.
- **Rótulo de pedido nunca mostra `null`, `undefined` nem `NaN`.**

## Review Focus

- **QR com id que contém dígitos e letras** (`0T0IAUJFCzRUchfFR7a3`, que hoje vira `0073`). Teste `id do link e usado literalmente` (Task 1) e a verificação headless da mesa 6 (Task 1, Step 6).
- **Clicar duas vezes em "entregue" / fechar a conta duas vezes** (internet lenta, dois atendentes) não pode gerar duas vendas. Testes `nao gera venda se ja tem vendaId` e `mesa ja fechada nao gera venda` (Task 3).
- **Venda antiga com `criadoEm` Timestamp** (antes do corte o banco real ainda tem esse formato) não pode derrubar Dashboard nem Financeiro. Teste `aceita criadoEm timestamp date e numero` (Task 4).
- **Pedido antigo sem número, com código ou só com `mesaId`** sempre ganha um rótulo legível. Teste `rotulo nunca tem null` (Task 2).
- **Contraste do texto** sobre a cor configurada pela dona (dourado claro ou cor escura). Teste `texto escuro sobre dourado e claro sobre preto` (Task 6).

---

### Task 1: QR Codes impressos e mesas pelo nome

**Files:**
- Create: `js/package.json` (`{"type":"module"}`), `js/nucleo/mesas.js`
- Modify: `js/cliente.js` (leitura de `?mesa=`, `iniciarMesa`, `renderMesa`), `js/admin/mesas.js` (títulos, QR, nova mesa), `js/admin/app.js` (notificação de chamado), `.vercelignore` (+ `js/package.json`), `tests/publicacao.test.mjs`
- Test: `tests/mesas.test.mjs`

**Interfaces:**
- Produces (`js/nucleo/mesas.js`):
  - `idMesaDoLink(valor: string|null) => string|null`: `trim` e nada mais. Vazio vira `null`.
  - `nomeMesa(m: {nome?, numero?, id?}) => string`: `m.nome` se existir e não for vazio; senão `` `Mesa ${m.numero}` `` se houver número; senão `'Mesa'`.
  - `urlMesa(origem: string, id: string) => string`: `` `${origem}/index.html?mesa=${encodeURIComponent(id)}` ``. É o mesmo formato dos QR impressos pela V1.
  - `proximaMesa(mesas: Array<{id, numero}>) => { id: string, numero: number }`: `numero` = maior + 1; `id` = `String(numero)`, ou `String(numero) + '-' + n` se esse id já existir.
- [ ] **Step 1: Testes que falham** (`tests/mesas.test.mjs`, importa `../js/nucleo/mesas.js`):
  - `id do link e usado literalmente`: `idMesaDoLink(' 0T0IAUJFCzRUchfFR7a3 ')` → `'0T0IAUJFCzRUchfFR7a3'`; `idMesaDoLink('')` → `null`.
  - `nome da comanda`: `nomeMesa({nome:'Comanda 11', numero:11})` → `'Comanda 11'`; `nomeMesa({numero:4})` → `'Mesa 4'`.
  - `url igual ao qr impresso`: `urlMesa('https://burgerhouse-nine.vercel.app', 'SfyFdUBaBRDchD1MlFFK')` → `'https://burgerhouse-nine.vercel.app/index.html?mesa=SfyFdUBaBRDchD1MlFFK'`.
  - `proxima mesa`: com números 1..15 e ids automáticos → `{id:'16', numero:16}`; com uma mesa de id `'16'` já existente → `{id:'16-2', numero:16}`.
  - `cliente nao limpa o id da mesa`: `js/cliente.js` não contém `soDigitos(q.get('mesa'))` e usa `idMesaDoLink`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar `js/nucleo/mesas.js`. Ajustes nas telas:
  - **Cliente:** guarda o id literal; o banner mostra `nomeMesa(d)`; mesa não encontrada mostra "Mesa não encontrada. Peça ajuda ao atendente.", sem repetir o valor do link.
  - **Admin Mesas:** títulos, cartões, modal e confirmações usam `nomeMesa`; QR Codes e "Abrir link" usam `urlMesa(location.origin, m.id)`; "Nova mesa" usa `proximaMesa` e grava `nome: 'Mesa N'`; o nome é editável no modal da mesa, com campo de texto e Salvar.
  - **Admin app.js:** notificações usam `nomeMesa`.
  - Rodar `node scripts/versao.mjs 2.0.0-f1` para versionar os imports novos.
- [ ] **Step 4:** `npm test` → PASS; `node scripts/versao.mjs --check` → 0.
- [ ] **Step 5: Commit** — "Fase 3: QR impresso abre a mesa certa e mesas pelo nome".
- [ ] **Step 6: Verificação headless** (Edge + CDP, scripts no scratchpad, nunca no repositório):
  - com o ensaio carregado a partir do backup mais novo, `/?mesa=0T0IAUJFCzRUchfFR7a3&demo=1` mostra o banner "Mesa 6";
  - o id da "Comanda 11" mostra "Comanda 11";
  - no admin demo, a aba Mesas lista "Comanda 11"…"Comanda 15" e o QR da Mesa 1 codifica `.../index.html?mesa=SfyFdUBaBRDchD1MlFFK`. Para conferir, ler o `href` de "Abrir link".

### Task 2: Rótulo de pedido, endereço/pagamento antigos e histórico

**Files:**
- Create: `js/nucleo/pedidos.js`
- Modify: `js/admin/acoes.js` (`cancelar`, `imprimir`, `enderecoTexto`, `pagamentoTexto`), `js/admin/app.js` (notificação), `js/admin/impressora.js`, `js/admin/mesas.js` (lista de pedidos da conta), `js/admin/pedidos.js` (cartões, detalhe, cancelar, **aba Histórico**), `js/cliente.js` (barra de acompanhamento), `js/pedido.js`
- Test: `tests/pedidos.test.mjs`

**Interfaces:**
- Consumes: `nomeMesa` (Task 1).
- Produces (`js/nucleo/pedidos.js`):
  - `rotuloPedido(p, mesasPorId = {}) => string`, na ordem:
    1. `numero` inteiro positivo → `#12`;
    2. `numero` texto não vazio → `#JC2ZJ5UP`;
    3. pedido de mesa → `p.mesaNome` ou o `nomeMesa` de `mesasPorId[p.mesa]`, senão `'Mesa'`;
    4. senão `'#' + p.id.slice(0, 5).toUpperCase()`.
  - `enderecoTexto(e) => string`: `e.texto` (+ `' · CEP ' + e.cep`) quando existir; senão o formato V2 atual (rua, número, bairro…); `''` para vazio.
  - `pagamentoRotulo(forma) => string`: aceita maiúsculas/minúsculas (`'PIX'`, `'pix'`) pelo mapa `PAGAMENTOS`; desconhecido volta como veio; vazio → `''`.
  - `filtroHistorico(pedidos, { ini, fim, busca }) => pedido[]`: por `criadoEm` em ms, `ini <= criadoEm < fim`, com busca sem acento e sem maiúsculas em cliente, `mesaNome` e rótulo, ordenado do mais novo para o mais antigo.
- [ ] **Step 1: Testes que falham** (`tests/pedidos.test.mjs`):
  - `rotulo numerico`, `rotulo em codigo`;
  - `rotulo de mesa antiga` (`{numero:null, tipo:'mesa', mesa:'XT6iO2dCBe7bPruPk0v2', mesaNome:'Mesa 2'}` → `'Mesa 2'`);
  - `rotulo sem nada usa id`;
  - `rotulo nunca tem null`: para uma lista de pedidos estranhos (campos ausentes, `numero: NaN`, `numero: 'null'`), o rótulo nunca contém `null`/`undefined`/`NaN`;
  - `endereco antigo` (`{texto:'Rua A, 10', cep:'38400-000'}` → `'Rua A, 10 · CEP 38400-000'`) e `endereco v2`;
  - `pagamento em maiusculas` (`'PIX'` → `'Pix'`);
  - `historico filtra e ordena`.
  - E também: nenhum arquivo em `js/` contém `` #${p.numero} `` nem `` #${d.numero} `` (verificação de fonte).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar o módulo e trocar todo `#${…numero}` por `rotuloPedido`. Nas telas sem `store`, passar `{}`: o rótulo cai em `mesaNome`.
  - **Aba Histórico** em Pedidos, ao lado do kanban: período (Hoje / 7 dias / 30 dias / De–Até), padrão 30 dias, e campo de busca. Carrega com `db.list('pedidos', { where: [['criadoEm','>=',ini],['criadoEm','<',fim]], orderBy: ['criadoEm','desc'] })` e filtra com `filtroHistorico`. A tabela mostra data/hora, rótulo, tipo, cliente/mesa, total e status; clicar abre o `detalhe` existente.
  - O dono vê no detalhe o botão **Excluir pedido**, com confirmação em perigo, como a V1 já fazia. O atendente não vê.
- [ ] **Step 4:** PASS + `--check`. **Step 5: Commit** — "Fase 3: rótulos legíveis, endereço e pagamento antigos, aba Histórico".

### Task 3: Vendas gravadas como na V1

**Files:**
- Create: `js/nucleo/vendas.js`
- Modify: `js/admin/acoes.js` (`mudarStatus`), `js/admin/mesas.js` (fechar conta)
- Test: `tests/vendas.test.mjs`

**Interfaces:**
- Consumes: `nomeMesa`, `pagamentoRotulo`.
- Produces (`js/nucleo/vendas.js`):
  - `deveGerarVendaAoEntregar(p, novoStatus) => boolean`: `true` só se `novoStatus === 'entregue'`, `p.tipo !== 'mesa'` e `!p.vendaId`.
  - `vendaDePedidoOnline(p, agora) => objeto venda`:
    - `itens` = itens do pedido mapeados para `{nome, preco, qtd, adicionais, observacao}` (`observacao` = `obs || observacao || null`);
    - `pagamentos [{forma: p.pagamento?.forma || 'a combinar', valor: total}]`, `pagamento` = rótulo;
    - `recebidoDinheiro`: `p.pagamento.troco` se houver, senão `null`; `troco`: o calculado, senão `null`;
    - `cliente` = `p.cliente?.nome || (p.tipo === 'delivery' ? 'Cliente (entrega)' : 'Cliente (retirada)')`;
    - `pedidoOrigem {pedidoId: p.id, origem: p.tipo, numeroPedido: p.numero ?? null}`;
    - `criadoEm: agora`.
  - `vendaDeFechamentoMesa(mesa, pedidos, forma, agora) => objeto venda`:
    - itens de todos os pedidos não cancelados; `subtotal` = soma dos `total` (com `desconto` 0);
    - `pagamentos [{forma, valor: total}]`;
    - `cliente` = `mesa.clienteAtual || nomeMesa(mesa)`;
    - `mesaFechamento {mesaId: mesa.id, mesaNome: nomeMesa(mesa), pedidoIds}`;
    - `criadoEm: agora`.
  - `pedidosParaFechar(pedidos, mesaId) => pedido[]`: `tipo === 'mesa'`, `String(p.mesa) === String(mesaId)`, não cancelado, `!p.contaFechada`.
  - Nenhum valor `undefined` nos objetos de venda.
- **Comportamento nas telas:**
  - `mudarStatus`: se `deveGerarVendaAoEntregar`, grava a venda com `db.add('vendas', …)` e depois `vendaId` no pedido, no mesmo `update` do status.
  - Fechar conta da mesa:
    1. abre um modal com o total, a forma de pagamento (opções de `PAGAMENTOS`, marcada com `m.contaPagamento?.forma`) e Confirmar;
    2. recalcula `pedidosParaFechar` na hora;
    3. se vazio, avisa "Conta já fechada" e não grava nada;
    4. senão grava uma venda (`vendaDeFechamentoMesa`);
    5. cada pedido recebe `status 'entregue'` (sem passar por `deveGerarVendaAoEntregar`, pois é mesa), `contaFechada: true` e `pagamento {forma, troco:null}`;
    6. a mesa recebe `chamado:null, chamadoEm:null, contaPagamento:null, clienteAtual:null`.
- [ ] **Step 1: Testes que falham** (`tests/vendas.test.mjs`):
  - `nao gera venda se ja tem vendaId`, `pedido de mesa nao gera venda ao entregar`, `delivery entregue gera venda`;
  - `venda online no formato v1`: as chaves são exatamente as da constraint; `pedidoOrigem` correto; `criadoEm` é o `agora` passado;
  - `venda da mesa consolida`: 3 pedidos (um cancelado) → total = soma dos 2 válidos; `pedidoIds` com 2; `mesaNome 'Comanda 11'`;
  - `mesa ja fechada nao gera venda`: `pedidosParaFechar` com todos `contaFechada` → `[]`;
  - `sem undefined`: varredura recursiva nas duas vendas, com pedidos mínimos.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `--check`.
- [ ] **Step 5: Commit** — "Fase 3: entregar pedido online e fechar mesa gravam a venda como na V1".

### Task 4: Dashboard e Financeiro leem `vendas` (com fiado)

**Files:**
- Create: `js/nucleo/faturamento.js`
- Modify: `js/admin/dashboard.js`, `js/admin/financeiro.js` (resumo, a receber, categorias de `contas_receber`)
- Test: `tests/faturamento.test.mjs`

**Interfaces:**
- Produces (`js/nucleo/faturamento.js`):
  - `msDe(valor) => number|null`: número, `Date`, objeto com `toMillis()` ou `{seconds}`.
  - `resumoVendas(vendas, ini, fim) => { faturamento, quantidade, ticketMedio, porForma: {forma: valor}, maisVendidos: [{nome, qtd, valor}] }`:
    - conta as vendas com `ini <= msDe(criadoEm) < fim`, **inclusive fiado** (pelo `total`);
    - `porForma` soma `pagamentos[].valor` por `forma` (minúscula); o fiado entra como `'fiado'`.
  - `caixaRecebido(vendas, ini, fim) => number`: soma das vendas não-fiado no período (pelo `total`) mais cada `pagamentosFiado[].valor` cuja `data` (`AAAA-MM-DD`, horário local) cai no período.
  - `fiadoEmAberto(vendas) => [{id, cliente, total, valorPago, saldo, criadoEm}]`: só `fiado === true` com `saldo > 0,004`, ordenado do mais antigo.
- **Telas:**
  - Dashboard: faturamento, ticket, gráfico, formas e mais vendidos vêm de `resumoVendas` (consulta `vendas` por `criadoEm` em ms). "Pedidos por tipo" continua vindo de `pedidos`.
  - Financeiro › Resumo: "Recebido no mês" = `caixaRecebido` + contas a receber pagas. "A receber" ganha a linha "Pagamento a prazo (fiado)" com o total de `fiadoEmAberto` (só leitura; a aba Fiado chega na Fase 4). `'Fiado'` sai das categorias de `contas_receber`.
- [ ] **Step 1: Testes que falham** (`tests/faturamento.test.mjs`):
  - `aceita criadoEm timestamp date e numero` (os três formatos dão o mesmo ms);
  - `fiado conta na data da venda no resumo`;
  - `caixa conta pagamento de fiado na data dele` (venda fiado de 300 em 05/11 com pagamento de 100 em 12/11: caixa de 01–10/11 = 0, de 11–20/11 = 100);
  - `fiado quitado nao aparece em aberto`;
  - `porForma soma duas formas` (venda com 2 pagamentos);
  - `mais vendidos agrega por nome`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `--check`.
- [ ] **Step 5: Commit** — "Fase 3: Dashboard e Financeiro pelo faturamento real (vendas e fiado)".

### Task 5: Foto do produto na prévia do WhatsApp (`/p/ID`)

**Files:**
- Modify: `api/produto.js`, `api/imagem.js`
- Test: `tests/api.test.mjs`

**Interfaces:**
- `api/produto.js`: a imagem do Open Graph é
  - `foto` absoluta `https://` → usa como está;
  - `foto` começando com `/` → `` `${host}${foto}` ``;
  - base64 → `` `${host}/api/imagem?id=…` ``;
  - sem foto → `/assets/og-image.png`.
- `api/imagem.js`: `foto` começando com `/` → responde `302` com `Location` `` `${host}${foto}` ``; base64 continua igual.
- O teste carrega os handlers com `createRequire` e substitui `globalThis.fetch` para simular a leitura REST do Firestore feita por `api/_firestore.js` (devolve um documento com `foto: '/assets/hamburgueria/x-bacon.jpeg'`). Usa objetos `req`/`res` falsos.
- [ ] **Step 1: Testes que falham:**
  - `og usa foto do site`: o HTML contém `og:image` com `https://<host>/assets/hamburgueria/x-bacon.jpeg`;
  - `imagem redireciona para a foto do site`: status 302 e Location correto;
  - `base64 continua funcionando`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** — "Fase 3: prévia de produto no WhatsApp com a foto do site".

### Task 6: Abas do atendente e identidade dourado/preto

**Files:**
- Create: `js/nucleo/tema.js`
- Modify: `js/admin/app.js` (`ROTAS.cardapio.perfis`, abas padrão do atendente), `js/admin/loja.js` (Equipe: caixas de abas já marcadas com o padrão), `js/utils.js` (`CONFIG_PADRAO.tema`, `aplicarTema` usa `corTextoSobre`), `css/base.css` (`--pri` padrão `#d4af37`, `--pri-txt`; botões primários usam `--pri-txt`), `assets/og-image.png` (1200×630, fundo `#1C1C1C`, logo centralizado; gerar com PowerShell `System.Drawing` a partir de `assets/logo-burger-house.png`)
- Test: `tests/tema.test.mjs`, `tests/config.test.mjs`

**Interfaces:**
- `js/nucleo/tema.js`:
  - `corTextoSobre(hex) => '#1C1C1C' | '#FFFFFF'`: o de maior contraste WCAG.
  - `contraste(hexA, hexB) => number`.
  - `ABAS_PADRAO_ATENDENTE = ['pedidos', 'mesas', 'pdv']`.
- `podeVer(k)`: dono vê tudo; atendente vê `abas` quando houver, senão `ABAS_PADRAO_ATENDENTE`.
- [ ] **Step 1: Testes que falham:**
  - `texto escuro sobre dourado e claro sobre preto`: `corTextoSobre('#d4af37')` → `'#1C1C1C'`, `corTextoSobre('#1c1c1c')` → `'#FFFFFF'`; `contraste` dos dois pares ≥ 4,5;
  - `padrao do atendente`: igual a `['pedidos','mesas','pdv']`;
  - `cardapio so do dono` (verificação de fonte em `app.js`);
  - `tema padrao dourado` (`CONFIG_PADRAO.tema.primaria === '#d4af37'`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `--check`.
- [ ] **Step 5: Commit** — "Fase 3: abas do atendente e identidade Burger House".

### Task 7: Ensaio geral completo e versão `2.0.0-f3`

**Files:**
- Modify: `ferramentas/ensaio.html` + `ferramentas/ensaio.mjs` (opção "Loja aberta 24h neste ensaio", que muda só os `horarios` da cópia demo), versão em todos os arquivos (`node scripts/versao.mjs 2.0.0-f3`)
- Test: `tests/ensaio.test.mjs` (`abrir 24h so muda horarios da copia`)

- [ ] **Step 1:** teste que falha → implementar a opção → PASS.
- [ ] **Step 2:** `node scripts/versao.mjs 2.0.0-f3`; `npm test` e `--check` → PASS/0.
- [ ] **Step 3: Commit** — "Fase 3: ensaio com loja aberta e versão 2.0.0-f3".
- [ ] **Step 4: Ensaio geral headless** (Edge + CDP; scripts e capturas no scratchpad), com o backup mais novo e "Loja aberta 24h". Conferir e registrar no relatório, com captura de cada tela:
  1. `/?mesa=<id da Mesa 6>&demo=1` mostra "Mesa 6"; o id da Comanda 11 mostra "Comanda 11".
  2. Pedido de mesa feito pelo QR da Comanda 11 aparece no kanban com o rótulo "Comanda 11", não "#null".
  3. Pedido delivery: avançar até `entregue` cria **1** venda; clicar de novo em entregue não cria outra.
  4. Fechar a conta da Comanda 11 com Pix cria **1** venda com `mesaFechamento.mesaNome 'Comanda 11'`; fechar de novo avisa "Conta já fechada".
  5. Pedidos › Histórico (30 dias e De–Até cobrindo set–nov/2026) lista os 44 pedidos antigos com rótulos legíveis.
  6. Dashboard (30 dias) e Financeiro (mês) somam as vendas do período, incluindo as 2 novas do ensaio.
  7. Login como atendente demo (criar na Equipe sem abas): o menu mostra só Pedidos e Mesas.
  8. Nenhum texto visível em nenhuma tela contém `null`, `undefined` ou `NaN` (varrer `document.body.innerText`).
  9. Botões primários dourados com texto escuro.
  Qualquer falha é um achado: corrigir na própria tarefa (TDD quando for regra; ajuste de tela quando for tela) e repetir o item.
