# Migração Burger House V2 — Fase 2: Dados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer um backup completo do Firestore `moda-63d8d`. Criar e testar as funções
que convertem cada coleção da V1 para a V2. Publicar as regras de transição. Aplicar no
banco real **só os passos aditivos** (sem a V1 perceber). E montar o ensaio geral: a V2
rodando em modo demo com uma cópia convertida de todos os dados reais.

**Architecture:** Toda ferramenta que fala com o banco real fica em `ferramentas/`, que
fica **fora do deploy** (`.vercelignore`). Elas rodam só em
`http://localhost:5502/ferramentas/...`, com a usuária logada como `admin@gmail.com`
pelo Firebase Auth (o domínio `localhost` já vem autorizado). As conversões são funções
puras num módulo ES (`ferramentas/conversores.mjs`), usado tanto pelas páginas quanto
pelos testes `node --test`. A migração aditiva é calculada como um **plano**: lista de
`{colecao, id, operacao, campos}`, mostrado antes de aplicar. Ela grava **só campos V2
ausentes**, então rodar de novo não muda nada.

**Tech Stack:** igual à Fase 1. Firebase modular 10.12.2 via CDN, `node --test`, sem npm.

**Spec:** `docs/superpowers/specs/2026-11-16-migracao-burger-house-v2-design.md`
(decisões 1–8, 11–14). Roteiro: `docs/superpowers/plans/2026-11-16-migracao-v2-roteiro-fases.md`.

## Global Constraints

- **Nada é apagado nem sobrescrito no banco real.** Toda escrita é `updateDoc` com campos
  que ainda não existem no documento, ou `setDoc` em documento que ainda não existe
  (`config/loja`, `adicionais/*`, `equipe/*`). Isso é conferido no próprio documento lido
  na hora, não no backup.
- **Campos que a V1 lê ficam intactos nesta fase:** `pedidos.*`, `vendas.*`,
  `produtos.categoria|imagem|adicionaisGrupos|ativo|preco|nome`, `mesas.nome|ativo`,
  `configuracoes/geral`, `gruposAdicionais/*`, `usuarios/*`. `pedidos` e `vendas` não
  recebem escrita nesta fase.
- **Backup antes de qualquer escrita.** Fica em `backups/backup-AAAA-MM-DD-HHmm.json`,
  gitignored, e nunca entra em commit nem em fixture de teste (tem nomes e telefones).
- **Fixtures de teste** (`tests/fixtures/`) só com dados do cardápio (públicos) ou dados
  inventados com o mesmo formato.
- **Cada escrita no banco real e cada publicação de regras é feita pela usuária**,
  depois de ver o plano. O executor prepara, pausa e pede.
- Valores fixos da spec:
  - `foto = imagem` com `./` trocado por `/`
  - emoji por categoria: `lanches` 🍔, `porcoes` 🍟, `bebidas` 🥤, `combos` 🍱, `sobremesas` 🍨
  - `upsell: true` só para as categorias `bebidas` e `sobremesas`
  - `adicionais.min = 0`, `adicionais.max = opcoes.length`
  - perfil: `dono` → `dono`, `garcom` → `atendente`; quem tem `ativo: false` não entra em `equipe`
  - abas padrão do atendente: `['pedidos', 'mesas', 'pdv']`
  - status: `recebido` → `novo`, `em_preparo` → `preparo`, `pronto` → `pronto`, `entregue` → `entregue`

## Review Focus

- **Documento com campo inesperado ou faltando** (produto sem `imagem`, mesa sem número no
  nome, cupom sem `validade`, pedido sem `itens`): a conversão não pode lançar erro nem
  gravar `undefined`. Usa o padrão e registra um aviso no plano. Testes
  `produto sem imagem fica sem foto` e `mesa sem numero ganha o proximo livre` (Task 2),
  `pedido sem itens vira lista vazia` (Task 3).
- **Rodar a migração duas vezes** (ela vai rodar de novo no corte): o segundo plano
  precisa sair vazio. Teste `plano e idempotente` (Task 5).
- **Campo V2 que a usuária já editou pela prévia** (ex.: trocou uma foto) não pode voltar
  ao valor antigo numa nova rodada. Teste `nao sobrescreve campo v2 existente` (Task 5).
- **Datas do Firestore** (Timestamp) precisam sobreviver ao backup e voltar como data, não
  como texto `[object Object]`. Teste `timestamp vai e volta` (Task 1).
- **Botão "Carregar dados de exemplo"** no admin real sobrescreveria `config/loja` e
  gravaria produtos falsos assim que as regras de transição liberarem. Teste
  `dados de exemplo so no demo` (Task 4).

---

### Task 1: Ferramentas fora do deploy + backup completo

**Files:**
- Create: `ferramentas/firebase.mjs`, `ferramentas/serializar.mjs`, `ferramentas/backup.html`,
  `ferramentas/estilo.css`, `ferramentas/conferir-backup.mjs` (Node: lê um backup e imprime
  as contagens por coleção)
- Modify: `.vercelignore` (+ `ferramentas/`), `.gitignore` (+ `backups/`),
  `tests/publicacao.test.mjs` (`ferramentas/` na lista do `.vercelignore`)
- Test: `tests/serializar.test.mjs`

**Interfaces:**
- Produces:
  - `ferramentas/firebase.mjs`: `conectar() => Promise<{ fs, F, A, auth }>`. Usa
    `firebaseConfig` e `FIREBASE_SDK` de `/js/config.js`, sempre modo real (ignora `DEMO`).
    Também `entrar(email, senha)`, e `exigirLocalhost()`, que lança erro e mostra aviso se
    `location.hostname` não for `localhost` ou `127.0.0.1`.
  - `ferramentas/serializar.mjs`: `serializar(valor) => json` e `desserializar(json, F) => valor`.
    O Timestamp vira `{ "__tipo": "ts", "ms": <número> }` e volta como `F.Timestamp.fromMillis`.
    Em `desserializar(json, null)` volta como `Date`, para uso em Node e nos testes.
    Arrays e mapas aninhados são preservados.
  - `COLECOES_V1 = ['produtos','categorias','cupons','configuracoes','gruposAdicionais','tiposVariacao','mesas','pedidos','vendas','usuarios']`
    e `COLECOES_V2_NOVAS = ['config','adicionais','equipe','contadores','bairros','clientes','fidelidade','contas_pagar','contas_receber']`,
    exportadas de `serializar.mjs`.
  - Formato do backup:
    `{ "projeto": "moda-63d8d", "geradoEm": <ms>, "colecoes": { "<nome>": { "<id>": <doc serializado> } }, "contagens": { "<nome>": n } }`.
    Inclui as duas listas (as coleções V2 vêm vazias hoje).
  - `backup.html`: formulário de login, depois botão "Fazer backup". Mostra a contagem por
    coleção e baixa `backup-AAAA-MM-DD-HHmm.json`.
- [ ] **Step 1: Testes que falham** `tests/serializar.test.mjs`:
  - `timestamp vai e volta`: um objeto com `{ toMillis: () => 1730000000000, seconds: 1730000000, nanoseconds: 0 }`
    (formato de Timestamp) dentro de `{a:{b:[ts]}}` sai `{"__tipo":"ts","ms":1730000000000}`.
    `desserializar(..., null).a.b[0]` é `Date` com `getTime() === 1730000000000`.
  - `null e numeros preservados`: `{x:null, y:0, z:''}` volta igual.
- [ ] **Step 2:** `npm test` → FAIL (módulo ausente).
- [ ] **Step 3:** Implementar `serializar.mjs`, `firebase.mjs`, `backup.html` e `estilo.css`
  (simples, legível no celular). Acrescentar `ferramentas/` ao `.vercelignore` e ao teste
  `documentos e ferramentas nao vao ao ar`. Acrescentar `backups/` ao `.gitignore`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — "Fase 2: ferramenta de backup completo (fora do deploy)".
- [ ] **Step 6: [USUÁRIA] Rodar o backup.** O executor sobe `npx serve . -l 5502` e pede
  que a usuária abra `http://localhost:5502/ferramentas/backup.html`, entre com
  `admin@gmail.com` e clique "Fazer backup". Ela salva o arquivo em
  `Burger House/backups/`.
- [ ] **Step 7: Conferir o backup.** `node ferramentas/conferir-backup.mjs backups/<arquivo>.json`
  (criar junto, mesmo commit da Task 1) imprime as contagens. As coleções públicas precisam
  bater com a leitura pública REST: `produtos` 35, `categorias` 5, `cupons` 1,
  `configuracoes` 1, `gruposAdicionais` 5, `mesas` 15. `pedidos`, `vendas` e `usuarios`
  precisam ter contagem > 0 ou confirmação da usuária de que estão vazios. Anotar as
  contagens no ledger.

### Task 2: Conversores do cardápio, loja, cupons e mesas

**Files:**
- Create: `ferramentas/conversores.mjs`, `tests/fixtures/cardapio-v1.json` (cópia
  serializada das coleções públicas `produtos`, `categorias`, `gruposAdicionais`,
  `configuracoes`, `cupons`, `mesas`, tiradas do backup; são dados públicos)
- Test: `tests/conversores-cardapio.test.mjs`

**Interfaces:**
- Produces (todas puras, sem Firebase; cada uma devolve `{ campos, avisos: string[] }`, em
  que `campos` é o **conjunto completo de campos V2** que aquele documento deve ter):
  - `converterProduto(doc)` → `categoriaId`, `foto`, `adicionais`, `ordem` (do campo
    numérico `id`; se não houver, `999`), `disponivel` (= `ativo !== false`),
    `precoPromo: null`, `selos` (`['Mais vendido']` se `destaque === true`, senão `[]`),
    `emoji` (pela categoria, fallback 🍽️), `upsell`
  - `converterCategoria(doc)` → `ativo: true`, `emoji`
  - `converterGrupoAdicional(doc)` → `nome`, `min: 0`, `max`, `opcoes` (cópia `{nome, preco}`)
  - `converterConfig(geral)` → objeto `config/loja` **só com os campos migrados**:
    `nome`, `logo` (com `./` → `/`), `capa`, `whatsapp`,
    `tema: { primaria, secundaria, fundo: 'auto' }`, `corDestaque`, `horarios[0..6]`
    (`ativo` = dia em `funcionamentoDias`; `abre`/`fecha` = `funcionamentoHoraInicio`/`Fim`),
    `taxaPadrao` (= `taxaEntrega`), `pausado: false`. O resto (pagamentos, fidelidade,
    upsell, SEO, entrega) vem de `CONFIG_PADRAO` na leitura: toda tela da V2 passa a config
    por `mesclarConfig` (`js/admin/app.js:147`, `js/cliente.js:832`, `js/pedido.js:79`).
    `conversores.mjs` **não importa** nada de `js/`, porque sem `"type":"module"` o Node não
    carrega aqueles `.js` como módulo.
  - `converterCupom(doc)` → `minimo` (= `valorMinimo ?? 0`), `validade` (`null` → `''`),
    `limite: 0`, `usos: 0`, `descricao` (`"10% de desconto"`, `"R$ 5,00 de desconto"` ou
    `"Entrega grátis"` conforme o `tipo`)
  - `converterMesa(doc, numerosUsados: Set<number>)` → `numero` (dígitos do `nome`; se
    não houver ou já estiver usado, o próximo livre, com aviso), `ativa` (= `ativo !== false`),
    `chamado: null`, `chamadoEm: null`
- [ ] **Step 1: Testes que falham** `tests/conversores-cardapio.test.mjs`, usando a fixture:
  - `x-bacon convertido`: o produto de id `10` resulta em `categoriaId 'lanches'`,
    `foto '/assets/hamburgueria/x-bacon.jpeg'`,
    `adicionais ['Trsm6CCEesEcxp6eVQaj','uvdhZSamOqe63pXMj9QY']`, `ordem 10`,
    `disponivel true`, `emoji '🍔'`, `upsell false`, `selos []`.
  - `bebida e sugestao`: produto `22` → `upsell true`, `emoji '🥤'`.
  - `todos os 35 produtos tem foto existente`: para cada produto, `foto` começa com
    `/assets/` e o arquivo existe no disco.
  - `produto sem imagem fica sem foto`: `{categoria:'lanches', nome:'X'}` → `foto ''`, um aviso, sem erro.
  - `adicionais lanche`: `Trsm6CCEesEcxp6eVQaj` → `min 0`, `max 5`, 5 opções iguais às originais.
  - `config burger house`: `nome 'Burger House'`, `logo '/assets/logo-burger-house.png'`,
    `tema.primaria '#d4af37'`, `tema.secundaria '#1c1c1c'`,
    `horarios[3]` = `{ativo:true, abre:'06:00', fecha:'23:00'}`, `whatsapp '5534999999999'`.
  - `cupom bemvindo10`: `minimo 0`, `validade ''`, `limite 0`, `usos 0`, `descricao '10% de desconto'`.
  - `mesas numeradas pelo nome`: as 15 mesas da fixture dão os números 1–10 e 11–15, sem
    repetição, e o `id` do documento não muda.
  - `mesa sem numero ganha o proximo livre`: `{nome:'Balcão'}` com `{1,2}` usados → `numero 3`, um aviso.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implementar. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — "Fase 2: conversores de cardápio, loja, cupons e mesas".

### Task 3: Conversores de equipe, pedidos e vendas

**Files:**
- Modify: `ferramentas/conversores.mjs`
- Create: `tests/fixtures/movimento-v1.json` (pedidos e vendas **inventados**, mas copiando
  os formatos que aparecem no backup real: pedido online delivery, retirada, mesa, cada
  status; venda de PDV com 1 e 2 pagamentos, fiado aberto, fiado com pagamento parcial,
  fechamento de mesa, pedido online entregue). O executor lê o backup localmente para
  levantar os formatos e não copia nome nem telefone real.
- Test: `tests/conversores-movimento.test.mjs`, `tests/backup-real.test.mjs`

**Interfaces:**
- Produces:
  - `converterUsuario(uid, doc)` → `null` se `ativo === false`; senão `{ nome, email,
    perfil, criadoEm }`, mais `abas: ['pedidos','mesas','pdv']` se o perfil for atendente.
    Só as chaves aceitas por `cadastroValido()` das regras.
  - `converterPedido(doc)` → patch V2: `status` (mapa da spec; status desconhecido fica
    igual, com aviso), `tipo` (`origem`/`tipoEntrega` → `delivery` | `retirada` | `mesa`),
    `numero` (de `numeroPedido`), `mesa` (de `mesaId`), `taxa` (de `taxaEntrega ?? 0`),
    `pagamento` (`{ forma: formaPagamento, troco: null }` ou `null` em mesa),
    `contaFechada` (de `fechada`), `criadoEm` (ms), `criadoEmTs` (o original), `itens`
    (cada item ganha `obs` = `observacao ?? ''` e `adicionais[].nome` =
    `nome ?? opcaoNome`; os campos antigos ficam), `historico: [{status, em: criadoEm}]`.
  - `converterVenda(doc)` → `{ criadoEm: ms, criadoEmTs: original }` e mais nada.
  - `contadorInicial(pedidos[])` → `{ n: maior numero numérico, ou 0 }`. Números de
    pedido da V1 em formato de código (letras + números) não contam: devolve um aviso
    com quantos foram ignorados.
- [ ] **Step 1: Testes que falham** `tests/conversores-movimento.test.mjs`, com a fixture:
  - `garcom vira atendente com abas padrao`, `inativo nao entra na equipe`,
    `dono sem abas`, `so chaves aceitas pelas regras` (as chaves ⊆ `nome,email,perfil,abas,criadoEm`).
  - `status mapeados`: os quatro status da spec.
  - `pedido de mesa`: `tipo 'mesa'`, `mesa` = id do documento da mesa, `pagamento null`.
  - `criadoEm vira milissegundos e guarda o original`.
  - `pedido sem itens vira lista vazia` com aviso, sem erro.
  - `itens antigos ganham obs e nome do adicional` sem perder `observacao`/`opcaoNome`.
  - `venda so muda a data`: as chaves de saída são exatamente `criadoEm` e `criadoEmTs`.
  - `contador ignora numero em codigo`.
- [ ] **Step 2: Teste contra o backup real** `tests/backup-real.test.mjs` (pulado com
  `t.skip` se não houver arquivo em `backups/`): converte **todos** os documentos do backup
  mais recente sem lançar erro. A soma de `total` de pedidos e de vendas é igual antes e
  depois. Toda saída tem `criadoEm` numérico. A quantidade de documentos é igual. O teste
  imprime o resumo de avisos.
- [ ] **Step 3:** `npm test` → FAIL. **Step 4:** implementar. **Step 5:** `npm test` → PASS
  (incluindo o backup real). Ler cada aviso impresso. Aviso inesperado é finding: rule e ledger.
- [ ] **Step 6: Commit** — "Fase 2: conversores de equipe, pedidos e vendas".

### Task 4: Fechar o botão de dados de exemplo + regras de transição

**Files:**
- Modify: `js/admin/loja.js` (botões "Carregar dados de exemplo" / "Produtos de exemplo")
- Create: `regras/transicao.rules`, `regras/v1.rules` (o bloco de `docs/regras-v1.md`
  como arquivo puro)
- Modify: `.vercelignore` (+ `regras/`), `tests/publicacao.test.mjs`
- Test: `tests/regras.test.mjs`, `tests/config.test.mjs`

**Interfaces:**
- Produces:
  - Em `loja.js`, os dois botões de exemplo só são renderizados e só funcionam quando
    `DEMO` é verdadeiro. A guarda vai na renderização **e** no handler.
  - `regras/transicao.rules` = cada `match` de `regras/v1.rules`, **sem alteração**, mais
    os blocos V2 das coleções novas, copiados de `firestore.rules`: `config`, `adicionais`,
    `bairros`, `fidelidade`, `clientes`, `contadores/pedidos`, `contas_pagar`,
    `contas_receber`, `equipe`. Também as funções `logado`, `superadmin` (`admin@gmail.com`),
    `equipe`, `dono`, `soMudou`, `cadastroValido`. Coleções compartilhadas (`produtos`,
    `categorias`, `cupons`, `mesas`, `pedidos`) ficam com a regra V1.
- [ ] **Step 1: Testes que falham:**
  - `dados de exemplo so no demo` (`tests/config.test.mjs`): em `js/admin/loja.js`, todo
    trecho que chama `semear(` está dentro de um bloco condicionado a `DEMO`. Verificar
    pela presença de `if (!DEMO)` ou `DEMO ?` antes do botão. A asserção exata é escolha
    do executor, mas a remoção da guarda tem de fazer o teste falhar.
  - `transicao preserva a v1`: cada bloco `match /x/{doc} { ... }` de `regras/v1.rules`
    aparece literalmente (normalizando espaços) em `regras/transicao.rules`.
  - `transicao abre as colecoes novas`: há `match` para cada coleção V2 nova listada acima.
  - `transicao nao muda colecoes compartilhadas`: `produtos`, `categorias`, `cupons`,
    `mesas` e `pedidos` aparecem uma única vez cada.
  - `superadmin certo`: contém `'admin@gmail.com'`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implementar. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — "Fase 2: dados de exemplo só no demo e regras de transição".
- [ ] **Step 6: [USUÁRIA] Publicar as regras de transição** no console do Firebase
  (Firestore › Regras › colar `regras/transicao.rules` › Publicar). O console valida a
  sintaxe. Se acusar erro, o executor corrige e repete o Step 4.
- [ ] **Step 7: Verificar que a V1 não mudou:** leitura pública REST das 6 coleções
  públicas devolve as mesmas contagens da Task 1. `curl` em `burgerhouse-nine.vercel.app`
  mostra `script.js?v=00.007`. Pedir à usuária que abra o admin V1 no ar e confira que
  Pedidos e Produtos carregam.

### Task 5: Migração aditiva (plano → conferência → aplicação)

**Files:**
- Create: `ferramentas/plano.mjs`, `ferramentas/migrar.html`
- Test: `tests/plano.test.mjs`

**Interfaces:**
- Consumes: conversores das Tasks 2–3; `serializar.mjs`; `firebase.mjs`.
- Produces:
  - `planejarAditivos(atual: { [colecao]: { [id]: doc } }) => { operacoes: Op[], avisos: string[] }`,
    com `Op = { colecao, id, tipo: 'criar' | 'completar', campos }`:
    - `produtos`, `categorias`, `mesas`, `cupons`: `completar` com os campos do conversor
      **ausentes** no documento atual (campo presente, mesmo com outro valor, não entra).
    - `configuracoes/geral` → `config/loja`: `criar` se `config/loja` não existir.
    - `gruposAdicionais/X` → `adicionais/X`: `criar` se não existir.
    - `usuarios/U` → `equipe/U`: `criar` se não existir e se `converterUsuario` ≠ `null`.
    - Documento sem nenhum campo faltando não gera operação.
  - `migrar.html`: login, depois "Ler banco e montar plano". Lê o banco ao vivo (não o
    backup). Mostra tabela por coleção (criar/completar, campos) e avisos. O botão
    "Aplicar N operações" só fica ativo depois de marcar "Conferi o plano". Aplica em lotes
    de até 400 com `writeBatch`. Cada `completar` vai como `update` só dos campos listados;
    cada `criar` vai como `set` sem merge, precedido de leitura confirmando que o documento
    ainda não existe. No fim, relê o banco e mostra o novo plano, que deve sair vazio.
- [ ] **Step 1: Testes que falham** `tests/plano.test.mjs` (entrada = fixture do cardápio
  mais usuários inventados):
  - `primeira rodada`: 35 `completar` em produtos, 5 em categorias, 15 em mesas, 1 em cupons;
    1 `criar` em config; 5 `criar` em adicionais; 1 `criar` por usuário ativo.
  - `plano e idempotente`: aplicar as operações em memória e planejar de novo → `operacoes` vazio.
  - `nao sobrescreve campo v2 existente`: produto que já tem `foto: '/assets/outra.jpg'`
    não recebe `foto` no plano, mas recebe os outros campos faltantes.
  - `nao toca em campo v1`: nenhuma operação contém `categoria`, `imagem`,
    `adicionaisGrupos`, `ativo`, `nome` (em mesas), nem nenhuma coleção `pedidos`/`vendas`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implementar. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — "Fase 2: migração aditiva com plano conferível".
- [ ] **Step 6: [USUÁRIA] Conferir e aplicar.** Antes, fazer um backup novo (Task 1,
  Step 6). Ela abre `ferramentas/migrar.html`, monta o plano e o executor confere com ela
  os números (devem bater com o teste `primeira rodada`, mais os usuários reais). Só então
  ela marca, aplica e confirma que o plano final saiu vazio.
- [ ] **Step 7: Verificar:** (a) REST público: produto `10` tem `categoriaId`, `foto`, e
  `categoria`/`imagem` iguais aos de antes; `config/loja` existe. (b) V1 no ar: cardápio,
  carrinho até a tela de pagamento (sem enviar) e admin Pedidos/Produtos/Mesas funcionam.
  (c) Prévia da V2, aberta pela usuária: o cardápio aparece com as fotos reais, na ordem
  de hoje. Anotar no ledger.

### Task 6: Ensaio geral em modo demo com a cópia completa

**Files:**
- Create: `ferramentas/ensaio.mjs`, `ferramentas/ensaio.html`
- Test: `tests/ensaio.test.mjs`

**Interfaces:**
- Consumes: todos os conversores; `desserializar`.
- Produces:
  - `montarBancoDemo(backup) => { [colecao]: { [id]: doc } }`, no formato de `localStorage['co_db_v1']`
    do `js/db.js`. Aplica **tudo** que o corte aplicará: aditivos, `pedidos` e `vendas`
    convertidos (patch mesclado ao documento original), `contadores/pedidos`. As datas
    viram números (o demo não tem Timestamp).
  - `ensaio.html` (só localhost): escolhe o arquivo de backup, monta, grava em
    `localStorage['co_db_v1']`, liga `sessionStorage.bh_demo = '1'` e mostra links para
    `/?demo=1`, `/index.html?mesa=<id de uma mesa real>&demo=1` e `/admin/?demo=1`.
- [ ] **Step 1: Testes que falham** `tests/ensaio.test.mjs` (com o backup real, ou pulado):
  - `todas as colecoes presentes`: config, categorias, produtos, adicionais, mesas, cupons,
    pedidos, vendas, equipe, contadores.
  - `contagens preservadas`: os mesmos números de documentos do backup.
  - `sem timestamp`: nenhum valor `{__tipo:'ts'}` na saída.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** — "Fase 2: ensaio geral com cópia convertida dos dados reais".
- [ ] **Step 6: Rodar o ensaio** (o executor, em localhost, com Edge headless e o backup
  local): conferir em `/?demo=1` os 35 produtos com foto, em 5 categorias, na ordem de
  hoje. Conferir também que `?mesa=<id real>` abre a mesa (o nome correto da mesa é
  ajuste da Fase 3, então aqui basta abrir), e que no admin demo aparecem pedidos e mesas
  antigos. Registrar no ledger tudo o que aparecer errado como entrada para o plano da
  Fase 3. Não corrigir telas nesta fase.
