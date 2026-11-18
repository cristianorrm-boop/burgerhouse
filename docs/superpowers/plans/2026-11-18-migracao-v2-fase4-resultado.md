# Migração Burger House V2 — Fase 4 (PDV, Pagamento a Prazo, Relatório): resultado e entradas para a Fase 5

**Plano:** `2026-11-18-migracao-v2-fase4-pdv-fiado-relatorio.md` · concluída em 2026-11-18 (commits `cf586a1..47813f1`,
216 testes, versão `2.0.0-f4`). Nada foi gravado no banco real. Toda verificação foi no modo demo com a cópia do backup
(ensaio geral 7/7).

A revisão final da fase inteira foi interrompida pelos filtros da plataforma (modelo Opus). A usuária decidiu seguir
sem ela. As 6 tarefas tiveram revisão própria, e a rodada final teve conferência.

## O que a V2 passou a fazer

- **PDV** (`js/nucleo/pdv.js`, `js/admin/pdv.js`), para dona e atendente:
  - Venda e carrinho:
    - grade com busca e leitor de código de barras (campo novo "Código de barras" no cadastro, que recusa código repetido);
    - janela de adicionais com mínimo/máximo e observação;
    - cupom (soma `usos`), desconto manual, fiado, 2 formas de pagamento, troco;
    - atalhos F2/F4/Esc.
  - Proteções:
    - **uma venda por carrinho**: id `pdv-…` gravado com `set`, então F4 ou clique duplo não duplicam;
    - **carrinho travado enquanto grava**, com aviso de sem conexão depois de 8 s.
  - "Vendas de hoje" em tempo real, com aviso só de venda nova de outro aparelho.
- **Recibo** (`js/nucleo/recibo.js`, `js/admin/recibo.js`):
  - impresso e por WhatsApp, no mesmo link da V1 (`recibo.html#…`);
  - as linhas somam o subtotal e mostram adicionais e observação;
  - o `recibo.html` agora escapa todos os textos (alteração autorizada pela usuária).
- **Pagamento a Prazo** (`js/nucleo/fiado.js`, `js/admin/fiado.js`), só dona:
  - lista com filtro e pagamento parcial com data;
  - o pagamento é gravado em **transação**, que nunca deixa pagar mais que o total;
  - a regra do saldo (`saldoFiado`) é a mesma em todas as telas.
- **Relatório** (`js/nucleo/relatorio.js`, `js/admin/relatorio.js`), só dona:
  - mês e dia, cartões, gráfico por dia (legível no celular);
  - **CSV** no formato da V1, com proteção contra fórmula do Excel.
  - Conferido: out/2026 = 8 vendas, R$ 1.104,00, igual ao backup.
- **Excluir venda:** só a dona, nas três telas.
- Atendente que digita o endereço de uma tela bloqueada é levado para uma tela permitida, e o endereço acompanha.

## Entradas para a Fase 5 (corte)

### Regras do Firestore finais

Somam-se às da Fase 3 (`2026-11-17-migracao-v2-fase3-resultado.md`).

1. **`/vendas/{id}`**, que hoje não existe no `firestore.rules`, sem isso nada funciona:
   - `read` e `list` para `equipe()` (PDV "Vendas de hoje", Dashboard, Financeiro, Relatório e Pagamento a Prazo; as telas
     já limitam por aba);
   - `create` e `update` para `equipe()` (PDV com id fixo regravado, venda online, transação do fechamento de mesa,
     transação do pagamento de fiado);
   - `delete` só `dono()`.
2. `/cupons/{codigo}`: manter a regra de update com `soMudou(['usos'])` para a equipe (o PDV também soma usos) e o
   `get` público. Hoje a regra final já está assim.
3. `/pedidos` delete → só `dono()`.
4. Testar no emulador ou na prévia a transação com muitos pedidos (limite de 20 `exists/get` das regras).

### Outros itens

- Os 44 pedidos e as 8 vendas do banco são **de teste** (confirmado pela usuária em 2026-11-18). No corte, perguntar se
  ela quer converter ou apagar esses registros para começar o histórico limpo. Produtos, categorias, fotos, adicionais e
  mesas são reais e ficam.
- Restante do roteiro do corte: ver os resultados das Fases 2 e 3.

## Decisões tomadas durante a execução (com custo se estiverem erradas)

- Botões de recibo ligados na Tarefa 3, depois da tela do PDV. Custo: nenhum.
- O PDV cobra o preço promocional quando menor, como o site. Custo: nenhum se a dona espera o mesmo preço do site.
- Cupom sem o campo "ativo" é recusado (o único cupom real tem `ativo: true`). Custo: nenhum.
- Id de venda por carrinho gravado com `set`. Custo: nenhum.
- Código de barras repetido e aviso falso de "Nova venda" tratados como importantes e corrigidos.
- A venda só conta como feita quando o Firestore confirma (sem gravação "otimista"). Custo: sem internet, o PDV
  espera a rede voltar.
- Regra do saldo do fiado centralizada. A origem da venda (selo) é a mesma no PDV e no Relatório. Custo: nenhum.
- D1, D2 e D3 da rodada final (recibo com adicionais e observação, endereço da rota bloqueada, rótulos do gráfico no
  celular). Custo: só de exibição.

## Pequenos pontos deixados para depois

- PDV: o cupom não é relido do banco ao finalizar (igual à V1); o desconto aparece abaixo do mínimo até finalizar; o troco
  fica verde com o campo "recebido" vazio; o "recebido" não é arredondado a centavos; um erro de cálculo antes de gravar
  não mostra toast; o aviso de 8 s não é cancelado ao sair da tela.
- Fiado: a transação não confere `fiado === true`; aceita data futura; um valor acima do saldo é aplicado sem aviso
  (como na V1).
- Relatório: o gráfico não redesenha ao girar a tela; um teste tem um `replace` que não faz nada.
- Recibo: o link usa `location.origin` (o site fica na raiz do domínio).
- **Incidente:** testes no navegador fecharam o Edge da usuária. Regra permanente: testes headless só encerram o próprio
  processo, pelo PID.
