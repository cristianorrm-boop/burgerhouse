import test from 'node:test';
import assert from 'node:assert/strict';
import { taxaEntrega } from '../js/nucleo/entrega.js';
import { mesclarConfig } from '../js/utils.js';

// Taxa de entrega: com bairros ativos, o bairro é obrigatório e manda na taxa;
// sem bairros ativos (loja vinda da V1), endereço livre e taxa = config.taxaPadrao.

const bairros = [
  { id: 'c', nome: 'Centro', taxa: 5, ativo: true },
  { id: 'v', nome: 'Vila', taxa: 8 },
  { id: 'x', nome: 'Antigo', taxa: 99, ativo: false },
];

test('sem bairros usa taxaPadrao e nao exige bairro', () => {
  assert.deepEqual(taxaEntrega({ bairros: [], taxaPadrao: 7 }), { taxa: 7, exigeBairro: false, erro: null });
  assert.deepEqual(taxaEntrega({ taxaPadrao: '4.5' }), { taxa: 4.5, exigeBairro: false, erro: null });
});

test('sem bairros e sem taxaPadrao: taxa 0', () => {
  assert.deepEqual(taxaEntrega({ bairros: [] }), { taxa: 0, exigeBairro: false, erro: null });
  assert.equal(taxaEntrega({ bairros: [], taxaPadrao: 'abc' }).taxa, 0);
});

test('com bairros e nenhum escolhido: erro', () => {
  const r = taxaEntrega({ bairros, bairroId: '', taxaPadrao: 7 });
  assert.equal(r.exigeBairro, true);
  assert.equal(r.taxa, 0);
  assert.ok(r.erro);
});

test('com bairro escolhido: taxa do bairro', () => {
  assert.deepEqual(taxaEntrega({ bairros, bairroId: 'v', taxaPadrao: 7 }), { taxa: 8, exigeBairro: true, erro: null });
});

test('bairros inativos sao ignorados', () => {
  const soInativos = [{ id: 'x', nome: 'Antigo', taxa: 99, ativo: false }];
  assert.deepEqual(taxaEntrega({ bairros: soInativos, taxaPadrao: 6 }), { taxa: 6, exigeBairro: false, erro: null });
  const r = taxaEntrega({ bairros, bairroId: 'x', taxaPadrao: 7 });
  assert.equal(r.taxa, 0);
  assert.ok(r.erro);
});

test('config sem taxaPadrao vira 0', () => {
  assert.equal(mesclarConfig(null).taxaPadrao, 0);
  assert.equal(mesclarConfig({ nome: 'X' }).taxaPadrao, 0);
  assert.equal(mesclarConfig({ taxaPadrao: 6 }).taxaPadrao, 6);
});
