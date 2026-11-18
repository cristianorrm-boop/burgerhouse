import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { rotuloPedido, mesaDoPedido, enderecoTexto, pagamentoRotulo, filtroHistorico } from '../js/nucleo/pedidos.js';

test('rotulo numerico', () => assert.equal(rotuloPedido({ numero: 12, id: 'abc' }), '#12'));
test('rotulo em codigo', () => assert.equal(rotuloPedido({ numero: 'JC2ZJ5UP', tipo: 'delivery' }), '#JC2ZJ5UP'));
test('rotulo de mesa antiga', () => {
  assert.equal(rotuloPedido({ numero: null, tipo: 'mesa', mesa: 'XT6iO2dCBe7bPruPk0v2', mesaNome: 'Mesa 2' }), 'Mesa 2');
  assert.equal(rotuloPedido({ numero: null, tipo: 'mesa', mesa: 'x' }, { x: { nome: 'Comanda 5' } }), 'Comanda 5');
  assert.equal(rotuloPedido({ numero: null, tipo: 'mesa', mesa: 'y' }), 'Mesa');
});
test('rotulo sem nada usa id', () => assert.equal(rotuloPedido({ id: 'abcdefgh', tipo: 'retirada' }), '#ABCDE'));
test('mesa do pedido', () => {
  assert.equal(mesaDoPedido({ mesa: 'x', mesaNome: 'Mesa 2' }), 'Mesa 2');
  assert.equal(mesaDoPedido({ mesa: 'x' }, { x: { numero: 4 } }), 'Mesa 4');
  assert.equal(mesaDoPedido({}), 'Mesa');
});
test('rotulo nunca tem null', () => {
  const estranhos = [{}, { numero: NaN }, { numero: 'null' }, { numero: 'undefined', id: 'zz' }, { numero: 0 }, { numero: -3, tipo: 'mesa' },
    { tipo: 'mesa', mesa: null, mesaNome: 'null' }, { numero: null, id: null }, null, undefined, { numero: ' ' }];
  for (const p of estranhos) assert.doesNotMatch(rotuloPedido(p), /null|undefined|NaN/i);
});
test('endereco antigo', () => {
  assert.equal(enderecoTexto({ texto: 'Rua A, 10', cep: '38400-000' }), 'Rua A, 10 · CEP 38400-000');
  assert.equal(enderecoTexto({ texto: 'Rua A, 10' }), 'Rua A, 10');
});
test('endereco v2', () => {
  assert.equal(enderecoTexto({ rua: 'Rua B', numero: '5', complemento: 'ap 2', bairro: 'Centro', referencia: 'perto' }),
    'Rua B, 5 - ap 2 · Centro (ref.: perto)');
  assert.equal(enderecoTexto(null), '');
  assert.equal(enderecoTexto({}), '');
});
test('pagamento em maiusculas', () => {
  assert.equal(pagamentoRotulo('PIX'), 'Pix');
  assert.equal(pagamentoRotulo('pix'), 'Pix');
  assert.equal(pagamentoRotulo('cheque'), 'cheque');
  assert.equal(pagamentoRotulo(''), '');
  assert.equal(pagamentoRotulo(undefined), '');
});
test('historico filtra e ordena', () => {
  const ps = [
    { id: 'a', criadoEm: 100, numero: 1, cliente: { nome: 'João' } },
    { id: 'b', criadoEm: 300, numero: null, tipo: 'mesa', mesaNome: 'Mesa 2', cliente: {} },
    { id: 'c', criadoEm: 200, numero: 3, cliente: { nome: 'Maria' } },
    { id: 'd', criadoEm: 400, numero: 4, cliente: { nome: 'Fora' } }
  ];
  assert.deepEqual(filtroHistorico(ps, { ini: 100, fim: 400 }).map(p => p.id), ['b', 'c', 'a']);
  assert.deepEqual(filtroHistorico(ps, { ini: 0, fim: 1000, busca: 'JOAO' }).map(p => p.id), ['a']);
  assert.deepEqual(filtroHistorico(ps, { ini: 0, fim: 1000, busca: 'mesa 2' }).map(p => p.id), ['b']);
});

function fontes(dir = new URL('../js/', import.meta.url)) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? fontes(new URL(e.name + '/', dir)) : e.name.endsWith('.js') ? [[e.name, readFileSync(new URL(e.name, dir), 'utf8')]] : []);
}
test('nenhum arquivo mostra numero ou mesa crus', () => {
  const proibidos = ['#${p.numero}', '#${d.numero}', "'Mesa ' + p.mesa", 'Mesa ${p.mesa}', 'Mesa ${d.mesa}', "' ' + p.mesa", '${p.mesa}', '${d.mesa}', 'esc(p.mesa)'];
  for (const [nome, src] of fontes())
    for (const t of proibidos) assert.ok(!src.includes(t), `${nome} contem ${t}`);
});

// D3: valor da linha do item nas duas convenções.
import { valorLinhaItem } from '../js/nucleo/pedidos.js';

test('linha de item v1 soma os adicionais', () => {
  assert.equal(valorLinhaItem({ nome: 'X', preco: 149.9, qtd: 1, adicionais: [{ nome: 'a', preco: 12 }, { nome: 'b', preco: 30 }] }), 191.9);
  assert.equal(valorLinhaItem({ nome: 'X', preco: 10, qtd: 3, adicionais: [{ nome: 'a', preco: 2.5 }] }), 37.5);
  assert.equal(valorLinhaItem({ nome: 'X', preco: 10, qtd: 2 }), 20);
});

test('linha de item v2 ja tem os adicionais no preco', () => {
  assert.equal(valorLinhaItem({ produtoId: '9', nome: 'X', preco: 38, qtd: 2, adicionais: [{ nome: 'Bacon', preco: 10 }] }), 76);
});

test('linha de item estranho nunca vira NaN', () => {
  assert.equal(valorLinhaItem({ nome: 'X', preco: 'abc', qtd: null, adicionais: [{ preco: null }] }), 0);
  assert.equal(valorLinhaItem(null), 0);
});

// I1: mudarStatus relê o pedido e decide aqui se age.
import { acaoDeStatus } from '../js/nucleo/pedidos.js';

test('mesmo status ignora (clique duplo em Finalizar)', () => {
  assert.equal(acaoDeStatus({ id: 'a', status: 'entregue' }, 'entregue'), 'ignorar');
  assert.equal(acaoDeStatus({ id: 'a', status: 'preparo' }, 'preparo'), 'ignorar');
});
test('avanco aplica', () => {
  assert.equal(acaoDeStatus({ id: 'a', status: 'pronto' }, 'entregue'), 'aplicar');
  assert.equal(acaoDeStatus({ id: 'a', status: 'novo' }, 'preparo'), 'aplicar');
  assert.equal(acaoDeStatus({ id: 'a', status: 'novo' }, 'cancelado'), 'aplicar');
});
test('pedido sumido ou encerrado ignora', () => {
  assert.equal(acaoDeStatus(null, 'entregue'), 'ignorar');
  assert.equal(acaoDeStatus({ id: 'a', status: 'cancelado' }, 'entregue'), 'ignorar');
  assert.equal(acaoDeStatus({ id: 'a', status: 'entregue' }, 'cancelado'), 'ignorar');
});
