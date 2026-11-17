import test from 'node:test';
import assert from 'node:assert/strict';
import { comId } from '../js/nucleo/documento.js';

// Documento lido do banco: o id do documento vale mais que um campo "id" gravado dentro dele
// (produtos da V1 guardam id numérico: o doc "9" tem { id: 9 }).

test('id do documento vence o campo id numerico da V1', () => {
  const p = comId('9', { id: 9, nome: 'X-Burger', preco: 25 });
  assert.equal(p.id, '9');
  assert.equal(p.nome, 'X-Burger');
  assert.equal(p.preco, 25);
});

test('documento sem campo id ganha o id do documento', () => {
  assert.deepEqual(comId('abc', { nome: 'Mesa 1' }), { nome: 'Mesa 1', id: 'abc' });
});

test('nao altera os dados recebidos', () => {
  const d = { id: 3, nome: 'Y' };
  comId('3', d);
  assert.deepEqual(d, { id: 3, nome: 'Y' });
});
