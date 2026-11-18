import test from 'node:test';
import assert from 'node:assert/strict';
import { saldoFiado, quitado, aplicarPagamentoFiado, filtrarFiados } from '../js/nucleo/fiado.js';

const venda = (o = {}) => ({ id: 'a', fiado: true, total: 50, valorPago: 0, pagamentosFiado: [], criadoEm: 1000, ...o });

test('pagamento parcial', () => {
  const r = aplicarPagamentoFiado(venda(), 20, '2026-11-17');
  assert.equal(r.valorPago, 20);
  assert.equal(r.aplicado, 20);
  assert.equal(r.quitado, false);
  assert.deepEqual(r.pagamentosFiado, [{ valor: 20, data: '2026-11-17' }]);
});

test('pagamento maior que o saldo aplica so o saldo', () => {
  const v = venda({ valorPago: 20, pagamentosFiado: [{ valor: 20, data: '2026-11-16' }] });
  const r = aplicarPagamentoFiado(v, 40, '2026-11-17');
  assert.equal(r.aplicado, 30);
  assert.equal(r.valorPago, 50);
  assert.equal(r.quitado, true);
  assert.equal(r.pagamentosFiado.length, 2);
  assert.deepEqual(r.pagamentosFiado[1], { valor: 30, data: '2026-11-17' });
  assert.equal(v.pagamentosFiado.length, 1); // não altera a venda original
});

test('quita com centavos de arredondamento', () => {
  assert.equal(quitado(venda({ total: 10, valorPago: 9.996 })), true);
  assert.equal(quitado(venda({ total: 10, valorPago: 9.99 })), false);
  assert.equal(saldoFiado(venda({ total: 10, valorPago: 12 })), 0);
  assert.equal(saldoFiado(venda({ total: 0.3, valorPago: 0.1 })), 0.2);
  const r = aplicarPagamentoFiado(venda({ total: 10, valorPago: 9.996 }), 5, '2026-11-17');
  assert.ok(r.erro);
});

test('valor invalido e sem data', () => {
  assert.equal(aplicarPagamentoFiado(venda(), 0, '2026-11-17').erro, 'Informe um valor de pagamento válido.');
  assert.equal(aplicarPagamentoFiado(venda(), -3, '2026-11-17').erro, 'Informe um valor de pagamento válido.');
  assert.equal(aplicarPagamentoFiado(venda(), NaN, '2026-11-17').erro, 'Informe um valor de pagamento válido.');
  assert.equal(aplicarPagamentoFiado(venda(), 5, '').erro, 'Informe a data do pagamento.');
  assert.equal(aplicarPagamentoFiado(venda({ valorPago: 50 }), 5, '2026-11-17').erro, 'Esta venda já está quitada.');
  assert.equal(aplicarPagamentoFiado(null, 5, '2026-11-17').erro, 'Venda não encontrada.');
});

test('filtros', () => {
  const l = [
    venda({ id: '1', criadoEm: 1000 }),
    venda({ id: '2', criadoEm: 3000, valorPago: 50 }),
    venda({ id: '3', criadoEm: { seconds: 2, nanoseconds: 0 } }),
    { id: '4', fiado: false, total: 9, criadoEm: 9000 }
  ];
  assert.deepEqual(filtrarFiados(l, 'todos').map(v => v.id), ['2', '3', '1']);
  assert.deepEqual(filtrarFiados(l, 'aberto').map(v => v.id), ['3', '1']);
  assert.deepEqual(filtrarFiados(l, 'quitado').map(v => v.id), ['2']);
});
