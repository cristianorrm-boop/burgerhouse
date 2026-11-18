# Migração do Burger House para a arquitetura V2 (base: cardapio-online50k)

## Intenção e porquê

O Burger House (V1) funciona e já tem banco de dados real no Firestore do projeto
`moda-63d8d`: 35 produtos com foto, 5 categorias, 5 grupos de adicionais, cupom,
configuração da loja, 15 mesas/comandas com QR Code impresso, e pedidos/vendas.
O código, porém, está concentrado em poucos arquivos enormes (`admin.html` com
~180 KB, `script.js` com ~62 KB), usa o SDK "compat" do Firebase e tem regras de
segurança frouxas (qualquer conta logada escreve em tudo).

O objetivo é **melhorar a arquitetura do Burger House usando o Cardápio Online
(`cardapio-online50k`) como base, aproveitando o que há de bom nos dois**: o que o
Burger House já faz bem continua (PDV, Pagamento a Prazo, Relatório, QR por mesa);
o que o Cardápio Online traz de melhoria entra junto (estrutura modular, camada de
dados única, regras por perfil, kanban de pedidos, dashboard, clientes/fidelidade,
bairros com taxa, financeiro, impressão de comanda, PWA versionado, prévia de link
no WhatsApp).

Mesmo processo usado no Manejo Mix: decisões documentadas → plano por fases →
execução cuidadosa → testes → corte para produção. Diferença: lá a base V2 foi o
`loja-online`; aqui é o `cardapio-online50k`, que é outra base de código (módulos
ES, `config/loja`, `equipe`, Vercel). Os scripts de migração do Manejo Mix não são
reaproveitáveis diretamente; o processo e os cuidados, sim.

## Escopo

- **Projeto alvo:** pasta `Burger House` (repositório `cristianorrm-boop/burgerhouse`).
- **Referência de arquitetura:** pasta `cardapio-online50k` — **somente leitura**,
  é modelo a copiar/adaptar, nunca alterar.
- **Banco:** o mesmo projeto Firebase `moda-63d8d`. Nada de projeto novo.
- **Hospedagem:** a mesma Vercel de hoje, `https://burgerhouse-nine.vercel.app`.

### O que entra

Tudo o que o cardapio-online50k oferece, mais os módulos do Burger House que ele
não tem:

| Módulo | Origem | Observação |
|---|---|---|
| Cardápio do cliente, sacola, checkout, acompanhamento `pedido.html` | V2 | com adicionais min/máx, upsell, selos |
| Modo mesa por QR Code | V2 + compatibilidade V1 | QR impressos continuam valendo (decisão 6) |
| Pedidos (kanban, alerta sonoro, cancelamento com motivo) | V2 | substitui a lista "Pedidos" + "Cozinha" da V1 |
| Mesas (chamar garçom, pedir conta, fechar conta, imprimir QR) | V2 | + nome livre da mesa e `clienteAtual` da V1 |
| Cardápio admin (produtos, categorias, grupos de adicionais) | V2 | |
| Cupons, Clientes/Fidelidade, Bairros/Entrega, Dashboard, Financeiro, Configurações, Equipe, Impressora | V2 | |
| **PDV** | **V1, portado** | mesmo comportamento de hoje (decisão 9) |
| **Pagamento a Prazo (fiado)** | **V1, portado** | mesmo comportamento de hoje (decisão 9) |
| **Relatório** | **V1, portado** | lê `vendas`, como hoje |
| Recibo compartilhável (`recibo.html`) | V1, mantido | dados vão no próprio link; arquivo fica como está |

### O que sai

- `seed-hamburgueria.html` (o cadastro em massa vira o admin da V2; o arquivo
  permanece no histórico do git).
- Aba "Upload/URL" de imagem da V1 é substituída pelo upload com compressão da V2
  (fotos antigas por caminho continuam funcionando, decisão 3).

## Decisões

1. **Migração no lugar, sem recomeço, em dois tipos de passo.** Toda coleção
   existente é preservada e adaptada. Os campos antigos só deixam de ser usados;
   não são apagados.
   - **Passos aditivos** (podem rodar cedo, a V1 nem percebe): coleções novas
     (`config`, `adicionais`, `equipe`, `contadores`) e campos novos em `produtos`,
     `categorias`, `mesas`, `cupons`.
   - **Passos que reescrevem campos que a V1 lê** (`pedidos.status`,
     `pedidos.criadoEm`, `vendas.criadoEm`): rodam **somente no corte**. Rodar
     antes quebraria o kanban e o relatório da V1, que ainda está no ar.
   - Consequência: no endereço de prévia, a V2 não mostra o histórico antigo de
     pedidos e vendas nas telas filtradas por data. O histórico é testado num
     **ensaio geral no modo demo** da V2: o JSON do backup é convertido pelas
     mesmas funções de migração e carregado no armazenamento local do navegador.
     Assim a V2 roda com uma cópia fiel de todos os dados reais, sem tocar no
     banco. As funções de conversão são as mesmas usadas no corte e são testadas
     contra o backup.

2. **Backup antes de qualquer escrita.** Antes da primeira migração, uma página
   de ferramenta (logado) exporta **todas** as coleções para um JSON baixado no
   computador. Repetir o backup imediatamente antes do corte. Os backups ficam
   fora do repositório (contêm nomes/telefones de clientes) — pasta `backups/`
   no `.gitignore`.

3. **Produtos (35)** — mesmo ID de documento, campos acrescentados:
   - `categoria` → `categoriaId`
   - `imagem` (`./assets/hamburgueria/x.jpeg`) → `foto` com caminho **absoluto**
     (`/assets/hamburgueria/x.jpeg`). Precisa ser absoluto porque o admin da V2
     fica em `/admin/` e um caminho `./` quebraria lá. As fotos continuam sendo os
     mesmos arquivos de `assets/`; nenhuma foto é reenviada.
   - `adicionaisGrupos` → `adicionais` (mesmos IDs dos grupos, decisão 4)
   - campo numérico `id` (9–43) → `ordem` (preserva a ordem atual)
   - `ativo` → `disponivel`; `destaque: true` → selo/destaque da V2
   - padrões V2 para o que não existe: `precoPromo: null`, `selos: []`,
     `emoji` por categoria, `upsell` (bebidas e sobremesas = `true`)
   - `entrega`, `codigoBarras`, `variacoes` ficam no documento sem uso.
   - O endpoint `api/imagem.js`/`api/produto.js` (prévia no WhatsApp) é ajustado
     para aceitar `foto` em caminho do site, além de base64.

4. **Grupos de adicionais (5)** — `gruposAdicionais` → `adicionais`, com o
   **mesmo ID** de documento. `nome` e `opcoes[{nome, preco}]` iguais; acrescenta
   `min: 0` e `max: quantidade de opções` (hoje todos são opcionais e livres).

5. **Categorias (5)** — mesmo ID (`lanches`, `porcoes`…). Mantém `nome`, `ordem`;
   acrescenta `ativo: true` e `emoji` (🍔 🍟 🥤 🍱 🍨) a partir do `icone`
   Font Awesome, que fica guardado.

6. **Mesas e QR Codes impressos — compatibilidade obrigatória.** Os 15 documentos
   de `mesas` mantêm os IDs atuais. Os QR impressos apontam para
   `index.html?mesa=<ID do documento>`, e a V2 abre a mesa justamente pelo ID que
   vem no link (`watchDoc('mesas', mesa)`), então os QR antigos continuam funcionando
   sem reimpressão. A migração acrescenta `numero` (1–15, tirado do nome),
   `ativa`, `chamado: null`, `chamadoEm: null` e mantém `nome` ("Mesa 3",
   "Comanda 12") e `clienteAtual`. Ajuste na V2: em toda tela onde aparece
   "Mesa {numero}" ou "Mesa {id}", mostrar o **`nome`** da mesa quando existir
   (comanda continua aparecendo como "Comanda 12", não "Mesa 12").
   Mesas novas criadas pela V2 usam o padrão V2 (ID = número); o nome livre fica
   editável no admin.

7. **Configuração da loja** — `configuracoes/geral` → `config/loja`:
   `nomeLoja`→`nome`, `logoUrl`→`logo`, `bannerUrl`→`capa`, `whatsapp`,
   `corPrimaria`→`tema.primaria`, `corSecundaria`→`tema.secundaria`,
   `funcionamentoDias` + `funcionamentoHoraInicio/Fim` → `horarios[0..6]`,
   `taxaEntrega` como taxa padrão. Demais campos V2 (pagamentos, fidelidade,
   upsell, SEO, mínimo de entrega) começam com o padrão do `CONFIG_PADRAO`.
   `corDestaque` é guardado; a identidade visual (dourado/preto) do Burger House
   é a que vale, não as cores padrão da V2. `retirada*` (agendamento removido em
   out/2026) fica sem uso.

8. **Cupons** — mesmo ID (código). `valorMinimo`→`minimo`, `validade: null`→`''`,
   acrescenta `limite: 0`, `usos: 0`, `descricao`.

9. **PDV, Pagamento a Prazo e Relatório continuam como hoje.** São portados da V1
   para módulos da V2 (`js/admin/pdv.js`, `fiado.js`, `relatorio.js`) usando
   `db.js`, com o mesmo comportamento: venda direta sem abertura de caixa, até 2
   formas de pagamento com troco, cupom, adicionais, fiado com cliente obrigatório,
   pagamentos parciais do fiado (`pagamentosFiado`, `valorPago`). O formato dos
   documentos de `vendas` **não muda**.

10. **`vendas` é a fonte única de faturamento** (regra que a V1 já segue): toda
    venda vira um documento em `vendas` — PDV, fechamento de mesa e pedido online
    quando chega a "entregue". Na V2 original o faturamento vem de `pedidos`;
    aqui Dashboard e Financeiro são adaptados para ler `vendas`, e os fluxos V2
    "pedido entregue" e "fechar conta da mesa" passam a gravar a venda, como a V1
    faz. Assim nada é contado duas vezes e o fiado entra no faturamento.
    - **Pedido de mesa** nunca gera venda ao chegar a "entregue". Só o
      **fechamento da conta** gera uma venda, consolidada, com `mesaFechamento`,
      igual à V1. Quem escolhe a forma de pagamento é a equipe, no fechamento. Se
      o cliente indicou uma forma ao pedir a conta pelo QR, ela vem pré-marcada.
      *(decisão minha)*
    - **Fiado no Dashboard e no Relatório** conta o `total` na **data da venda**,
      como o Relatório da V1 faz hoje. **No Financeiro** (visão de caixa): o saldo
      em aberto de cada fiado (`total − valorPago`) aparece automaticamente como
      valor a receber, e cada pagamento em `pagamentosFiado` entra como recebido
      na data dele. A categoria manual "Fiado" de `contas_receber` sai, para a
      mesma dívida não ser lançada duas vezes. *(decisão minha)*
    - **Fidelidade e cadastro de clientes** continuam como na V2: só os pedidos
      online entregues contam. O PDV segue sem pedir telefone. Os pontos não são
      calculados retroativamente a partir de pedidos antigos. O cupom usado no PDV
      passa a somar 1 em `usos`, para o novo `limite` funcionar. *(decisão minha)*

11. **Pedidos** — mesmos documentos, campos mapeados:
    - `status`: `recebido`→`novo`, `em_preparo`→`preparo`, `pronto`→`pronto`,
      `entregue`→`entregue` (escrito direto no banco, sem disparar o fluxo da tela,
      para não gerar vendas duplicadas de pedidos que já viraram venda)
    - `origem`/`tipoEntrega` → `tipo` (`delivery` / `retirada` / `mesa`)
    - `numeroPedido`→`numero`; `mesaId`→`mesa`; `taxaEntrega`→`taxa`;
      `formaPagamento`→`pagamento.forma`; `fechada`→`contaFechada`
    - `criadoEm` (Timestamp do Firestore) → número em milissegundos (a V2 filtra e
      ordena por número; as regras V2 exigem número). O valor original é guardado
      em `criadoEmTs`.
    - O contador `contadores/pedidos` começa no maior `numero` existente.
    - Itens antigos com formato diferente (`observacao`, `adicionais[].opcaoNome`)
      aparecem normalmente: as telas da V2 tratam os dois formatos.

12. **`vendas`** — único ajuste: `criadoEm` Timestamp → milissegundos (original em
    `criadoEmTs`), para Dashboard/Relatório consultarem por período da mesma forma.

13. **Usuários → Equipe.** `usuarios/{uid}` → `equipe/{uid}` (mesmo uid, mesmas
    contas de login no Authentication; ninguém troca senha): `papel` `dono`→
    `perfil: 'dono'`, `garcom`→`perfil: 'atendente'`; usuário com `ativo: false`
    não é copiado. Isso resolve de forma segura a restrição por papel que ficou
    pausada na V1 (o perfil passa a ser escolhido num seletor do admin, e as
    regras do Firestore conferem). O e-mail de **superadmin** fixo da V2
    (`rasistema25@gmail.com`, do colega) é trocado por **`admin@gmail.com`** — a
    conta de login que já funciona hoje no admin do Burger House (definido pela
    usuária) — em `js/config.js` e `firestore.rules`. Por ser superadmin, essa
    conta entra mesmo sem documento em `equipe`, então o acesso ao painel não
    depende do resultado da migração de `usuarios`.
    - **Acesso por perfil:** a V2 já deixa o dono escolher, pessoa por pessoa,
      quais abas um atendente vê (campo `abas`). O padrão para atendente passa a
      ser Pedidos, Mesas e PDV. Fiado, Relatório, Dashboard, Financeiro,
      Configurações e Equipe ficam só para o dono, a menos que ele libere.
      Nas regras, a equipe pode criar vendas (fechar mesa, PDV) e registrar
      pagamento de fiado. Ler o faturamento continua dependendo das abas
      liberadas na tela. *(decisão minha)*

14. **Regras do Firestore em três momentos:**
    - *Transição* (publicadas antes de testar a V2 contra o banco real): regras
      V1 atuais **+** leitura/escrita das coleções novas da V2 (`config`,
      `adicionais`, `equipe`, `contadores`, `bairros`, `clientes`, `fidelidade`,
      `contas_pagar`, `contas_receber`). A V1 continua funcionando.
    - *Final* (no corte): regras da V2, acrescidas de `vendas` (equipe lê e
      escreve) e de compatibilidade de leitura dos campos antigos.
    - *Rollback*: o texto das regras V1 (`regras.md`) é guardado para republicar.

15. **Firebase SDK**: sai o "compat" (v8 global), entra o modular por CDN do
    `db.js` da V2. `firebase-config.js` antigo é substituído por `js/config.js`
    com as credenciais do `moda-63d8d`.

## Hospedagem, cache e versionamento (desde o início)

Aprendizado do Manejo Mix: código novo publicado não aparecia porque alguma camada
de cache (CDN, navegador, service worker) servia a versão antiga. Na Vercel o HTML
e o JS já saem com `max-age=0, must-revalidate`, então o risco aqui está
principalmente no **service worker** e nos **módulos JS importados**.

- **Versão única por publicação.** Uma constante de versão (ex.: `2.0.0-r1`)
  aparece em todo `<script>`/`<link>` como `?v=` **e em todo `import` entre
  módulos**. Todos os arquivos da mesma publicação usam a mesma string (versões
  diferentes do mesmo módulo criariam duas instâncias dele no navegador). Um
  script `scripts/versao.js` (Node, sem dependências) troca a versão em todos os
  arquivos de uma vez; publicar sem rodá-lo é erro de processo.
- **Service worker**: `sw.js` continua no **mesmo caminho** `/sw.js` (assim o
  navegador troca o SW antigo pelo novo sozinho). O nome do cache inclui a mesma
  versão. Na ativação, apaga **todos** os caches que não sejam o atual, inclusive
  `burger-house-shell-v2` da V1. HTML, JS e CSS: rede primeiro, cache só offline.
  Cache primeiro só para imagens, fontes e o SDK do Firebase (URLs já versionadas).
- **`vercel.json`** da V2, mais: `Cache-Control: no-cache` explícito para
  `/sw.js`, `*.html`, `*.js`, `*.css`; imagens de `assets/` com cache de 1 dia
  (mesma escolha do Manejo Mix); redirecionamento `/admin.html` → `/admin/`.
- **Aviso de versão nova**: o app compara a versão em uso com a publicada e, se
  diferente, mostra "Nova versão disponível — atualizar".
- **Variáveis da Vercel** `FIREBASE_PROJECT_ID`/`FIREBASE_API_KEY` para a prévia
  `/p/ID` no WhatsApp.
- **Verificação após cada publicação**: conferir com `curl -I` os cabeçalhos de
  HTML/JS/SW e abrir o site num celular que já tinha a V1 instalada.

## Ambiente de trabalho e corte

- Desenvolvimento num branch `v2`. Antes de começar, tag `v1-final` no commit
  atual do `main` (rollback de código).
- Testes locais e num **endereço de prévia da Vercel** (deploy do branch), contra o
  banco real com as regras de transição. Pedidos de teste são marcados (cliente
  "TESTE") e apagados depois.
- Como a V1 segue no ar durante os testes e continua criando pedidos/vendas no
  formato antigo, **as migrações são repetíveis**: rodar de novo só converte o que
  ainda está no formato antigo, sem duplicar nada.
- **O código da V1 não é alterado** até o corte. Os números de pedido de teste
  da V2 podem coincidir com os da V1 durante os testes. Como os pedidos de teste
  são apagados antes do corte, e no corte o contador é recalculado a partir do
  maior número real, isso não chega à produção. *(decisão minha)*
- **Corte** (horário de menor movimento, combinado com a usuária antes — não é
  passo automático): backup → rodar as migrações de novo → publicar regras finais
  → merge do `v2` no `main` (a Vercel publica) → verificação de cabeçalhos e SW →
  teste no celular (cardápio, QR de uma mesa impressa, pedido, PDV, fiado).
- **Rollback**: "Instant Rollback" da Vercel para o deploy V1 + republicar regras
  V1. Como a migração é aditiva, a V1 volta a ler os dados; o que se perde na
  volta é só a visão, na V1, dos pedidos criados pela V2 depois do corte.

## Não-objetivos

- Não alterar a pasta `cardapio-online50k`, nem outros projetos.
- Não recadastrar produtos, fotos, categorias, adicionais, mesas ou usuários.
- Não reimprimir QR Codes.
- Não mudar o comportamento do PDV, do fiado e do relatório.
- Não migrar as fotos para dentro do Firestore (continuam arquivos em `assets/`).

## Anti-objetivos (seria fracasso mesmo "funcionando")

- Qualquer produto, foto, pedido, venda ou fiado perdido ou diferente do original.
- QR Code impresso que deixa de abrir a mesa certa.
- Faturamento contado em dobro ou fiado fora do relatório.
- Celular de cliente preso na versão antiga depois do corte.

## A critério de quem construir

- Divisão em fases/tarefas e ordem exata (assunto do plano).
- Layout das telas portadas (PDV, Fiado, Relatório) no visual da V2.
- Detalhes de UI que a V2 já resolve bem.
- Formato exato do aviso de versão nova e do script de versionamento.

## Critério de sucesso

A usuária abre o Burger House em `burgerhouse-nine.vercel.app` rodando a V2: os 35
produtos com as fotos de sempre, na ordem de hoje, com seus adicionais; os QR
impressos abrem a mesa certa; pedidos antigos e novos aparecem no kanban; PDV,
fiado e relatório funcionam como antes; dashboard e financeiro batem com as vendas;
e um celular que tinha a V1 instalada passa a mostrar a V2 sem limpar cache.
