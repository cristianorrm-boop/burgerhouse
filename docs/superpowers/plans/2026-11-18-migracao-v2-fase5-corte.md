# Migração Burger House V2 — Fase 5: Corte — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended here: muitas etapas são da usuária e precisam de conversa) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A V2 passa a ser o site oficial em `burgerhouse-nine.vercel.app`, com o banco `moda-63d8d` limpo dos pedidos e
vendas de teste, as regras finais publicadas e tudo conferido em produção.

**Architecture:** O código já está pronto no branch `v2`. Esta fase faz quatro coisas:
- completa as regras finais (`firestore.rules`);
- cria uma ferramenta local de limpeza (`ferramentas/limpar.html`, só localhost, fora do deploy);
- ajusta o `scripts/conferir-cabecalhos.mjs` para produção;
- executa o roteiro do corte, com as etapas da usuária indicadas.

Rollback: Instant Rollback da Vercel para o deploy da V1 + republicar `regras/v1.rules`. Os produtos, categorias,
mesas e cupom continuam com os campos da V1. Pedidos e vendas apagados não voltam, mas eram de teste.

**Contexto da usuária (2026-11-18):** o Burger House é um **cardápio mãe**, uma demonstração que ela oferece aos
clientes dela. O horário do corte não importa. Os 44 pedidos e as 8 vendas são **de teste e devem ser apagados**.
Para publicar regras ela só precisa do caminho do arquivo.

**Spec:** `docs/superpowers/specs/2026-11-16-migracao-burger-house-v2-design.md` (decisão 14 e seções "Hospedagem, cache e
versionamento" e "Ambiente de trabalho e corte"). Entradas: os resultados das Fases 2, 3 e 4 em `docs/superpowers/plans/`.

## Global Constraints

- **Preservar e não tocar:** `produtos`, `categorias`, `adicionais`, `gruposAdicionais`, `config`, `configuracoes`,
  `mesas`, `cupons`.
- **Apagar:** só `pedidos` e `vendas`, e só depois de um backup novo baixado.
- O cupom `BEMVINDO10` tem `usos` zerado na limpeza, porque os usos atuais vieram de testes.
- Nada é publicado em produção (merge no `main`, push do `main`, publicação de regras) sem a usuária confirmar na
  conversa.
- Testes no navegador **nunca** fecham o Edge pelo nome. Só o processo aberto pelo próprio teste, pelo PID.
- **Versão de produção:** `2.0.0`, aplicada com `node scripts/versao.mjs 2.0.0`, com `--check` 0.

## Review Focus

- **QR impresso** `https://burgerhouse-nine.vercel.app/index.html?mesa=SfyFdUBaBRDchD1MlFFK` responde 200 em produção
  e abre "Mesa 1". Item 3 do roteiro.
- **Celular que tinha a V1 instalada** passa a mostrar a V2 sem limpar cache. Item 5 do roteiro.
- **Regras finais:**
  - cliente sem login consegue ver o cardápio, fazer pedido, acompanhar o pedido e chamar garçom;
  - cliente sem login **não** consegue ler vendas, listar pedidos nem mexer em produtos.

  Task 1 e item 4 do roteiro.
- **Limpeza:** apaga só `pedidos` e `vendas`, e sai 0 na segunda rodada. Task 2.

---

### Task 1: Regras finais completas

**Files:**
- Modify: `firestore.rules`
- Test: `tests/regras.test.mjs`

**Interfaces / conteúdo:**
- `match /vendas/{id}`:
  - `allow read: if equipe();`
  - `allow create, update: if equipe();`
  - `allow delete: if dono();`
- `match /pedidos/{id}`: `update` continua `equipe()`, e **`delete` passa a `dono()`** (separar `allow update` e
  `allow delete`).
- Nada mais muda. As coleções só da V1 (`usuarios`, `configuracoes`, `tiposVariacao`, `gruposAdicionais`) ficam sem
  regra, ou seja, negadas, porque nenhuma tela da V2 usa essas coleções (conferido: nenhum `db.*` em `js/` cita elas).
- [ ] **Step 1: Testes que falham** em `tests/regras.test.mjs`:
  - `regras finais tem vendas`: existe `match /vendas/{id}` com `read` e `create, update` para `equipe()` e `delete`
    para `dono()`;
  - `apagar pedido so dono`: no bloco de `pedidos`, `delete` usa `dono()` e não está junto com `update` em
    `equipe()`;
  - `regras finais sem colecoes da v1`: nenhum `match` para `usuarios`, `configuracoes`, `tiposVariacao`,
    `gruposAdicionais`;
  - `superadmin certo`: `'admin@gmail.com'`.
- [ ] **Step 2:** FAIL. **Step 3:** editar `firestore.rules`. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — "Fase 5: regras finais com vendas e exclusão de pedido só pela dona".

### Task 2: Ferramenta de limpeza dos dados de teste

**Files:**
- Create: `ferramentas/limpeza.mjs` (puro), `ferramentas/limpar.html`
- Test: `tests/limpeza.test.mjs`

**Interfaces:**
- `planejarLimpeza(atual: { [colecao]: { [id]: doc } }) => { operacoes: Op[], resumo: { pedidos, vendas } }`, com
  `Op = { colecao, id, tipo: 'apagar' }` para todo documento de `pedidos` e `vendas`, mais
  `{ colecao: 'cupons', id, tipo: 'zerarUsos' }` para cada cupom com `usos > 0`.
- Trava de segurança `conferirLimpeza(operacoes)`: lança erro se alguma operação apagar fora de `pedidos`/`vendas` ou
  alterar algo além de `cupons.usos`.
- **`limpar.html`:**
  1. roda `exigirLocalhost()` e pede login (como `migrar.html`);
  2. "Ler banco e montar plano" lê `pedidos`, `vendas` e `cupons` ao vivo e mostra quantos documentos de cada coleção
     serão apagados e quais cupons terão `usos` zerado;
  3. o botão "Apagar N documentos de teste" só ativa com a caixa "Fiz o backup novo" marcada **e** a palavra `APAGAR`
     digitada;
  4. apaga em lotes de até 400 com `writeBatch` (`delete`; `update {usos: 0}` nos cupons);
  5. no fim relê e mostra o novo plano, que deve sair com 0.
- [ ] **Step 1: Testes que falham:**
  - `apaga so pedidos e vendas` (fixture com produtos, mesas, pedidos, vendas e cupons → só pedidos e vendas no plano);
  - `zera usos so de cupom usado`;
  - `trava recusa outra colecao`;
  - `segunda rodada vazia` (aplicar em memória e planejar de novo → 0 operações).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** — "Fase 5: ferramenta de limpeza dos dados de teste".

### Task 3: Conferência de produção e versão `2.0.0`

**Files:**
- Modify: `scripts/conferir-cabecalhos.mjs`: os casos passam a incluir também `/p/10` (status 200, sem 5xx) e
  `/admin.html` com `Location` `/admin/`. Ver a seção "Conferência automática de produção" abaixo.
- Version: `node scripts/versao.mjs 2.0.0`.
- Test: `tests/vercel.test.mjs` (se o caso `/p/` for regra nova do script, verificação de fonte).
- [ ] **Step 1:** ajustar o script e versão `2.0.0`; `npm test` e `--check` → PASS/0.
- [ ] **Step 2: Commit** — "Fase 5: versão 2.0.0 e conferência de produção".

### Task 4: Roteiro do corte

Cada etapa marcada **[USUÁRIA]** espera a confirmação dela na conversa.

1. **[USUÁRIA] Backup novo:**
   - o executor sobe o servidor local (`npx serve . -l 5502`);
   - ela abre `http://localhost:5502/ferramentas/backup`, entra com `admin@gmail.com`, clica em "Fazer backup" e
     move o arquivo baixado para a pasta `backups`;
   - o executor confere com
     `node ferramentas/conferir-backup.mjs backups/<novo>.json --esperado produtos=35,categorias=5,mesas=15,cupons=1`.
2. **[USUÁRIA] Limpeza:** ela abre `http://localhost:5502/ferramentas/limpar`, monta o plano e confere com o
   executor (esperado: os pedidos e vendas que existirem, mais 1 cupom se `usos > 0`). Digita `APAGAR`, aplica e
   confirma que o plano final saiu 0.
3. **[USUÁRIA] Variáveis da Vercel** para a prévia de produto no WhatsApp (`/p/ID`):
   - no painel da Vercel, projeto **burgerhouse**: Settings › Environment Variables;
   - criar `FIREBASE_PROJECT_ID = moda-63d8d` e `FIREBASE_API_KEY = <a apiKey de js/config.js>`, para o ambiente
     Production. O executor indica a linha exata do arquivo.
4. **[USUÁRIA] Regras finais:**
   - o executor indica o arquivo `firestore.rules` (raiz do projeto);
   - ela copia tudo e publica em Firestore Database › Regras;
   - a partir daqui a V1 que ainda está no ar deixa de conseguir ler a configuração dela. É esperado e dura só até o
     passo 5.
5. **Publicação:**
   - com a confirmação da usuária, o executor faz merge de `v2` em `main` (`git checkout main && git merge --no-ff v2`)
     e `git push origin main`;
   - a Vercel publica sozinha. O executor acompanha pelo status do commit no GitHub até "success".
6. **Conferência automática de produção:**
   - `node scripts/conferir-cabecalhos.mjs https://burgerhouse-nine.vercel.app` → código 0;
   - leituras REST sem login:
     - `produtos` 35 e `config/loja` legível;
     - `vendas` negado e `pedidos` (listar) negado;
     - `cupons/BEMVINDO10` legível.
7. **[USUÁRIA] Teste no celular:**
   - abrir o site no celular que tinha a V1 (sem limpar nada): aparece a V2, se necessário depois de tocar em
     "Atualizar";
   - escanear o QR impresso de uma mesa;
   - fazer um pedido pela mesa;
   - entrar no admin e ver o pedido chegar com som;
   - fechar a conta da mesa;
   - uma venda no PDV;
   - o Relatório do dia mostra as duas vendas;
   - compartilhar um produto no WhatsApp e ver a foto na prévia.

   Achado de defeito → corrigir no `v2`, merge e push de novo, sempre com confirmação.
8. **Fechamento:**
   - atualizar o `README.md`: endereços, como publicar (`node scripts/versao.mjs <nova versão>` + `--check` + push do
     `main`), onde estão as ferramentas e o caminho de rollback;
   - escrever `docs/superpowers/plans/2026-11-xx-migracao-v2-concluida.md` com o estado final e os pequenos pontos
     abertos das Fases 1–4;
   - commit e push com confirmação.

**Rollback (se algo grave aparecer no passo 6 ou 7):**
- Vercel › Deployments › escolher o último deploy da V1 (o que tinha `script.js?v=00.007`) › **Instant Rollback**;
- a usuária republica `regras/v1.rules`;
- o código V1 está na tag `v1-final`.
