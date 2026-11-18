import test from 'node:test';
import assert from 'node:assert/strict';
import { msDe, resumoVendas, caixaRecebido, fiadoEmAberto } from '../js/nucleo/faturamento.js';

const L = (a, m, d, h = 12) => new Date(a, m - 1, d, h).getTime();

test('aceita criadoEm timestamp date e numero', () => {
  const ms = L(2026, 11, 5);
  assert.equal(msDe(ms), ms);
  assert.equal(msDe(new Date(ms)), ms);
  assert.equal(msDe({ toMillis: () => ms }), ms);
  assert.equal(msDe({ seconds: Math.floor(ms / 1000) }), Math.floor(ms / 1000) * 1000);
  assert.equal(msDe(null), null);
});

test('fiado conta na data da venda no resumo', () => {
  const v = [{ id: 'a', criadoEm: L(2026, 11, 5), total: 300, fiado: true, valorPago: 0, pagamentos: [], itens: [] },
    { id: 'b', criadoEm: L(2026, 12, 5), total: 50, itens: [] }];
  const r = resumoVendas(v, L(2026, 11, 1, 0), L(2026, 12, 1, 0));
  assert.equal(r.faturamento, 300);
  assert.equal(r.quantidade, 1);
  assert.equal(r.ticketMedio, 300);
  assert.equal(r.porForma.fiado, 300);
});

test('caixa conta pagamento de fiado na data dele', () => {
  const v = [{ id: 'a', criadoEm: L(2026, 11, 5), total: 300, fiado: true, valorPago: 100, pagamentosFiado: [{ valor: 100, data: '2026-11-12' }] }];
  assert.equal(caixaRecebido(v, L(2026, 11, 1, 0), L(2026, 11, 11, 0)), 0);
  assert.equal(caixaRecebido(v, L(2026, 11, 11, 0), L(2026, 11, 21, 0)), 100);
  const n = [{ criadoEm: L(2026, 11, 15), total: 40 }];
  assert.equal(caixaRecebido([...v, ...n], L(2026, 11, 11, 0), L(2026, 11, 21, 0)), 140);
});

test('fiado quitado nao aparece em aberto', () => {
  const v = [
    { id: 'q', fiado: true, total: 100, valorPago: 100, criadoEm: 1 },
    { id: 'n', fiado: false, total: 100, criadoEm: 2 },
    { id: 'b', fiado: true, total: 100, valorPago: 40, cliente: 'Ana', criadoEm: 5 },
    { id: 'a', fiado: true, total: 80, criadoEm: 3 }
  ];
  const r = fiadoEmAberto(v);
  assert.deepEqual(r.map(x => x.id), ['a', 'b']);
  assert.equal(r[1].saldo, 60);
});

test('porForma soma duas formas', () => {
  const v = [{ criadoEm: 10, total: 50, pagamentos: [{ forma: 'Pix', valor: 20 }, { forma: 'dinheiro', valor: 30 }] }];
  const r = resumoVendas(v, 0, 100);
  assert.deepEqual(r.porForma, { pix: 20, dinheiro: 30 });
});

test('mais vendidos agrega por nome', () => {
  const v = [
    { criadoEm: 10, total: 0, itens: [{ nome: 'X', preco: 10, qtd: 2 }, { nome: 'Y', preco: 5, qtd: 1, adicionais: [{ preco: 2 }] }] },
    { criadoEm: 11, total: 0, itens: [{ nome: 'X', preco: 10, qtd: 1 }] }
  ];
  const r = resumoVendas(v, 0, 100);
  assert.deepEqual(r.maisVendidos, [{ nome: 'X', qtd: 3, valor: 30 }, { nome: 'Y', qtd: 1, valor: 7 }]);
});
