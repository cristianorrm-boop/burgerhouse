import test from 'node:test';
import assert from 'node:assert/strict';
import { periodoRelatorio, diasDoMes, resumoRelatorio, totaisPorDia, csvRelatorio, origemVenda } from '../js/nucleo/relatorio.js';

const local = (a, m, d, h = 12, mi = 0) => new Date(a, m - 1, d, h, mi).getTime();

test('periodo do mes e do dia', () => {
  assert.equal(diasDoMes('2028-02'), 29);
  assert.equal(diasDoMes('2027-02'), 28);
  assert.deepEqual(periodoRelatorio('2028-02', null), { ini: new Date(2028, 1, 1).getTime(), fim: new Date(2028, 2, 1).getTime() });
  assert.deepEqual(periodoRelatorio('2028-02', 29), { ini: new Date(2028, 1, 29).getTime(), fim: new Date(2028, 2, 1).getTime() });
  assert.deepEqual(periodoRelatorio('2026-12', 31), { ini: new Date(2026, 11, 31).getTime(), fim: new Date(2027, 0, 1).getTime() });
});

test('resumo inclui fiado', () => {
  const r = resumoRelatorio([{ total: 40 }, { total: 20, fiado: true, valorPago: 0 }, { total: '10.5' }]);
  assert.deepEqual(r, { quantidade: 3, faturamento: 70.5, ticket: 23.5 });
  assert.deepEqual(resumoRelatorio([]), { quantidade: 0, faturamento: 0, ticket: 0 });
});

test('totais por dia', () => {
  const t = totaisPorDia([
    { total: 10, criadoEm: local(2028, 2, 1) }, { total: 5, criadoEm: local(2028, 2, 1, 23, 59) },
    { total: 7, criadoEm: local(2028, 2, 29) }, { total: 99, criadoEm: null }
  ], '2028-02');
  assert.equal(t.length, 29);
  assert.equal(t[0], 15);
  assert.equal(t[28], 7);
  assert.equal(t.reduce((s, x) => s + x, 0), 22);
});

test('csv com aspas e acentos', () => {
  const csv = csvRelatorio([{
    itens: [{ nome: 'X-Bacon "Duplo"', preco: 28, qtd: 2, adicionais: [] }, { nome: 'Coca', preco: 6, qtd: 1, adicionais: [] }],
    cliente: 'João; da Conceição', cupom: 'BEM10', subtotal: 62, desconto: 6.2, total: 55.8, fiado: false,
    pagamentos: [{ forma: 'pix', valor: 55.8 }], criadoEm: local(2026, 11, 17, 9, 5)
  }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const [cab, linha] = csv.slice(1).split('\r\n');
  assert.equal(cab, 'Data;Hora;Cliente;Itens;Pagamento;Cupom;Subtotal;Desconto;Total');
  assert.equal(linha, '"17/11/2026";"09:05";"João; da Conceição";"2x X-Bacon ""Duplo"" | 1x Coca";"Pix: R$ 55,80";"BEM10";"62.00";"6.20";"55.80"');
});

test('relatorio aceita venda antiga da v1', () => {
  const v1 = {
    itens: [{ nome: 'X-Tudo', preco: 20, qtd: 1, adicionais: [{ opcaoNome: 'Bacon', preco: 3 }] }],
    pagamento: 'Pix', total: 23, criadoEm: { seconds: Math.floor(local(2026, 10, 5) / 1000) },
    pedidoOrigem: { origem: 'delivery' }
  };
  assert.deepEqual(resumoRelatorio([v1]), { quantidade: 1, faturamento: 23, ticket: 23 });
  assert.equal(totaisPorDia([v1], '2026-10')[4], 23);
  const linha = csvRelatorio([v1]).split('\r\n')[1];
  assert.ok(linha.startsWith('"05/10/2026";"12:00";"";"1x X-Tudo";"Pix";""'));
  assert.deepEqual(origemVenda(v1), { tipo: 'online', rotulo: 'Online · Entrega' });
});

test('origem da venda', () => {
  assert.deepEqual(origemVenda({ pedidoOrigem: { origem: 'retirada' } }), { tipo: 'online', rotulo: 'Online · Retirada' });
  assert.deepEqual(origemVenda({ mesaFechamento: { mesaNome: 'Mesa 3' } }), { tipo: 'mesa', rotulo: 'Mesa 3' });
  assert.deepEqual(origemVenda({ mesaFechamento: {} }), { tipo: 'mesa', rotulo: 'Mesa' });
  assert.deepEqual(origemVenda({}), { tipo: 'pdv', rotulo: '' });
});
