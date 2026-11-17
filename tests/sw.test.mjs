import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Carrega o sw.js (script clássico) num contexto isolado com um "self" falso.
function carregarSW({ fetch, match } = {}) {
  const ouvintes = {};
  const self = { addEventListener: (t, fn) => { ouvintes[t] = fn; }, skipWaiting() {}, clients: { claim() {} }, location: { origin: 'https://bh.test' } };
  const caches = { match: match || (async () => undefined), open: async () => ({ put() {}, addAll: async () => {} }), keys: async () => [], delete: async () => true };
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'),
    { self, caches, fetch: fetch || (async () => { throw new Error('offline'); }), module, URL, Promise, console });
  return { ...module.exports, ouvintes };
}
const O = 'https://bh.test';
const u = p => new URL(p, O);

test('ativacao apaga burger-house-shell-v2', () => {
  const { limparCaches } = carregarSW();
  assert.deepEqual(limparCaches(['burger-house-shell-v2', 'co-v11', 'bh-2.0.0-f1'], 'bh-2.0.0-f1'), ['burger-house-shell-v2', 'co-v11']);
});

test('js e css locais sao rede primeiro', () => {
  const { estrategia } = carregarSW();
  assert.equal(estrategia(u('/js/db.js?v=2.0.0-f1'), 'no-cors', O), 'rede-primeiro');
  assert.equal(estrategia(u('/css/base.css?v=2.0.0-f1'), 'no-cors', O), 'rede-primeiro');
  assert.equal(estrategia(u('/recibo.html'), 'no-cors', O), 'rede-primeiro');
});

test('navegacao com mesa e rede primeiro', () => {
  const { estrategia } = carregarSW();
  assert.equal(estrategia(u('/index.html?mesa=SfyFdUBaBRDchD1MlFFK'), 'navigate', O), 'rede-primeiro');
});

test('firestore e api sao ignorados', () => {
  const { estrategia } = carregarSW();
  for (const x of ['https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen', 'https://identitytoolkit.googleapis.com/v1/x', '/api/produto?id=10', '/p/10', '/versao.json'])
    assert.equal(estrategia(u(x), 'cors', O), 'ignorar', x);
});

test('foto de produto e sdk sao cache primeiro', () => {
  const { estrategia } = carregarSW();
  assert.equal(estrategia(u('/assets/hamburgueria/x-bacon.jpeg'), 'no-cors', O), 'cache-primeiro');
  assert.equal(estrategia(u('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'), 'cors', O), 'cache-primeiro');
  assert.equal(estrategia(u('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css'), 'cors', O), 'cache-primeiro');
});

test('navegacao offline cai no cache', async () => {
  const offline = { offline: true };
  const { ouvintes } = carregarSW({ match: async (req) => (String(req.url ?? req).endsWith('/offline.html') ? offline : undefined) });
  let resposta;
  ouvintes.fetch({ request: { method: 'GET', url: O + '/?mesa=5', mode: 'navigate' }, respondWith: p => { resposta = p; } });
  assert.equal(await resposta, offline);
});
