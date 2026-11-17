import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  converterUsuario, converterPedido, converterVenda, contadorInicial,
} from '../ferramentas/conversores.mjs';
import { desserializar } from '../ferramentas/serializar.mjs';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(raiz, 'backups');
const arquivos = existsSync(pasta)
  ? readdirSync(pasta).filter(f => /^backup-.*\.json$/.test(f)).sort()
  : [];

test('conversores rodam sobre o backup real mais recente', t => {
  if (!arquivos.length) { t.skip('sem backup em backups/'); return; }
  const col = desserializar(
    JSON.parse(readFileSync(path.join(pasta, arquivos[arquivos.length - 1]), 'utf8')), null,
  ).colecoes;
  const pedidos = Object.values(col.pedidos || {});
  const vendas = Object.values(col.vendas || {});
  const usuarios = Object.entries(col.usuarios || {});

  const contagem = new Map(); // aviso sem dados pessoais -> quantidade
  const anotar = avisos => {
    for (const a of avisos) {
      assert.ok(Array.isArray(avisos));
      const chave = a.replace(/"[^"]*"/g, '"…"').replace(/\b[A-Z0-9]{8}\b/g, '<codigo>')
        .replace(/Mesa \S+( \d+)?/g, 'Mesa').replace(/\d+/g, 'N');
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }
  };

  const ped = pedidos.map(d => converterPedido(d));
  const ven = vendas.map(d => converterVenda(d));
  const usu = usuarios.map(([id, d]) => converterUsuario(id, d));
  [...ped, ...ven, ...usu.filter(Boolean)].forEach(r => anotar(r.avisos));
  const cont = contadorInicial(pedidos);
  anotar(cont.avisos);

  assert.equal(ped.length, pedidos.length);
  assert.equal(ven.length, vendas.length);
  const soma = (docs, f) => docs.reduce((s, d) => s + (Number(f(d)) || 0), 0);
  for (const r of [...ped, ...ven]) assert.equal(typeof r.campos.criadoEm, 'number');
  // o documento final (original + patch) mantem a soma dos totais
  const mescla = (docs, rs) => docs.map((d, i) => ({ ...d, ...rs[i].campos }));
  assert.equal(soma(mescla(pedidos, ped), d => d.total), soma(pedidos, d => d.total));
  assert.equal(soma(mescla(vendas, ven), d => d.total), soma(vendas, d => d.total));

  console.log(`Backup ${arquivos[arquivos.length - 1]}: ${ped.length} pedidos, ${ven.length} vendas, ${usuarios.length} usuarios, contador ${cont.n}`);
  console.log(`Avisos: ${[...contagem.values()].reduce((a, b) => a + b, 0)}`);
  for (const [k, n] of contagem) console.log(`  ${n}x ${k}`);
});

test('plano do corte sobre o backup real: replanejar depois de aplicar da vazio', async t => {
  if (!arquivos.length) { t.skip('sem backup em backups/'); return; }
  const { planejarCorte } = await import('../ferramentas/plano.mjs');
  const col = desserializar(
    JSON.parse(readFileSync(path.join(pasta, arquivos[arquivos.length - 1]), 'utf8')), null,
  ).colecoes;
  const contar = ops => ops.reduce((c, o) => ({ ...c, [`${o.colecao}:${o.tipo}`]: (c[`${o.colecao}:${o.tipo}`] || 0) + 1 }), {});
  const primeiro = planejarCorte(col);
  const n = c => Object.keys(col[c] || {}).length;
  const conv = contar(primeiro.operacoes);
  assert.equal(conv['pedidos:converter'] || 0, n('pedidos'));
  assert.equal(conv['vendas:converter'] || 0, n('vendas'));
  // Aplica em memória (update = mescla rasa; criar = set) e replaneja.
  const depois = {};
  for (const [c, docs] of Object.entries(col)) depois[c] = Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, { ...d }]));
  for (const op of primeiro.operacoes) {
    depois[op.colecao] ??= {};
    depois[op.colecao][op.id] = { ...depois[op.colecao][op.id], ...op.campos };
  }
  const segundo = planejarCorte(depois);
  console.log(`Corte no backup real: ${JSON.stringify(conv)}; avisos ${primeiro.avisos.length}; replanejado: ${segundo.operacoes.length} operações`);
  assert.deepEqual(segundo.operacoes, []);
});
