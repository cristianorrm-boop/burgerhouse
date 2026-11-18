// Plano do corte (pedidos, vendas e contador): repetível, só toca o que ainda está no formato V1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { planejarCorte, conferirSegurancaCorte } from '../ferramentas/plano.mjs';
import {
  converterPedido, converterVenda, contadorInicial,
  precisaConverterPedido, precisaConverterVenda,
} from '../ferramentas/conversores.mjs';
import { desserializar } from '../ferramentas/serializar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fx = () => desserializar(
  JSON.parse(readFileSync(path.join(aqui, 'fixtures', 'movimento-v1.json'), 'utf8')), null,
).colecoes;

// Imita o Timestamp do Firestore (tem toMillis; não é clonável com structuredClone).
class TsFalso {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
}

// Pedido como a V2 grava (js/cliente.js), dados inventados.
const pedidoNativo = () => ({
  status: 'preparo',
  tipo: 'delivery',
  mesa: null,
  numero: 13,
  cliente: { nome: 'Cliente Teste', telefone: '34900000000' },
  endereco: { bairro: 'Centro', bairroId: 'b1', rua: 'Rua Teste', numero: '10', complemento: '', referencia: '' },
  itens: [{ produtoId: 'p1', nome: 'Lanche Teste', qtd: 1, preco: 30, adicionais: [{ nome: 'Bacon', preco: 5 }], obs: 'sem cebola' }],
  subtotal: 35, taxa: 6, desconto: 0, descontoFidelidade: 0, total: 41,
  cupom: null, usouFidelidade: false,
  pagamento: { forma: 'pix', troco: null },
  obs: '',
  criadoEm: 1790020000000,
  historico: [{ status: 'novo', em: 1790020000000 }, { status: 'preparo', em: 1790020100000 }],
});

// Aplica as operações em memória como o Firestore faria (update = mescla rasa), sem clonar
// valores (o Timestamp original precisa continuar sendo o mesmo objeto).
function aplicar(atual, operacoes) {
  const novo = {};
  for (const [c, docs] of Object.entries(atual)) {
    novo[c] = {};
    for (const [id, d] of Object.entries(docs)) novo[c][id] = { ...d };
  }
  for (const op of operacoes) {
    novo[op.colecao] ??= {};
    if (op.tipo === 'criar') {
      assert.ok(!novo[op.colecao][op.id], `criar em doc existente ${op.colecao}/${op.id}`);
      novo[op.colecao][op.id] = { ...op.campos };
    } else {
      assert.ok(novo[op.colecao][op.id], `${op.tipo} em doc inexistente ${op.colecao}/${op.id}`);
      Object.assign(novo[op.colecao][op.id], op.campos);
    }
  }
  return novo;
}

function semUndefined(v, caminho = '') {
  assert.notEqual(v, undefined, `undefined em ${caminho || '(raiz)'}`);
  if (Array.isArray(v)) v.forEach((x, i) => semUndefined(x, `${caminho}[${i}]`));
  else if (v !== null && typeof v === 'object' && !(v instanceof Date) && typeof v.toMillis !== 'function') {
    for (const k of Object.keys(v)) semUndefined(v[k], `${caminho}.${k}`);
  }
}

function entrada() {
  const c = fx();
  c.pedidos.pTs = { ...c.pedidos.pRecebido, numeroPedido: 'TS00TS00', criadoEm: new TsFalso(1790006000000) };
  c.pedidos.pNativo = pedidoNativo();
  c.vendas.vTs = { ...c.vendas.vPdv1, criadoEm: new TsFalso(1790016000000) };
  c.vendas.vConvertida = { ...c.vendas.vPdv1, criadoEm: 1790017000000, criadoEmTs: new Date(1790017000000) };
  return c;
}

test('converter duas vezes nao muda nada', () => {
  const atual = entrada();
  const primeiro = planejarCorte(atual);
  const conv = primeiro.operacoes.filter(o => o.tipo === 'converter');
  assert.deepEqual(conv.filter(o => o.colecao === 'pedidos').map(o => o.id).sort(),
    ['pDelivery', 'pMesa', 'pPreparo', 'pPronto', 'pRecebido', 'pSemItens', 'pTs']);
  assert.deepEqual(conv.filter(o => o.colecao === 'vendas').map(o => o.id).sort(),
    ['vFiadoAberto', 'vFiadoParcial', 'vMesa', 'vOnline', 'vPdv1', 'vPdv2', 'vTs']);

  const depois = aplicar(atual, primeiro.operacoes);
  const segundo = planejarCorte(depois);
  assert.deepEqual(segundo.operacoes, []);

  // criadoEmTs continua sendo o valor original (o mesmo objeto), e criadoEm é número.
  for (const c of ['pedidos', 'vendas']) {
    for (const [id, doc] of Object.entries(atual[c])) {
      const fim = depois[c][id];
      assert.equal(typeof fim.criadoEm, 'number', `${c}/${id}`);
      if (typeof doc.criadoEm !== 'number') assert.strictEqual(fim.criadoEmTs, doc.criadoEm, `${c}/${id}`);
    }
  }
  assert.ok(depois.pedidos.pTs.criadoEmTs instanceof TsFalso);
  assert.ok(depois.vendas.vTs.criadoEmTs instanceof TsFalso);

  // Uma terceira rodada sobre o resultado segue vazia.
  assert.deepEqual(planejarCorte(aplicar(depois, segundo.operacoes)).operacoes, []);
});

test('pedido nativo da v2 fica intacto', () => {
  const doc = pedidoNativo();
  assert.equal(precisaConverterPedido(doc), false);
  const { operacoes } = planejarCorte({ pedidos: { n1: doc } });
  assert.deepEqual(operacoes.filter(o => o.colecao === 'pedidos'), []);
  // Mesmo chamado direto, o conversor não destrói nada do formato V2.
  const { campos } = converterPedido(doc);
  for (const k of ['status', 'tipo', 'numero', 'mesa', 'taxa', 'pagamento', 'itens', 'historico', 'endereco', 'criadoEm']) {
    assert.deepEqual(campos[k], doc[k], k);
  }
  assert.equal('criadoEmTs' in campos, false);
});

test('pedido ja convertido nao precisa de conversao', () => {
  const doc = fx().pedidos.pDelivery;
  const convertido = { ...doc, ...converterPedido(doc).campos };
  assert.equal(precisaConverterPedido(convertido), false);
  assert.equal(precisaConverterPedido(doc), true);
});

test('pedido convertido e mexido pela v1 so muda o status', () => {
  const doc = fx().pedidos.pPreparo;
  const convertido = { ...doc, ...converterPedido(doc).campos };
  const mexido = { ...convertido, status: 'pronto' }; // V1 ainda no ar avançou o kanban
  const voltou = { ...convertido, status: 'em_preparo' };
  assert.deepEqual(planejarCorte({ pedidos: { a: mexido } }).operacoes.filter(o => o.colecao === 'pedidos'), []);
  const ops = planejarCorte({ pedidos: { a: voltou } }).operacoes.filter(o => o.colecao === 'pedidos');
  assert.deepEqual(ops, [{ colecao: 'pedidos', id: 'a', tipo: 'converter', campos: { status: 'preparo' } }]);
});

test('venda ja convertida fica intacta', () => {
  const venda = { ...fx().vendas.vPdv1, criadoEm: 1790017000000, criadoEmTs: new TsFalso(1790017000000) };
  assert.equal(precisaConverterVenda(venda), false);
  assert.deepEqual(planejarCorte({ vendas: { v: venda } }).operacoes.filter(o => o.colecao === 'vendas'), []);
  const { campos } = converterVenda(venda);
  assert.equal(campos.criadoEm, 1790017000000);
  assert.equal('criadoEmTs' in campos, false);
});

test('criadoEmTs so com data real', () => {
  const { campos } = converterVenda({ criadoEm: 1790017000000 });
  assert.deepEqual(campos, { criadoEm: 1790017000000 });
  const ts = new TsFalso(5);
  assert.strictEqual(converterVenda({ criadoEm: ts }).campos.criadoEmTs, ts);
  assert.equal('criadoEmTs' in converterPedido({ ...fx().pedidos.pDelivery, criadoEmTs: 'x' }).campos, false);
});

test('delivery sem endereco', () => {
  const doc = { ...fx().pedidos.pDelivery, cliente: { nome: 'Cliente Teste', telefone: '34900000000' } };
  const { campos, avisos } = converterPedido(doc);
  assert.equal(campos.tipo, 'delivery');
  assert.equal('endereco' in campos, false);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /endereço/);
  semUndefined(campos);
});

test('venda sem criadoEm', () => {
  const r = converterVenda({ total: 10 });
  assert.deepEqual(r.campos, {});
  assert.equal(r.avisos.length, 1);
  const plano = planejarCorte({ vendas: { v: { total: 10 } } });
  assert.deepEqual(plano.operacoes.filter(o => o.colecao === 'vendas'), []);
  assert.equal(plano.avisos.length, 1);
  semUndefined(plano);
});

test('doc malformado nao gera undefined', () => {
  const docs = {
    semStatus: { origem: 'delivery', tipoEntrega: 'retirada', formaPagamento: 'pix', criadoEm: new Date(1),
      itens: [{ nome: 'X', preco: 1, qtd: 1 }] },
    itemNulo: { status: 'recebido', origem: 'mesa', mesaId: 'm1', criadoEm: new Date(2),
      itens: [null, { nome: 'X', preco: 1, qtd: 1, adicionais: [null, { opcaoNome: 'B', preco: 1 }] }, 'lixo'] },
    semNada: {},
  };
  const s = converterPedido(docs.semStatus);
  assert.equal(s.campos.status, 'novo');
  assert.deepEqual(s.campos.historico, [{ status: 'novo', em: 1 }]);
  assert.ok(s.avisos.some(a => /status/.test(a)));
  const n = converterPedido(docs.itemNulo);
  assert.equal(n.campos.itens.length, 1);
  assert.equal(n.campos.itens[0].adicionais.length, 1);
  assert.equal(n.campos.itens[0].adicionais[0].nome, 'B');
  assert.ok(n.avisos.some(a => /item/.test(a)));
  assert.ok(n.avisos.some(a => /adicional/.test(a)));
  for (const d of Object.values(docs)) semUndefined(converterPedido(d));
  const plano = planejarCorte({ pedidos: structuredClone(docs) });
  semUndefined(plano);
  assert.equal(plano.operacoes.filter(o => o.colecao === 'pedidos').length, 3);
});

test('contador ignora codigo so com digitos', () => {
  const r = contadorInicial([{ numeroPedido: '12345678' }, { numeroPedido: 7 }, { numeroPedido: 'AB12CD34' }]);
  assert.equal(r.n, 7);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /2/);
  // Número dado pela V2 conta mesmo se for grande.
  assert.equal(contadorInicial([{ tipo: 'delivery', numero: 150000 }]).n, 150000);
});

test('contador: cria, atualiza so para cima', () => {
  const pedidos = { a: { numeroPedido: 9, status: 'entregue', origem: 'delivery', tipoEntrega: 'retirada', criadoEm: new Date(1) } };
  const op = c => planejarCorte({ pedidos, contadores: c }).operacoes.filter(o => o.colecao === 'contadores');
  assert.deepEqual(op({}), [{ colecao: 'contadores', id: 'pedidos', tipo: 'criar', campos: { n: 9 } }]);
  assert.deepEqual(op({ pedidos: { n: 3 } }), [{ colecao: 'contadores', id: 'pedidos', tipo: 'atualizar', campos: { n: 9 } }]);
  assert.deepEqual(op({ pedidos: { n: 9 } }), []);
  assert.deepEqual(op({ pedidos: { n: 20 } }), []);
});

test('trava de seguranca do corte', () => {
  const atual = { pedidos: { a: { criadoEmTs: 1 } }, vendas: { v: {} }, produtos: { p: {} } };
  const tenta = ops => () => conferirSegurancaCorte(ops, atual);
  assert.throws(tenta([{ colecao: 'produtos', id: 'p', tipo: 'converter', campos: { x: 1 } }]));
  assert.throws(tenta([{ colecao: 'pedidos', id: 'a', tipo: 'converter', campos: { criadoEmTs: 2 } }]));
  assert.throws(tenta([{ colecao: 'pedidos', id: 'a', tipo: 'converter', campos: { origem: 'x' } }]));
  assert.throws(tenta([{ colecao: 'vendas', id: 'v', tipo: 'converter', campos: { total: 1 } }]));
  assert.throws(tenta([{ colecao: 'vendas', id: 'v', tipo: 'converter', campos: { criadoEm: undefined } }]));
  assert.throws(tenta([{ colecao: 'pedidos', id: 'nao', tipo: 'converter', campos: { status: 'novo' } }]));
  assert.throws(tenta([{ colecao: 'pedidos', id: 'a', tipo: 'converter', campos: {} }]));
  tenta([{ colecao: 'vendas', id: 'v', tipo: 'converter', campos: { criadoEm: 1 } }])();
});
