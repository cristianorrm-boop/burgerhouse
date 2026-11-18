# Migração Burger House V2 — Fase 1: Fundação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar a base do cardapio-online50k no branch `v2` do Burger House, já
com o Firebase `moda-63d8d`, superadmin `admin@gmail.com`, identidade da casa,
versionamento único de arquivos, service worker que aposenta o cache da V1 e
`vercel.json` com cabeçalhos de cache. O resultado é publicado como prévia na
Vercel e conferido.

**Architecture:** Arquivos copiados de `cardapio-online50k` (somente leitura) para a
raiz do branch `v2`, substituindo os arquivos V1 da raiz (o `main` continua com a V1).
Ficam do V1: `assets/` inteiro, `recibo.html` e `.gitignore`. A versão de publicação é
uma string única, aplicada por `scripts/versao.mjs` como `?v=` em todo `src`/`href`
local e em todo `import` entre módulos, e também no nome do cache do SW e em
`versao.json`. Os testes usam `node --test`.

**Tech Stack:** HTML/CSS/JS puro em módulos ES, Firebase modular 10.12.2 via CDN, Vercel
(estático + `api/`), Node 22 só para scripts e testes (sem dependências npm).

**Spec:** `docs/superpowers/specs/2026-11-16-migracao-burger-house-v2-design.md`
(roteiro: `docs/superpowers/plans/2026-11-16-migracao-v2-roteiro-fases.md`)

## Global Constraints

- A pasta `cardapio-online50k` **nunca é alterada**: só se copia dela.
- Nada é escrito no Firestore nesta fase, e as regras do Firestore não são publicadas.
- O `main` e a produção (`burgerhouse-nine.vercel.app`) não mudam nesta fase.
  Push só do branch `v2`, e só depois de a usuária confirmar.
- Firebase: `projectId: "moda-63d8d"`, com as credenciais copiadas de
  `firebase-config.js` da V1. Superadmin: `admin@gmail.com`, em `js/config.js`
  **e** `firestore.rules`.
- O SW continua no caminho `/sw.js`. O nome do cache contém a versão. Na ativação, o
  SW apaga todo cache diferente do atual, incluindo `burger-house-shell-v2`.
- HTML, JS e CSS são servidos rede primeiro. Cache primeiro só para imagens, fontes e
  CDN versionado.
- Todo arquivo `.js`/`.css` local referenciado leva a **mesma** `?v=<versão>`.
- Versão inicial: `2.0.0-f1`.

## Review Focus

- **Celular com a V1 instalada** (cache `burger-house-shell-v2`, SW antigo em `/sw.js`)
  abre o site e passa a receber a V2, com o cache antigo apagado. Teste:
  `ativacao apaga burger-house-shell-v2` (Task 3).
- **Import entre módulos esquecido sem `?v=`** (ex.: um `import` novo escrito à mão
  na Fase 3) carregaria versão velha misturada com nova. Teste: `--check falha com
  import sem versao` (Task 2).
- **QR impresso `index.html?mesa=<ID>`** precisa continuar respondendo 200 com a V2
  (e não um redirecionamento que perca o `?mesa=`). Verificação com `curl` na Task 4.
- **Link de recibo antigo** (`recibo.html#<base64>`) continua abrindo. Verificação na
  Task 1.
- **Sem internet**, abrir o cardápio mostra a última versão em cache ou
  `offline.html`, nunca uma tela em branco. Teste: `navegacao offline cai no cache`
  (Task 3).

---

### Task 1: Base V2 no branch `v2` com o Firebase e a identidade do Burger House

**Files:**
- Delete (só no branch `v2`): `index.html`, `admin.html`, `script.js`, `style.css`,
  `firebase-config.js`, `seed-hamburgueria.html`, `sw.js`, `manifest.json`
- Move: `regras.md` → `docs/regras-v1.md` (texto para rollback das regras)
- Copy de `../cardapio-online50k/`: `index.html`, `pedido.html`, `offline.html`,
  `admin/`, `api/`, `css/`, `js/`, `firestore.rules`, `manifest.json`, `robots.txt`,
  `sitemap.xml`, `sw.js`, `vercel.json`, `assets/icon*.{png,svg}`, `assets/og-image.png`
- Create: `package.json` = `{ "private": true, "type": "module", "scripts": { "test": "node --test tests/" } }`
- Modify: `js/config.js`, `firestore.rules`, `manifest.json`, `admin/manifest.json`,
  `index.html`, `admin/index.html`, `pedido.html`, `robots.txt`, `sitemap.xml`,
  `README.md` (novo, curto)
- Test: `tests/config.test.mjs`

**Interfaces:**
- Produces: `js/config.js` exporta `firebaseConfig`, `SUPERADMIN_EMAIL`, `DEMO`,
  `FIREBASE_SDK` (mesmos nomes da V2). `DEMO` passa a ser
  `!firebaseConfig.apiKey || demoLocal()`, em que `demoLocal()` só vale em `localhost`
  ou `127.0.0.1` com `?demo=1`, guardado em `sessionStorage` (`bh_demo`). Fase 2 usa
  isso para o ensaio geral.

- [ ] **Step 1:** Antes de mexer em qualquer arquivo, no `main`: `git tag v1-final 4f7179f`
  (commit atual da produção). Depois, no branch `v2`. Conferir: `git tag -l v1-final`
  mostra a tag; `git branch --show-current` mostra `v2`.
- [ ] **Step 2: Teste que falha** `tests/config.test.mjs`:
  - `config aponta para moda-63d8d`: lê `js/config.js` como texto e confirma
    `projectId: "moda-63d8d"` e `SUPERADMIN_EMAIL = "admin@gmail.com"`.
  - `regras usam o mesmo superadmin`: `firestore.rules` contém `'admin@gmail.com'` e
    **não** contém `rasistema25`.
  - `nenhum arquivo cita o projeto do colega`: nenhum arquivo em `js/`, `api/`, `admin/`
    ou na raiz contém `cardapio-oline50k`.
- [ ] **Step 3:** `npm test` → falha (arquivos ainda não copiados).
- [ ] **Step 4:** Apagar/mover os arquivos V1, copiar a base V2 e editar:
  `js/config.js` (credenciais do `firebase-config.js` V1, e-mail, `demoLocal()`),
  `firestore.rules` (só o e-mail da função `superadmin()`, o resto fica para a Fase 2).
  Identidade: `name`/`short_name` "Burger House", `theme_color`/`background_color`
  `#1C1C1C`; títulos das páginas "Burger House". Ícones `icon-192.png`/`icon-512.png`
  gerados a partir de `assets/logo-burger-house.png` (redimensionar com PowerShell
  `System.Drawing`). `icon.svg` vira um SVG que embute o PNG de 192. O `og-image.png`
  da V2 fica até a Fase 3. `robots.txt`/`sitemap.xml` com `burgerhouse-nine.vercel.app`.
  `README.md` com 10 linhas no máximo: o que é, como rodar (`npx serve .`, `?demo=1`),
  link para a spec.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Verificação manual:** `npx serve . -l 5502`. Abrir
  `http://localhost:5502/?demo=1`: o cardápio de exemplo aparece, com o título
  "Burger House". Abrir `/admin/?demo=1`: o login demo entra. Abrir `/recibo.html#` +
  um base64 de exemplo gerado com
  `btoa(unescape(encodeURIComponent(JSON.stringify({itens:[{nome:"X",qtd:1,preco:10}],total:10}))))`:
  o recibo aparece. Abrir `/` **sem** `?demo=1`: o console mostra tentativa de falar
  com `moda-63d8d` (erro de permissão é esperado nesta fase).
- [ ] **Step 7: Commit** — "Fase 1: base do cardapio-online50k com Firebase e identidade do Burger House".

### Task 2: Versionamento único de arquivos

**Files:**
- Create: `scripts/versao.mjs`, `js/versao.js`, `versao.json`
- Modify: `js/utils.js` (`registrarSW`), todos os `.html` e `.js` com referência local
- Test: `tests/versao.test.mjs`

**Interfaces:**
- Produces:
  - `aplicarVersao(texto: string, versao: string) => string`: em `src="/..."`,
    `href="/..."` de `.js`/`.css` locais e em `import ... from '<relativo ou /absoluto>.js'`
    / `import('...js')`, troca ou acrescenta `?v=<versao>`. Não toca em URLs
    `http(s)://`, nem em `.json`, imagens ou `manifest`.
  - `referenciasSemVersao(texto: string, versao: string) => string[]`: lista as
    referências locais `.js`/`.css` cuja `?v=` está ausente ou diferente.
  - CLI: `node scripts/versao.mjs <versao>` reescreve todos os `.html`/`.js` do projeto
    (exceto `scripts/`, `tests/`, `node_modules/`, `api/`), `sw.js` (`const VERSAO = 'bh-<versao>'`),
    `js/versao.js` (`export const VERSAO = '<versao>'`) e `versao.json` (`{"versao":"<versao>"}`).
    `node scripts/versao.mjs --check` sai com código 1 e lista arquivo:referência se algo
    estiver fora da versão de `versao.json`.
  - `registrarSW(caminho = '/sw.js')`: além de registrar, busca `/versao.json` com
    `cache: 'no-store'`. Se `versao` ≠ `VERSAO`, mostra uma faixa fixa "Nova versão
    disponível — Atualizar". O botão chama `registration.update()` e depois
    `location.reload()`.

- [ ] **Step 1: Testes que falham** `tests/versao.test.mjs`:
  - `acrescenta versao em import relativo`: `import { db } from './db.js';` →
    `import { db } from './db.js?v=2.0.0-f1';`
  - `troca versao antiga`: `src="/js/cliente.js?v=1.9"` → `src="/js/cliente.js?v=2.0.0-f1"`
  - `nao toca em CDN`: `import(\`${FIREBASE_SDK}/firebase-app.js\`)` e
    `href="https://cdn.jsdelivr.net/x.css"` ficam idênticos.
  - `nao toca em imagem nem manifest`: `href="/manifest.json"` e
    `src="/assets/x.png"` ficam idênticos.
  - `idempotente`: aplicar duas vezes = aplicar uma vez.
  - `--check falha com import sem versao`: `referenciasSemVersao("import a from './a.js'", "2.0.0-f1")`
    → `["./a.js"]`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar `scripts/versao.mjs` (funções exportadas + CLI),
  `js/versao.js`, e a faixa de nova versão em `registrarSW`.
- [ ] **Step 4:** `npm test` → PASS. Rodar `node scripts/versao.mjs 2.0.0-f1` e depois
  `node scripts/versao.mjs --check` → saída vazia, código 0.
- [ ] **Step 5: Verificação manual:** `npx serve . -l 5502`, abrir `/?demo=1` e
  `/admin/?demo=1`. Na aba Rede do DevTools, todo `.js`/`.css` local vem com
  `?v=2.0.0-f1` e nenhum módulo aparece duas vezes. Editar `versao.json` à mão para
  `9.9.9`, recarregar: a faixa "Nova versão disponível" aparece. Desfazer.
- [ ] **Step 6: Commit** — "Fase 1: versão única em todos os arquivos e aviso de nova versão".

### Task 3: Service worker que aposenta a V1 e não serve código velho

**Files:**
- Modify: `sw.js`
- Test: `tests/sw.test.mjs`

**Interfaces:**
- Consumes: `const VERSAO = 'bh-<versao>'` escrito pela Task 2.
- Produces: `sw.js` (script clássico) define
  `estrategia(url: URL, modo: string, origem: string) => 'ignorar' | 'rede-primeiro' | 'cache-primeiro'`:
  - `'ignorar'`: hosts `googleapis.com`, `firebaseio.com`, `identitytoolkit`,
    `securetoken`; caminhos `/api/`, `/p/`, `/versao.json`. (Requisição que não é GET
    nem chega a `estrategia`: o handler retorna antes.)
  - `'rede-primeiro'`: `modo === 'navigate'`, ou caminho local terminando em `.html`, `.js`,
    `.css`, ou `/sw.js`.
  - `'cache-primeiro'`: imagens locais, fontes do Google, `cdn.jsdelivr.net` e
    `www.gstatic.com/firebasejs/` (URLs versionadas).
  - `limparCaches(nomes: string[], atual: string) => string[]`: os nomes a apagar,
    ou seja, todos os diferentes de `atual`.
  - Na navegação offline: cache da página (ignorando a query string, para `?mesa=`
    funcionar) e, se não houver, `/offline.html`.
  - Pré-cache na instalação: `/`, `/index.html`, `/pedido.html`, `/offline.html`,
    `/admin/`, CSS e JS com `?v=` (a lista é reescrita pela Task 2 na mesma versão).
  - Para testar no Node, o fim do arquivo faz
    `if (typeof module !== 'undefined') module.exports = { estrategia, limparCaches };`
    Como `package.json` declara `type: module`, o teste carrega o `sw.js` com
    `vm.runInNewContext`, passando um `self` falso e `module`.

- [ ] **Step 1: Testes que falham** `tests/sw.test.mjs`:
  - `ativacao apaga burger-house-shell-v2`:
    `limparCaches(['burger-house-shell-v2','co-v11','bh-2.0.0-f1'], 'bh-2.0.0-f1')`
    → `['burger-house-shell-v2','co-v11']`.
  - `js e css locais sao rede primeiro`: `/js/db.js?v=2.0.0-f1` e `/css/base.css?v=…`
    → `'rede-primeiro'`.
  - `navegacao com mesa e rede primeiro`: `/index.html?mesa=SfyFdUBaBRDchD1MlFFK`
    com `modo 'navigate'` → `'rede-primeiro'`.
  - `firestore e api sao ignorados`: `https://firestore.googleapis.com/...`, `/api/produto`,
    `/p/10`, `/versao.json` → `'ignorar'`.
  - `foto de produto e sdk sao cache primeiro`: `/assets/hamburgueria/x-bacon.jpeg` e
    `https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js` → `'cache-primeiro'`.
  - `navegacao offline cai no cache`: com `fetch` falso que rejeita e `caches.match`
    falso que devolve uma resposta só para `/offline.html`, o handler de `navigate`
    responde `/offline.html`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Reescrever `sw.js` partindo do da V2, com `estrategia` e `limparCaches`.
- [ ] **Step 4:** `npm test` → PASS. `node scripts/versao.mjs --check` → código 0.
- [ ] **Step 5: Verificação manual da troca V1 → V2 (simulada local):** no `main`, servir
  a V1 (`git worktree add ../bh-v1 v1-final`, `npx serve ../bh-v1 -l 5503`). Abrir
  `http://localhost:5503/` e confirmar em DevTools › Application que existem o cache
  `burger-house-shell-v2` e o SW. Parar e servir o branch `v2` **na mesma porta 5503**.
  Recarregar duas vezes: o SW ativo passa a ser o novo, `burger-house-shell-v2` some e
  existe só `bh-2.0.0-f1`. Remover o worktree.
- [ ] **Step 6: Commit** — "Fase 1: SW rede-primeiro para código e limpeza do cache da V1".

### Task 4: `vercel.json` e prévia publicada na Vercel

**Files:**
- Modify: `vercel.json`
- Create: `scripts/conferir-cabecalhos.mjs`
- Test: `tests/vercel.test.mjs`

**Interfaces:**
- Produces:
  - `vercel.json` = o da V2 mais:
    `Cache-Control: no-cache, must-revalidate` para `/(.*)\.(html|js|css)`, `/`, `/admin/`
    e `/versao.json`; `/sw.js` mantém `no-cache, no-store, must-revalidate` +
    `Service-Worker-Allowed: /`; `/assets/(.*)\.(png|jpe?g|webp|avif|svg)` com
    `public, max-age=86400`; `redirects`: `/admin.html` → `/admin/` (permanent: false).
    Sem `cleanUrls` (mantém `/index.html?mesa=` como arquivo direto, sem redirecionar).
  - `node scripts/conferir-cabecalhos.mjs <baseURL>`: faz GET em `/`,
    `/index.html?mesa=SfyFdUBaBRDchD1MlFFK`, `/admin/`, `/sw.js`, `/versao.json`,
    `/js/db.js?v=<versao>`, `/css/base.css?v=<versao>`,
    `/assets/hamburgueria/x-bacon.jpeg`, `/admin.html` (sem seguir redirecionamento) e
    `/recibo.html`. Imprime status e `Cache-Control` de cada um, e sai com código 1 se
    algum divergir do esperado acima, ou se `/versao.json` não trouxer a versão local.
- [ ] **Step 1: Teste que falha** `tests/vercel.test.mjs`: lê `vercel.json` e verifica
  cada regra listada acima (`no-cache` para js/css/html, `max-age=86400` para assets,
  redirect de `/admin.html`, ausência de `cleanUrls`, rewrite `/p/:id` mantido).
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** editar `vercel.json`. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — "Fase 1: cabeçalhos de cache da Vercel e redirect do admin antigo".
- [ ] **Step 6: Publicar a prévia, perguntando antes à usuária.** Pedir confirmação
  para `git push -u origin v2`. Se o projeto da Vercel estiver ligado ao GitHub, a
  prévia sai sozinha; pegar a URL com a usuária, no painel da Vercel ou no commit do
  GitHub. Se não estiver ligado, combinar com ela `npx vercel` (prévia, **nunca**
  `--prod`). Conferir que a prévia **não** alterou `burgerhouse-nine.vercel.app`
  (`curl -s https://burgerhouse-nine.vercel.app/ | grep script.js?v=00.007` ainda
  encontra).
- [ ] **Step 7: Verificar a prévia:** `node scripts/conferir-cabecalhos.mjs <URL da prévia>`
  → código 0. Abrir a prévia no celular da usuária, que tem a V1 instalada, mas pela URL
  de prévia (origem diferente, então não afeta o SW da produção): a página carrega e
  o título é "Burger House". O cardápio vazio, com erro de permissão no console, é
  esperado até a Fase 2.
- [ ] **Step 8: Commit** do que tiver mudado e anotar a URL da prévia no topo do roteiro.
