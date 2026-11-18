import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planejarLimpeza, conferirLimpeza } from '../ferramentas/limpeza.mjs';

const banco = () => ({
  produtos: { 10: { nome: 'X-Bacon' }, 11: { nome: 'X-Tudo' } },
  mesas: { SfyFdUBaBRDchD1MlFFK: { nome: 'Mesa 1' } },
  pedidos: { p1: { status: 'entregue' }, p2: { status: 'novo' } },
  vendas: { v1: { total: 10 }, 'pdv-abc': { total: 20 }, 'mesa-p1': { total: 30 } },
  cupons: { BEMVINDO10: { usos: 3, limite: 0 }, FRETE: { usos: 0 } }
});

// Aplica o plano em memória, como a ferramenta faz no Firestore.
function aplicar(atual, operacoes) {
  const novo = structuredClone(atual);
  for (const op of operacoes) {
    if (op.tipo === 'apagar') delete novo[op.colecao][op.id];
    if (op.tipo === 'zerarUsos') novo[op.colecao][op.id].usos = 0;
  }
  return novo;
}

test('apaga so pedidos e vendas', () => {
  const { operacoes, resumo } = planejarLimpeza(banco());
  const apagar = operacoes.filter(o => o.tipo === 'apagar');
  assert.deepEqual(new Set(apagar.map(o => o.colecao)), new Set(['pedidos', 'vendas']));
  assert.equal(apagar.length, 5);
  assert.deepEqual(resumo, { pedidos: 2, vendas: 3, cupons: 1 });
});

test('zera usos so de cupom usado', () => {
  const { operacoes } = planejarLimpeza(banco());
  const zerar = operacoes.filter(o => o.tipo === 'zerarUsos');
  assert.deepEqual(zerar, [{ colecao: 'cupons', id: 'BEMVINDO10', tipo: 'zerarUsos' }]);
});

test('trava recusa outra colecao', () => {
  assert.throws(() => conferirLimpeza([{ colecao: 'produtos', id: '10', tipo: 'apagar' }]), /produtos/);
  assert.throws(() => conferirLimpeza([{ colecao: 'mesas', id: 'x', tipo: 'apagar' }]), /mesas/);
  assert.throws(() => conferirLimpeza([{ colecao: 'pedidos', id: 'p1', tipo: 'zerarUsos' }]), /pedidos/);
  assert.throws(() => conferirLimpeza([{ colecao: 'cupons', id: 'X', tipo: 'apagar' }]), /cupons/);
  assert.doesNotThrow(() => conferirLimpeza(planejarLimpeza(banco()).operacoes));
});

test('segunda rodada vazia', () => {
  const atual = banco();
  const depois = aplicar(atual, planejarLimpeza(atual).operacoes);
  assert.equal(planejarLimpeza(depois).operacoes.length, 0);
  assert.equal(Object.keys(depois.produtos).length, 2);
  assert.equal(Object.keys(depois.mesas).length, 1);
});

test('colecoes ausentes nao quebram', () => {
  assert.deepEqual(planejarLimpeza({}), { operacoes: [], resumo: { pedidos: 0, vendas: 0, cupons: 0 } });
});
