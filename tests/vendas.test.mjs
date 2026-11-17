import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idVendaFechamento, deveGerarVendaAoEntregar, vendaDePedidoOnline, vendaDeFechamentoMesa, pedidosParaFechar, idVendaPedido, idVendaMesa
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
