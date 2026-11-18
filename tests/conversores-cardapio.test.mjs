import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  converterProduto, converterCategoria, converterGrupoAdicional,
  converterConfig, converterCupom, converterMesa,
} from '../ferramentas/conversores.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');
const fx = JSON.parse(readFileSync(path.join(aqui, 'fixtures', 'cardapio-v1.json'), 'utf8')).colecoes;
const produtos = Object.values(fx.produtos);

test('x-bacon convertido', () => {
  const doc = produtos.find(p => p.id === 10);
  const { campos, avisos } = converterProduto(doc);
  assert.deepEqual(avisos, []);
  assert.equal(campos.categoriaId, 'lanches');
  assert.equal(campos.foto, '/assets/hamburgueria/x-bacon.jpeg');
  assert.deepEqual(campos.adicionais, ['Trsm6CCEesEcxp6eVQaj', 'uvdhZSamOqe63pXMj9QY']);
  assert.equal(campos.ordem, 10);
  assert.equal(campos.disponivel, true);
  assert.equal(campos.precoPromo, null);
  assert.equal(campos.emoji, '🍔');
  assert.equal(campos.upsell, false);
  assert.deepEqual(campos.selos, []);
});

test('bebida e sugestao', () => {
  const { campos } = converterProduto(produtos.find(p => p.id === 22));
  assert.equal(campos.upsell, true);
  assert.equal(campos.emoji, '🥤');
});

test('todos os 35 produtos tem foto existente', () => {
  assert.equal(produtos.length, 35);
  for (const p of produtos) {
    const { campos } = converterProduto(p);
    assert.ok(campos.foto.startsWith('/assets/'), campos.foto);
    assert.ok(existsSync(path.join(raiz, campos.foto)), campos.foto);
  }
});

test('produto sem imagem fica sem foto', () => {
  const { campos, avisos } = converterProduto({ categoria: 'lanches', nome: 'X' });
  assert.equal(campos.foto, '');
  assert.equal(avisos.length, 1);
  assert.equal(campos.ordem, 999);
  assert.deepEqual(campos.adicionais, []);
  assert.ok(!Object.values(campos).includes(undefined));
});

test('destaque vira selo', () => {
  const { campos } = converterProduto({ categoria: 'combos', nome: 'Y', destaque: true, imagem: './assets/a.png' });
  assert.deepEqual(campos.selos, ['Mais vendido']);
  assert.equal(campos.emoji, '🍱');
});

test('categoria converte', () => {
  const { campos, avisos } = converterCategoria(fx.categorias.lanches);
  assert.deepEqual(campos, { ativo: true, emoji: '🍔' });
  assert.deepEqual(avisos, []);
});

test('adicionais lanche', () => {
  const orig = fx.gruposAdicionais.Trsm6CCEesEcxp6eVQaj;
  const { campos } = converterGrupoAdicional(orig);
  assert.equal(campos.min, 0);
  assert.equal(campos.max, 5);
  assert.equal(campos.opcoes.length, 5);
  assert.deepEqual(campos.opcoes, orig.opcoes.map(o => ({ nome: o.nome, preco: o.preco })));
  assert.equal(campos.nome, orig.nome);
});

test('config burger house', () => {
  const { campos, avisos } = converterConfig(fx.configuracoes.geral);
  assert.deepEqual(avisos, []);
  assert.equal(campos.nome, 'Burger House');
  assert.equal(campos.logo, '/assets/logo-burger-house.png');
  assert.equal(campos.tema.primaria, '#d4af37');
  assert.equal(campos.tema.secundaria, '#1c1c1c');
  assert.equal(campos.tema.fundo, 'auto');
  assert.deepEqual(campos.horarios[3], { ativo: true, abre: '06:00', fecha: '23:00' });
  assert.equal(campos.horarios.length, 7);
  assert.equal(campos.whatsapp, '5534999999999');
  assert.equal(campos.corDestaque, '#e8a33d');
  assert.equal(campos.taxaPadrao, 0);
  assert.equal(campos.pausado, false);
  assert.ok(!Object.values(campos).includes(undefined));
});

test('cupom bemvindo10', () => {
  const { campos } = converterCupom(fx.cupons.BEMVINDO10);
  assert.equal(campos.minimo, 0);
  assert.equal(campos.validade, '');
  assert.equal(campos.limite, 0);
  assert.equal(campos.usos, 0);
  assert.equal(campos.descricao, '10% de desconto');
});

test('descricao de cupom por tipo', () => {
  assert.equal(converterCupom({ tipo: 'fixo', valor: 5 }).campos.descricao, 'R$ 5,00 de desconto');
  assert.equal(converterCupom({ tipo: 'frete', valor: 0 }).campos.descricao, 'Entrega grátis');
});

test('mesas numeradas pelo nome', () => {
  const usados = new Set();
  const numeros = [];
  for (const [id, doc] of Object.entries(fx.mesas)) {
    const { campos } = converterMesa(doc, usados);
    assert.equal(campos.ativa, true);
    assert.equal(campos.chamado, null);
    assert.equal(campos.chamadoEm, null);
    assert.ok(!('id' in campos));
    numeros.push(campos.numero);
    usados.add(campos.numero);
    assert.ok(id);
  }
  assert.equal(new Set(numeros).size, 15);
  assert.deepEqual([...numeros].sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1));
});

test('mesa sem numero ganha o proximo livre', () => {
  const { campos, avisos } = converterMesa({ nome: 'Balcão' }, new Set([1, 2]));
  assert.equal(campos.numero, 3);
  assert.equal(avisos.length, 1);
});
