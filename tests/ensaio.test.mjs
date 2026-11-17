import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { montarBancoDemo } from '../ferramentas/ensaio.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pasta = path.join(aqui, '..', 'backups');
const arquivos = existsSync(pasta)
  ? readdirSync(pasta).filter(f => /^backup-.*\.json$/.test(f)).sort()
  : [];
const ultimo = arquivos.at(-1);
const opcoes = ultimo ? {} : { skip: 'sem backup local em backups/' };
const backup = () => JSON.parse(readFileSync(path.join(pasta, ultimo), 'utf8'));

test('todas as colecoes presentes', opcoes, () => {
  const banco = montarBancoDemo(backup());
  for (const c of ['config', 'categorias', 'produtos', 'adicionais', 'mesas', 'cupons',
    'pedidos', 'vendas', 'equipe', 'contadores']) {
    assert.ok(banco[c] && typeof banco[c] === 'object', `falta ${c}`);
  }
  assert.ok(banco.config.loja);
  assert.equal(typeof banco.contadores.pedidos.n, 'number');
});

test('contagens preservadas', opcoes, () => {
  const b = backup();
  const banco = montarBancoDemo(b);
  const n = o => Object.keys(o || {}).length;
  for (const c of ['produtos', 'categorias', 'cupons', 'mesas', 'pedidos', 'vendas']) {
    assert.equal(n(banco[c]), n(b.colecoes[c]), c);
  }
  assert.equal(n(banco.adicionais), n(b.colecoes.gruposAdicionais));
});

test('sem timestamp', opcoes, () => {
  const texto = JSON.stringify(montarBancoDemo(backup()));
  assert.ok(!texto.includes('__tipo'));
  assert.ok(!texto.includes('"seconds"'));
});

test('nao altera a entrada e converte pedidos', opcoes, () => {
  const b = backup();
  const antes = JSON.stringify(b);
  const banco = montarBancoDemo(b);
  assert.equal(JSON.stringify(b), antes);
  const p = Object.values(banco.pedidos)[0];
  assert.equal(typeof p.criadoEm, 'number');
  assert.ok(['novo', 'preparo', 'pronto', 'entregue'].includes(p.status) || p.status);
});

test('backup sintetico minimo', () => {
  const b = { colecoes: {
    produtos: { a: { id: 1, nome: 'X', preco: 5, categoria: 'lanches', imagem: './img/x.jpg', ativo: true } },
    pedidos: { p1: { numeroPedido: 7, status: 'recebido', origem: 'mesa', criadoEm: { __tipo: 'ts', ms: 1000 }, itens: [] } },
    vendas: { v1: { criadoEm: { __tipo: 'ts', ms: 2000 } } },
    configuracoes: { geral: { nomeLoja: 'T' } },
  } };
  const banco = montarBancoDemo(b);
  assert.equal(banco.contadores.pedidos.n, 7);
  assert.equal(banco.pedidos.p1.status, 'novo');
  assert.equal(banco.pedidos.p1.criadoEm, 1000);
  assert.equal(banco.vendas.v1.criadoEm, 2000);
  assert.ok(!JSON.stringify(banco).includes('__tipo'));
});
