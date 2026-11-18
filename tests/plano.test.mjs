import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { planejarAditivos } from '../ferramentas/plano.mjs';
import { desserializar } from '../ferramentas/serializar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fixture = () => desserializar(
  JSON.parse(readFileSync(path.join(aqui, 'fixtures', 'cardapio-v1.json'), 'utf8')), null,
).colecoes;

// Usuários inventados: dois ativos e um inativo.
const USUARIOS = {
  uDono: { nome: 'Dona Teste', email: 'dona@teste.com', perfil: 'dono', ativo: true, criadoEm: new Date(1790000000000) },
  uGarcom: { nome: 'Garcom Teste', email: 'garcom@teste.com', perfil: 'garcom', ativo: true },
  uInativo: { nome: 'Saiu', email: 'saiu@teste.com', perfil: 'garcom', ativo: false },
};

function entrada() {
  return { ...fixture(), usuarios: structuredClone(USUARIOS) };
}

function contar(operacoes) {
  const c = {};
  for (const op of operacoes) {
    const k = `${op.colecao}:${op.tipo}`;
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

// Aplica as operações em memória como o Firestore faria (update = mescla rasa; set = cria).
function aplicar(atual, operacoes) {
  const novo = structuredClone(atual);
  for (const op of operacoes) {
    novo[op.colecao] ??= {};
    if (op.tipo === 'completar') {
      assert.ok(novo[op.colecao][op.id], `completar em doc inexistente ${op.colecao}/${op.id}`);
      Object.assign(novo[op.colecao][op.id], structuredClone(op.campos));
    } else {
      assert.ok(!novo[op.colecao][op.id], `criar em doc existente ${op.colecao}/${op.id}`);
      novo[op.colecao][op.id] = structuredClone(op.campos);
    }
  }
  return novo;
}

test('primeira rodada', () => {
  const { operacoes, avisos } = planejarAditivos(entrada());
  assert.deepEqual(contar(operacoes), {
    'produtos:completar': 35,
    'categorias:completar': 5,
    'mesas:completar': 15,
    'cupons:completar': 1,
    'config:criar': 1,
    'adicionais:criar': 5,
    'equipe:criar': 2,
  });
  assert.ok(Array.isArray(avisos));
  const loja = operacoes.find(o => o.colecao === 'config');
  assert.equal(loja.id, 'loja');
  const equipe = operacoes.filter(o => o.colecao === 'equipe').map(o => o.id).sort();
  assert.deepEqual(equipe, ['uDono', 'uGarcom']);
  const garcom = operacoes.find(o => o.id === 'uGarcom');
  assert.equal(garcom.campos.perfil, 'atendente');
  // Mesas recebem números distintos.
  const numeros = operacoes.filter(o => o.colecao === 'mesas').map(o => o.campos.numero);
  assert.equal(new Set(numeros).size, 15);
});

test('plano e idempotente', () => {
  const atual = entrada();
  const { operacoes } = planejarAditivos(atual);
  const depois = aplicar(atual, operacoes);
  const segundo = planejarAditivos(depois);
  assert.deepEqual(segundo.operacoes, []);
  assert.deepEqual(segundo.avisos, []);
});

test('nao sobrescreve campo v2 existente', () => {
  const atual = entrada();
  const [id, doc] = Object.entries(atual.produtos).find(([, p]) => p.id === 10);
  doc.foto = '/assets/outra.jpg';
  const { operacoes } = planejarAditivos(atual);
  const op = operacoes.find(o => o.colecao === 'produtos' && o.id === id);
  assert.equal(op.tipo, 'completar');
  assert.ok(!('foto' in op.campos));
  for (const k of ['categoriaId', 'adicionais', 'ordem', 'disponivel', 'precoPromo', 'selos', 'emoji', 'upsell']) {
    assert.ok(k in op.campos, `faltou ${k}`);
  }
});

test('campo presente com null ou vazio conta como presente', () => {
  const atual = entrada();
  const [id, doc] = Object.entries(atual.produtos)[0];
  doc.precoPromo = null;
  doc.foto = '';
  const op = planejarAditivos(atual).operacoes.find(o => o.colecao === 'produtos' && o.id === id);
  assert.ok(!('precoPromo' in op.campos));
  assert.ok(!('foto' in op.campos));
});

test('doc sem campo faltando nao gera operacao; destino existente nao e recriado', () => {
  const atual = entrada();
  const primeira = planejarAditivos(atual).operacoes;
  const depois = aplicar(atual, primeira);
  delete depois.mesas[Object.keys(depois.mesas)[0]].chamado;
  depois.config.loja = { nome: 'outra coisa' };
  const { operacoes } = planejarAditivos(depois);
  assert.equal(operacoes.length, 1);
  assert.deepEqual(operacoes[0].campos, { chamado: null });
});

test('nao toca em campo v1', () => {
  const atual = entrada();
  atual.pedidos = { p1: { status: 'recebido', itens: [] } };
  atual.vendas = { v1: { total: 10 } };
  const { operacoes } = planejarAditivos(atual);
  const proibidos = {
    produtos: ['categoria', 'imagem', 'adicionaisGrupos', 'ativo', 'preco', 'nome'],
    mesas: ['nome', 'ativo'],
  };
  const permitidas = ['produtos', 'categorias', 'mesas', 'cupons', 'config', 'adicionais', 'equipe'];
  for (const op of operacoes) {
    assert.ok(permitidas.includes(op.colecao), `coleção proibida ${op.colecao}`);
    for (const k of proibidos[op.colecao] || []) {
      assert.ok(!(k in op.campos), `${op.colecao}/${op.id} contém ${k}`);
    }
    if (op.tipo === 'completar') {
      assert.ok(['produtos', 'categorias', 'mesas', 'cupons'].includes(op.colecao));
    } else {
      assert.ok(['config', 'adicionais', 'equipe'].includes(op.colecao));
    }
  }
  assert.ok(!operacoes.some(o => ['pedidos', 'vendas', 'usuarios', 'gruposAdicionais', 'configuracoes'].includes(o.colecao)));
});

test('ordem das mesas e estavel entre rodadas', () => {
  const a = planejarAditivos(entrada()).operacoes.filter(o => o.colecao === 'mesas');
  // Mesma entrada com as chaves em outra ordem.
  const inv = entrada();
  inv.mesas = Object.fromEntries(Object.entries(inv.mesas).reverse());
  const b = planejarAditivos(inv).operacoes.filter(o => o.colecao === 'mesas');
  const porId = ops => Object.fromEntries(ops.map(o => [o.id, o.campos.numero]));
  assert.deepEqual(porId(a), porId(b));
  assert.deepEqual(a.map(o => o.id), b.map(o => o.id));
});

test('mesa ja numerada reserva seu numero', () => {
  const atual = entrada();
  const [idM6] = Object.entries(atual.mesas).find(([, m]) => m.nome === 'Mesa 6');
  const [idM1] = Object.entries(atual.mesas).find(([, m]) => m.nome === 'Mesa 1');
  atual.mesas[idM1].numero = 6; // Mesa 1 já tem número 6 salvo
  const { operacoes, avisos } = planejarAditivos(atual);
  const m1 = operacoes.find(o => o.id === idM1);
  assert.ok(!('numero' in m1.campos));
  const m6 = operacoes.find(o => o.id === idM6);
  assert.notEqual(m6.campos.numero, 6);
  assert.ok(avisos.some(a => a.includes('Mesa 6')));
});
