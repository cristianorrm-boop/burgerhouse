import test from 'node:test';
import assert from 'node:assert/strict';
import { textoPagamento, payloadRecibo, linkRecibo } from '../js/nucleo/recibo.js';

const vendaComAdicional = {
  itens: [
    { nome: 'X-Bacon', preco: 28, qtd: 2, adicionais: [{ grupoNome: 'Extras', opcaoNome: 'Bacon', nome: 'Bacon', preco: 10 }], observacao: null },
    { nome: 'Açaí', preco: 12.5, qtd: 1, adicionais: [], observacao: null }
  ],
  subtotal: 88.5, desconto: 8.5, cupom: 'BEM10', total: 80, fiado: false,
  pagamentos: [{ forma: 'pix', valor: 30 }, { forma: 'credito', valor: 50 }], pagamento: 'Pix + Crédito',
  recebidoDinheiro: null, troco: null, cliente: 'João da Conceição', criadoEm: Date.UTC(2026, 10, 17, 15, 30)
};

function decodificar(link) {
  const hash = link.split('#')[1];
  return JSON.parse(Buffer.from(hash, 'base64').toString('utf8'));
}

test('linhas do recibo somam o subtotal', () => {
  const p = payloadRecibo(vendaComAdicional, 'Burger House');
  assert.deepEqual(p.itens[0], { n: 'X-Bacon', q: 2, p: 38 });
  const soma = p.itens.reduce((s, i) => s + i.q * i.p, 0);
  assert.equal(Math.round(soma * 100) / 100, p.subtotal);
});

test('link decodifica no formato do recibo.html', () => {
  const link = linkRecibo(vendaComAdicional, 'Burger House', 'https://loja.app');
  assert.ok(link.startsWith('https://loja.app/recibo.html#'));
  const p = decodificar(link);
  assert.deepEqual(Object.keys(p), ['loja', 'data', 'cliente', 'itens', 'subtotal', 'desconto', 'cupom', 'total',
    'pagamentos', 'recebido', 'troco', 'fiado', 'pago', 'deve']);
  assert.equal(p.cliente, 'João da Conceição');
  assert.equal(p.itens[1].n, 'Açaí');
  assert.equal(p.data, new Date(vendaComAdicional.criadoEm).toISOString());
  // mesma decodificação do recibo.html: atob + escape + decodeURIComponent
  const hash = link.split('#')[1];
  assert.equal(JSON.parse(decodeURIComponent(escape(atob(hash)))).cliente, 'João da Conceição');
});

test('texto de pagamento dividido', () => {
  assert.equal(textoPagamento(vendaComAdicional), 'Pix: R$ 30,00 + Crédito: R$ 50,00');
  assert.equal(textoPagamento({ pagamentos: [{ forma: 'dinheiro', valor: 12.5 }] }), 'Dinheiro: R$ 12,50');
});

test('fiado mostra pago e deve', () => {
  const v = { ...vendaComAdicional, fiado: true, valorPago: 30, total: 80, pagamentos: [], pagamento: 'Pagamento a Prazo' };
  assert.equal(textoPagamento(v), 'Pagamento a Prazo');
  const p = payloadRecibo(v, 'Loja');
  assert.equal(p.fiado, true);
  assert.equal(p.pago, 30);
  assert.equal(p.deve, 50);
  assert.deepEqual(p.pagamentos, []);
  assert.equal(payloadRecibo({ ...v, valorPago: 100 }, 'Loja').deve, 0);
});

test('venda antiga sem pagamentos usa o texto', () => {
  const v = { ...vendaComAdicional, pagamentos: [], pagamento: 'Pix' };
  assert.equal(textoPagamento(v), 'Pix');
  const p = payloadRecibo(v, 'Loja');
  assert.deepEqual(p.pagamentos, [{ forma: 'Pix', valor: 80 }]);
  assert.equal(textoPagamento({ pagamento: 'dinheiro' }), 'Dinheiro');
  assert.equal(textoPagamento({}), '–');
});
