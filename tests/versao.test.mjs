import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarVersao, referenciasSemVersao } from '../scripts/versao.mjs';

const V = '2.0.0-f1';

test('acrescenta versao em import relativo', () => {
  assert.equal(aplicarVersao("import { db } from './db.js';", V), "import { db } from './db.js?v=2.0.0-f1';");
  assert.equal(aplicarVersao("import { x } from '../utils.js';", V), "import { x } from '../utils.js?v=2.0.0-f1';");
  assert.equal(aplicarVersao("const m = await import('./seed.js');", V), "const m = await import('./seed.js?v=2.0.0-f1');");
});

test('troca versao antiga', () => {
  assert.equal(aplicarVersao('<script type="module" src="/js/cliente.js?v=1.9"></script>', V),
    '<script type="module" src="/js/cliente.js?v=2.0.0-f1"></script>');
  assert.equal(aplicarVersao('<link rel="stylesheet" href="/css/base.css">', V),
    '<link rel="stylesheet" href="/css/base.css?v=2.0.0-f1">');
});

test('nao toca em CDN', () => {
  const t = 'import(`${FIREBASE_SDK}/firebase-app.js`); <link href="https://cdn.jsdelivr.net/x.css"> <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>';
  assert.equal(aplicarVersao(t, V), t);
});

test('nao toca em imagem nem manifest', () => {
  const t = '<link rel="manifest" href="/manifest.json"><img src="/assets/x.png"><link rel="icon" href="/assets/icon.svg">';
  assert.equal(aplicarVersao(t, V), t);
});

test('idempotente', () => {
  const t = "import { db } from './db.js';\n<script src=\"/js/a.js\"></script>";
  assert.equal(aplicarVersao(aplicarVersao(t, V), V), aplicarVersao(t, V));
});

test('--check falha com import sem versao', () => {
  assert.deepEqual(referenciasSemVersao("import a from './a.js'", V), ['./a.js']);
  assert.deepEqual(referenciasSemVersao("import a from './a.js?v=1.0'", V), ['./a.js?v=1.0']);
  assert.deepEqual(referenciasSemVersao("import a from './a.js?v=2.0.0-f1'", V), []);
});
