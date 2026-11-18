import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chaveItem, adicionarAoCarrinho, alterarQtd, removerLinha, precoUnitario, subtotalCarrinho, descontoPDV,
  validarCupomPDV, pagamentosPDV, dinheiroNecessario, montarVendaPDV, validarVendaPDV, produtoPorCodigo
} from '../js/nucleo/pdv.js';
import { valorLinhaItem } from '../js/nucleo/pedidos.js';

const xBacon = { id: 'p1', nome: 'X-Bacon', preco: 28, disponivel: true, codigoBarras: '789' };
const bacon = { grupoNome: 'Extras', opcaoNome: 'Bacon', preco: 10 };
const queijo = { grupoNome: 'Extras', opcaoNome: 'Queijo', preco: 4 };

test('mesmo produto com adicionais diferentes vira outra linha', () => {
  let c = adicionarAoCarrinho([], xBacon);
  c = adicionarAoCarrinho(c, xBacon);
  assert.equal(c.length, 1);
  assert.equal(c[0].qtd, 2);
  c = adicionarAoCarrinho(c, xBacon, [bacon]);
  c = adicionarAoCarrinho(c, xBacon, [], 'sem cebola');
  assert.equal(c.length, 3);
  assert.notEqual(chaveItem('p1', [bacon], ''), chaveItem('p1', [queijo], ''));
  assert.equal(chaveItem('p1', [bacon], ''), chaveItem('p1', [{ ...bacon }], ''));
});

test('preco base usa precoPromo quando menor', () => {
  const c = adicionarAoCarrinho([], { ...xBacon, precoPromo: 25 });
  assert.equal(c[0].preco, 25);
});

test('qtd zero remove a linha', () => {
  let c = adicionarAoCarrinho([], xBacon);
  c = alterarQtd(c, 0, 1);
  assert.equal(c[0].qtd, 2);
  c = alterarQtd(c, 0, -2);
  assert.deepEqual(c, []);
  c = adicionarAoCarrinho([], xBacon);
  assert.deepEqual(removerLinha(c, 0), []);
});

test('subtotal com adicionais', () => {
  let c = adicionarAoCarrinho([], xBacon, [bacon]);
  c = alterarQtd(c, 0, 1);
  assert.equal(precoUnitario(c[0]), 38);
  assert.equal(subtotalCarrinho(c), 76);
});

test('desconto manual mais cupom percentual limitado ao subtotal', () => {
  assert.equal(descontoPDV({ subtotal: 100, manual: 5, cupom: { tipo: 'percentual', valor: 10 } }), 15);
  assert.equal(descontoPDV({ subtotal: 100, manual: 95, cupom: { tipo: 'percentual', valor: 10 } }), 100);
  assert.equal(descontoPDV({ subtotal: 33.33, manual: 0, cupom: { tipo: 'percentual', valor: 10 } }), 3.33);
  assert.equal(descontoPDV({ subtotal: 50, manual: 0, cupom: null }), 0);
});

test('cupom valor fixo', () => {
  assert.equal(descontoPDV({ subtotal: 100, manual: 0, cupom: { tipo: 'valor', valor: 12 } }), 12);
  assert.equal(descontoPDV({ subtotal: 100, manual: 0, cupom: { tipo: 'fixo', valor: 12 } }), 12);
  assert.equal(descontoPDV({ subtotal: 10, manual: 0, cupom: { tipo: 'valor', valor: 12 } }), 10);
});

test('cupom frete recusado no pdv', () => {
  const r = validarCupomPDV({ tipo: 'frete', valor: 0, ativo: true }, 50, '2026-11-18');
  assert.equal(r.ok, false);
  assert.ok(r.erro);
  assert.equal(descontoPDV({ subtotal: 50, manual: 0, cupom: { tipo: 'frete', valor: 5 } }), 0);
});

test('cupom vencido ou no limite recusado', () => {
  const hoje = '2026-11-18';
  assert.deepEqual(validarCupomPDV(null, 50, hoje), { ok: false, erro: 'Cupom inválido.' });
  assert.deepEqual(validarCupomPDV({ tipo: 'valor', valor: 5, ativo: false }, 50, hoje), { ok: false, erro: 'Cupom inválido.' });
  assert.deepEqual(validarCupomPDV({ tipo: 'valor', valor: 5, ativo: true, validade: '2026-11-17' }, 50, hoje), { ok: false, erro: 'Este cupom expirou.' });
  assert.deepEqual(validarCupomPDV({ tipo: 'valor', valor: 5, ativo: true, limite: 3, usos: 3 }, 50, hoje), { ok: false, erro: 'Este cupom já atingiu o limite de usos.' });
  assert.equal(validarCupomPDV({ tipo: 'valor', valor: 5, ativo: true, minimo: 60, codigo: 'X' }, 50, hoje).ok, false);
  assert.equal(validarCupomPDV({ tipo: 'valor', valor: 5, ativo: true, validade: hoje, limite: 3, usos: 2, minimo: 50 }, 50, hoje).ok, true);
  assert.equal(validarCupomPDV({ tipo: 'fixo', valor: 5, ativo: true, validade: '' }, 50, hoje).ok, true);
});

test('pagamento dividido', () => {
  assert.deepEqual(pagamentosPDV({ total: 50, forma1: 'pix', dividir: false }), [{ forma: 'pix', valor: 50 }]);
  assert.deepEqual(
    pagamentosPDV({ total: 50, forma1: 'pix', dividir: true, forma2: 'dinheiro', valor2: 20 }),
    [{ forma: 'pix', valor: 30 }, { forma: 'dinheiro', valor: 20 }]
  );
  assert.equal(pagamentosPDV({ total: 50, forma1: 'pix', dividir: true, forma2: 'dinheiro', valor2: 80 })[1].valor, 50);
  assert.equal(pagamentosPDV({ total: 50, forma1: 'pix', dividir: true, forma2: 'dinheiro', valor2: -5 })[1].valor, 0);
});

test('troco so da parte em dinheiro', () => {
  const pags = pagamentosPDV({ total: 50, forma1: 'pix', dividir: true, forma2: 'dinheiro', valor2: 20 });
  assert.equal(dinheiroNecessario(pags), 20);
  assert.equal(dinheiroNecessario([{ forma: 'pix', valor: 50 }]), 0);
  const c = adicionarAoCarrinho([], { ...xBacon, preco: 50 });
  const v = montarVendaPDV({ carrinho: c, desconto: 0, cupomCodigo: null, fiado: false, pagamentos: pags, recebido: 50, cliente: '', agora: 1 });
  assert.equal(v.recebidoDinheiro, 50);
  assert.equal(v.troco, 30);
});

const carrinho = adicionarAoCarrinho([], xBacon, [bacon]);

test('venda normal no formato v1', () => {
  const pags = [{ forma: 'dinheiro', valor: 20 }, { forma: 'credito', valor: 18 }];
  const v = montarVendaPDV({ carrinho, desconto: 0, cupomCodigo: 'PROMO', fiado: false, pagamentos: pags, recebido: 20, cliente: '  Ana ', agora: 1700000000000 });
  assert.deepEqual(Object.keys(v).sort(), ['cliente', 'criadoEm', 'cupom', 'desconto', 'fiado', 'itens', 'pagamento', 'pagamentos', 'recebidoDinheiro', 'subtotal', 'total', 'troco'].sort());
  assert.equal(v.pagamento, 'Dinheiro + Crédito');
  assert.equal(v.criadoEm, 1700000000000);
  assert.equal(v.fiado, false);
  assert.equal(v.subtotal, 38);
  assert.equal(v.total, 38);
  assert.equal(v.cliente, 'Ana');
  assert.equal(v.cupom, 'PROMO');
  assert.equal(v.troco, 0);
  const sem = montarVendaPDV({ carrinho, desconto: 8, cupomCodigo: null, fiado: false, pagamentos: [{ forma: 'pix', valor: 30 }], recebido: 0, cliente: '', agora: 1 });
  assert.equal(sem.total, 30);
  assert.equal(sem.cliente, null);
  assert.equal(sem.cupom, null);
  assert.equal(sem.recebidoDinheiro, null);
  assert.equal(sem.troco, null);
  assert.equal(sem.pagamento, 'Pix');
});

test('venda fiado no formato v1', () => {
  const v = montarVendaPDV({ carrinho, desconto: 0, cupomCodigo: null, fiado: true, pagamentos: [{ forma: 'pix', valor: 38 }], recebido: 99, cliente: 'Bia', agora: 5 });
  assert.deepEqual(Object.keys(v).sort(), ['cliente', 'criadoEm', 'cupom', 'desconto', 'fiado', 'itens', 'pagamento', 'pagamentos', 'pagamentosFiado', 'recebidoDinheiro', 'subtotal', 'total', 'troco', 'valorPago'].sort());
  assert.equal(v.fiado, true);
  assert.equal(v.valorPago, 0);
  assert.deepEqual(v.pagamentosFiado, []);
  assert.deepEqual(v.pagamentos, []);
  assert.equal(v.pagamento, 'Pagamento a Prazo');
  assert.equal(v.recebidoDinheiro, null);
  assert.equal(v.troco, null);
  assert.equal(v.cliente, 'Bia');
});

test('itens sem produtoId e com preco base', () => {
  const v = montarVendaPDV({ carrinho: alterarQtd(carrinho, 0, 1), desconto: 0, cupomCodigo: null, fiado: true, pagamentos: [], recebido: 0, cliente: 'Bia', agora: 5 });
  assert.deepEqual(v.itens, [{
    nome: 'X-Bacon', preco: 28, qtd: 2,
    adicionais: [{ grupoNome: 'Extras', opcaoNome: 'Bacon', nome: 'Bacon', preco: 10 }],
    observacao: null
  }]);
  assert.equal('produtoId' in v.itens[0], false);
  assert.equal(valorLinhaItem(v.itens[0]), 76);
});

test('mensagens de validacao da v1', () => {
  const pags = [{ forma: 'pix', valor: 30 }, { forma: 'dinheiro', valor: 0 }];
  assert.equal(validarVendaPDV({ carrinho: [], fiado: false, cliente: '', pagamentos: [], recebido: 0, dividir: false }), 'Adicione ao menos um produto ao carrinho.');
  assert.equal(validarVendaPDV({ carrinho, fiado: true, cliente: '  ', pagamentos: [], recebido: 0, dividir: false }), 'Informe o nome do cliente para registrar o pagamento a prazo.');
  assert.equal(validarVendaPDV({ carrinho, fiado: false, cliente: '', pagamentos: pags, recebido: 0, dividir: true }), 'Informe um valor válido para a 2ª forma de pagamento (menor que o total).');
  assert.equal(validarVendaPDV({ carrinho, fiado: false, cliente: '', pagamentos: [{ forma: 'dinheiro', valor: 38 }], recebido: 20, dividir: false }), 'Informe quanto o cliente pagou em dinheiro (valor recebido menor que o necessário).');
  assert.equal(validarVendaPDV({ carrinho, fiado: false, cliente: '', pagamentos: [{ forma: 'dinheiro', valor: 38 }], recebido: 40, dividir: false }), null);
  assert.equal(validarVendaPDV({ carrinho, fiado: true, cliente: 'Bia', pagamentos: [], recebido: 0, dividir: false }), null);
});

test('busca por codigo de barras', () => {
  const lista = [xBacon, { id: 'p2', nome: 'Y', preco: 1, codigoBarras: '555', disponivel: false }];
  assert.equal(produtoPorCodigo(lista, '789').id, 'p1');
  assert.equal(produtoPorCodigo(lista, '555'), null);
  assert.equal(produtoPorCodigo(lista, '000'), null);
  assert.equal(produtoPorCodigo(lista, ''), null);
});

test('sem undefined', () => {
  const v = montarVendaPDV({ carrinho, desconto: 0, cupomCodigo: undefined, fiado: false, pagamentos: [{ forma: 'pix', valor: 38 }], recebido: undefined, cliente: undefined, agora: 1 });
  assert.equal(JSON.stringify(v).includes('undefined'), false);
  assert.equal(Object.values(v).some(x => x === undefined), false);
  assert.equal(JSON.stringify(v).includes('NaN'), false);
});

/* ===== Task 2: tela do PDV ===== */
import { readFileSync } from 'node:fs';
import { novoIdVendaPDV } from '../js/nucleo/pdv.js';

const ler = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('id da venda do pdv: prefixo pdv- e unico', () => {
  const ids = new Set(Array.from({ length: 2000 }, () => novoIdVendaPDV()));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.match(id, /^pdv-[a-z0-9]+$/);
});

test('rota pdv registrada para dono e atendente', () => {
  const app = ler('js/admin/app.js');
  assert.match(app, /pdv:\s*\{\s*nome:\s*'PDV',\s*icone:\s*'ti-cash-register',\s*perfis:\s*\['dono',\s*'atendente'\],\s*mod:\s*\(\)\s*=>\s*import\('\.\/pdv\.js\?v=[^']+'\)/);
});

test('tela do pdv: textos e regras da v1 (verificacao de fonte)', () => {
  const src = ler('js/admin/pdv.js');
  for (const t of [
    'Vendas hoje', 'Total vendido hoje', 'Código de barras não encontrado.', ' adicionado!',
    'Pagamento a Prazo (cliente paga depois)', 'Dividir em 2 formas de pagamento', 'Valor recebido', 'Troco', 'faltam ',
    'Finalizar venda', 'Limpar carrinho', 'Venda finalizada com sucesso!', 'Pagamento a prazo registrado!',
    'Vendas de hoje', 'Nova venda registrada!', "'F2'", "'F4'", "'Escape'",
    'Essa venda vai ficar registrada como pagamento a prazo, sem pagamento agora. Informe o nome do cliente pra não perder o controle.'
  ]) assert.ok(src.includes(t), `falta: ${t}`);
  for (const f of ['produtoPorCodigo', 'validarVendaPDV', 'montarVendaPDV', 'validarCupomPDV', 'novoIdVendaPDV', 'msDe', 'bip(']) {
    assert.ok(src.includes(f), `falta: ${f}`);
  }
  assert.match(src, /db\.set\('vendas',\s*idVenda\w*,/);
  assert.ok(!src.includes("db.add('vendas'"), 'venda gravada com id fixo, nunca db.add');
  assert.match(src, /db\.get\('cupons',/);
  assert.match(src, /db\.update\('cupons',\s*[^,]+,\s*\{\s*usos:\s*inc\(1\)\s*\}\)/);
  assert.match(src, /perfil\s*===\s*'dono'/);
  assert.match(src, /db\.watch\('vendas',\s*\{\s*where:\s*\[\['criadoEm',\s*'>=',/);
});

test('produto tem campo codigo de barras', () => {
  const src = ler('js/admin/cardapio.js');
  assert.ok(src.includes('Código de barras'));
  assert.match(src, /codigoBarras:\s*f\.codigoBarras\.value\.trim\(\)\s*\|\|\s*null/);
});

/* ===== Rodada de correção 1 ===== */
import { codigoDuplicado, vendasNovasDeOutroAparelho } from '../js/nucleo/pdv.js';

test('codigo de barras repetido e recusado (ignora o proprio produto)', () => {
  const lista = [{ id: 'a', nome: 'X-Bacon', codigoBarras: '789' }, { id: 'b', nome: 'Coca', codigoBarras: null }];
  assert.equal(codigoDuplicado(lista, '789', 'b').nome, 'X-Bacon');
  assert.equal(codigoDuplicado(lista, ' 789 ', undefined).id, 'a');
  assert.equal(codigoDuplicado(lista, '789', 'a'), null);
  assert.equal(codigoDuplicado(lista, '', 'b'), null);
  assert.equal(codigoDuplicado(lista, null, 'b'), null);
  assert.equal(codigoDuplicado(lista, '111', 'b'), null);
});

test('aviso de venda de outro aparelho: so vendas novas, de fora e nao vistas', () => {
  const abertura = 1_000_000;
  const desde = abertura - 5000;
  const vendas = [
    { id: 'velha', criadoEm: abertura - 60000 },            // já existia (veio do servidor depois do cache)
    { id: 'minha', criadoEm: abertura + 1000 },             // gravada nesta aba
    { id: 'nova', criadoEm: abertura + 2000 },              // outro aparelho
    { id: 'ts', criadoEm: { seconds: (abertura + 3000) / 1000 } }, // Timestamp do Firestore
    { id: 'vista', criadoEm: abertura + 4000 },
    { id: 'semdata', criadoEm: null }
  ];
  const r = vendasNovasDeOutroAparelho(vendas, new Set(['minha']), desde, new Set(['vista']));
  assert.deepEqual(r.map(v => v.id), ['nova', 'ts']);
  assert.deepEqual(vendasNovasDeOutroAparelho(vendas, new Set(), abertura + 10000).map(v => v.id), []);
});

test('pdv trava o carrinho enquanto grava e conta o cupom capturado antes (fonte)', () => {
  const src = ler('js/admin/pdv.js');
  assert.ok(src.includes('Salvando…'));
  assert.ok(src.includes('Sem conexão? A venda será enviada assim que a internet voltar.'));
  assert.match(src, /const cupomId = cupom\?\.id \|\| null/);
  assert.match(src, /db\.update\('cupons',\s*cupomId,\s*\{\s*usos:\s*inc\(1\)\s*\}\)/);
  assert.ok(src.includes('vendasNovasDeOutroAparelho('));
  const card = ler('js/admin/cardapio.js');
  assert.ok(card.includes('codigoDuplicado('));
  assert.ok(card.includes('Este código de barras já está no produto'));
});
