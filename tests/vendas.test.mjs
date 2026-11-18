import test from 'node:test';
import assert from 'node:assert/strict';
import { resumoVendas } from '../js/nucleo/faturamento.js';
import {
  cuponsAContar, idVendaFechamento, deveGerarVendaAoEntregar, vendaDePedidoOnline, vendaDeFechamentoMesa, pedidosParaFechar, idVendaPedido, idVendaMesa
} from '../js/nucleo/vendas.js';

const delivery = { id: 'p1', tipo: 'delivery', numero: 7, cliente: { nome: 'Ana' }, total: 50, subtotal: 45, desconto: 0,
  cupom: null, pagamento: { forma: 'dinheiro', troco: 100 }, itens: [{ nome: 'X', preco: 45, qtd: 1, obs: 'sem cebola' }] };

test('nao gera venda se ja tem vendaId', () => assert.equal(deveGerarVendaAoEntregar({ ...delivery, vendaId: 'v' }, 'entregue'), false));
test('pedido de mesa nao gera venda ao entregar', () => assert.equal(deveGerarVendaAoEntregar({ tipo: 'mesa' }, 'entregue'), false));
test('delivery entregue gera venda', () => {
  assert.equal(deveGerarVendaAoEntregar(delivery, 'entregue'), true);
  assert.equal(deveGerarVendaAoEntregar(delivery, 'preparo'), false);
});

test('venda online no formato v1', () => {
  const v = vendaDePedidoOnline(delivery, 123);
  assert.deepEqual(Object.keys(v).sort(), ['cliente', 'criadoEm', 'cupom', 'desconto', 'fiado', 'itens', 'pagamento', 'pagamentos',
    'pedidoOrigem', 'recebidoDinheiro', 'subtotal', 'total', 'troco'].sort());
  assert.deepEqual(v.pedidoOrigem, { pedidoId: 'p1', origem: 'delivery', numeroPedido: 7 });
  assert.equal(v.criadoEm, 123);
  assert.equal(v.recebidoDinheiro, 100);
  assert.equal(v.troco, 50);
  assert.equal(v.itens[0].observacao, 'sem cebola');
  assert.deepEqual(v.pagamentos, [{ forma: 'dinheiro', valor: 50 }]);
  assert.equal(v.fiado, false);
});

const mesa = { id: 'm1', nome: 'Comanda 11' };
const pm = (id, total, extra = {}) => ({ id, tipo: 'mesa', mesa: 'm1', total, itens: [{ nome: 'B', preco: total, qtd: 1 }], ...extra });

test('venda da mesa consolida', () => {
  const v = vendaDeFechamentoMesa(mesa, [pm('a', 20), pm('b', 30), pm('c', 99, { status: 'cancelado' })], 'pix', 5);
  assert.equal(v.total, 50);
  assert.equal(v.itens.length, 2);
  assert.equal(v.mesaFechamento.pedidoIds.length, 2);
  assert.equal(v.mesaFechamento.mesaNome, 'Comanda 11');
  assert.equal(v.cliente, 'Comanda 11');
  assert.equal(v.criadoEm, 5);
});

test('mesa ja fechada nao gera venda', () => {
  assert.deepEqual(pedidosParaFechar([pm('a', 1, { contaFechada: true }), pm('b', 1, { contaFechada: true })], 'm1'), []);
  assert.equal(pedidosParaFechar([pm('a', 1), pm('b', 1, { status: 'cancelado' }), { ...pm('c', 1), mesa: 'x' }], 'm1').length, 1);
});

test('sem undefined', () => {
  const achou = (o, caminho = '') => {
    if (o === undefined) throw new Error('undefined em ' + caminho);
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) achou(v, caminho + '.' + k);
  };
  achou(vendaDePedidoOnline({ id: 'z', tipo: 'retirada', itens: [{ nome: 'a', preco: 1, qtd: 1 }], total: 1 }, 1));
  achou(vendaDeFechamentoMesa({ id: 'm' }, [{ id: 'q', tipo: 'mesa', total: 1, itens: [{ nome: 'a', preco: 1, qtd: 1 }] }], 'pix', 1));
});

test('ids deterministicos de venda', () => {
  assert.equal(idVendaPedido({ id: 'p1' }), 'ped-p1');
  assert.equal(idVendaMesa(['b', 'a', 'c']), 'mesa-a');
  assert.equal(idVendaMesa(['c', 'a', 'b']), idVendaMesa(['a', 'b', 'c']));
});

test('idVendaFechamento: conjunto novo e sobra de tentativa anterior', () => {
  assert.equal(idVendaFechamento([{ id: 'c' }, { id: 'a' }, { id: 'b' }]), 'mesa-a');
  const com = [{ id: 'a' }, { id: 'b', vendaId: 'mesa-x' }, { id: 'c' }];
  assert.equal(idVendaFechamento(com), 'mesa-x');
  assert.equal(idVendaFechamento([...com].reverse()), 'mesa-x');
  assert.equal(idVendaFechamento([{ id: 'a' }, { id: 'b', vendaId: 'mesa-x', contaFechada: true }]), 'mesa-a');
});

test('cuponsAContar', () => {
  const r = cuponsAContar([{ id: 'a', cupom: 'X10' }, { id: 'b', cupom: 'Y', contabilizado: true }, { id: 'c', cupom: null }, { id: 'd' }, { id: 'e', cupom: '' }]);
  assert.deepEqual(r, [{ pedidoId: 'a', cupom: 'X10' }]);
});

// D2: venda segue a convenção V1 do item (preco base + adicionais à parte).
const itemV2 = { produtoId: '9', nome: 'X-Bacon', preco: 38, qtd: 2, obs: '', adicionais: [{ grupo: 'Extras', nome: 'Bacon', preco: 10 }] };
const itemV1 = { nome: 'X-Tudo', preco: 30, qtd: 1, variacao: null, observacao: 'bem passado', adicionais: [{ nome: 'Ovo', preco: 3, grupoId: 'g1' }] };

test('item v2 vira preco base na venda', () => {
  const v = vendaDePedidoOnline({ ...delivery, itens: [itemV2], subtotal: 76, total: 76 }, 1);
  assert.equal(v.itens[0].preco, 28);
  assert.deepEqual(v.itens[0].adicionais, [{ nome: 'Bacon', preco: 10, grupo: 'Extras' }]);
  assert.equal(v.itens[0].qtd, 2);
});

test('item v2 com adicional maior que o preco nao fica negativo', () => {
  const v = vendaDePedidoOnline({ ...delivery, itens: [{ ...itemV2, preco: 5 }] }, 1);
  assert.equal(v.itens[0].preco, 0);
});

test('item v1 copiado como esta', () => {
  const v = vendaDePedidoOnline({ ...delivery, itens: [itemV1] }, 1);
  assert.equal(v.itens[0].preco, 30);
  assert.deepEqual(v.itens[0].adicionais, [{ nome: 'Ovo', preco: 3, grupoId: 'g1' }]);
  assert.equal(v.itens[0].observacao, 'bem passado');
});

test('mesa mista v1 e v2', () => {
  const v = vendaDeFechamentoMesa(mesa, [pm('a', 33, { itens: [itemV1] }), pm('b', 76, { itens: [itemV2] })], 'pix', 1);
  assert.deepEqual(v.itens.map(i => i.preco), [30, 28]);
  assert.equal(v.total, 109);
});

test('mais vendidos da venda v2 soma 38 x qtd', () => {
  const v = vendaDePedidoOnline({ ...delivery, itens: [itemV2], subtotal: 76, total: 76 }, 1000);
  const r = resumoVendas([v], 0, Infinity);
  assert.equal(r.maisVendidos[0].valor, 76);
});

// R1: dentro da transação, os pedidos relidos decidem se a conta pode fechar.
import { podeFecharConta } from '../js/nucleo/vendas.js';

test('pode fechar conta com pedidos abertos', () => {
  assert.deepEqual(podeFecharConta([pm('a', 10), pm('b', 5, { status: 'entregue' })]), { ok: true, motivo: null });
});
test('nao fecha se algum pedido ja tem contaFechada', () => {
  const r = podeFecharConta([pm('a', 10), pm('b', 5, { contaFechada: true })]);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'Conta já fechada — atualize a tela');
});
test('nao fecha se algum pedido foi cancelado ou sumiu', () => {
  assert.equal(podeFecharConta([pm('a', 10, { status: 'cancelado' })]).ok, false);
  assert.equal(podeFecharConta([pm('a', 10), null]).ok, false);
  assert.equal(podeFecharConta([]).ok, false);
});

// M1: desconto dos pedidos aparece na venda da mesa.
test('venda da mesa leva o desconto dos pedidos', () => {
  const comCupom = pm('a', 45, { subtotal: 50, desconto: 5, cupom: 'DEZ' });
  const comFidel = pm('b', 20, { subtotal: 28, descontoFidelidade: 8 });
  const v = vendaDeFechamentoMesa(mesa, [comCupom, comFidel, pm('c', 30), pm('d', 99, { status: 'cancelado', desconto: 7 })], 'pix', 1);
  assert.equal(v.total, 95);
  assert.equal(v.desconto, 13);
  assert.equal(v.subtotal, 108);
});

// M2: item com produtoId é V2 (preco já com adicionais); sem produtoId é V1.
import { valorLinhaItem } from '../js/nucleo/pedidos.js';
test('item com produtoId e tratado como v2 na linha e na venda', () => {
  const v2 = { produtoId: 'p', nome: 'X', preco: 40, qtd: 1, adicionais: [{ nome: 'Ovo', preco: 4 }] };
  const v1 = { nome: 'X', preco: 36, qtd: 1, adicionais: [{ nome: 'Ovo', preco: 4 }] };
  assert.equal(valorLinhaItem(v2), 40);
  assert.equal(valorLinhaItem(v1), 40);
  const v = vendaDePedidoOnline({ ...delivery, itens: [v2, v1] }, 1);
  assert.deepEqual(v.itens.map(i => i.preco), [36, 36]);
});
