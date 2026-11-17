import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ler = p => readFileSync(join(raiz, p), 'utf8');

test('config aponta para moda-63d8d', () => {
  const c = ler('js/config.js');
  assert.match(c, /projectId:\s*"moda-63d8d"/);
  assert.match(c, /SUPERADMIN_EMAIL\s*=\s*"admin@gmail\.com"/);
});

test('regras usam o mesmo superadmin', () => {
  const r = ler('firestore.rules');
  assert.ok(r.includes("'admin@gmail.com'"));
  assert.ok(!r.includes('rasistema25'));
});

test('nenhum arquivo cita o projeto do colega', () => {
  const achados = [];
  const varrer = (dir, recursivo) => {
    const abs = join(raiz, dir);
    if (!existsSync(abs)) return;
    for (const n of readdirSync(abs)) {
      const p = join(dir, n), s = statSync(join(raiz, p));
      if (s.isDirectory()) { if (recursivo) varrer(p, true); continue; }
      if (!/\.(js|mjs|html|json|rules|txt|xml)$/.test(n)) continue;
      if (ler(p).includes('cardapio-oline50k')) achados.push(p);
    }
  };
  varrer('.', false);
  for (const d of ['js', 'api', 'admin']) varrer(d, true);
  assert.deepEqual(achados, []);
});
