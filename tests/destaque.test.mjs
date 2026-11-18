import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emDestaque } from '../js/nucleo/produtos.js';

test('produto marcado como destaque entra no carrossel', () => {
  assert.equal(emDestaque({ nome: 'X-Bacon', destaque: true }), true);
});

test('selos e promocao continuam valendo', () => {
  assert.equal(emDestaque({ selos: ['Mais vendido'] }), true);
  assert.equal(emDestaque({ precoPromo: 20, preco: 25 }), true);
});

test('sem destaque, selo nem promocao fica fora', () => {
  assert.equal(emDestaque({ nome: 'Água', destaque: false, selos: [] }), false);
  assert.equal(emDestaque({ nome: 'Água' }), false);
});

test('produto indisponivel nunca entra', () => {
  assert.equal(emDestaque({ destaque: true, disponivel: false }), false);
});

test('cadastro do produto tem a caixa Destaque e o cardapio usa a regra', () => {
  const cardapio = readFileSync(new URL('../js/admin/cardapio.js', import.meta.url), 'utf8');
  assert.match(cardapio, /name="destaque"/);
  assert.match(cardapio, /destaque: f\.destaque\.checked/);
  const cliente = readFileSync(new URL('../js/cliente.js', import.meta.url), 'utf8');
  assert.match(cliente, /filter\(emDestaque\)/);
});
