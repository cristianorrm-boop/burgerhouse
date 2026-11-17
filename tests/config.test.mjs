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

test('nome padrao da loja e Burger House', () => {
  const u = ler('js/utils.js');
  assert.match(u, /CONFIG_PADRAO = \{\s*nome: 'Burger House'/);
  assert.ok(!u.includes("'Cardápio Online'"));
});

test('dados de exemplo so no demo', () => {
  const src = ler('js/admin/loja.js');
  const h2 = src.indexOf('<h2>Dados de exemplo</h2>');
  assert.ok(h2 > 0, 'card de exemplo existe');
  // o card inteiro so e renderizado quando DEMO e verdadeiro
  assert.match(src.slice(Math.max(0, h2 - 160), h2), /\$\{\s*DEMO\s*\?\s*`[^`]*$/, 'card dentro de ${DEMO ? `...`}');
  // os handlers nao podem existir sem o botao (ficam opcionais)
  assert.ok(!/querySelector\('\[data-seed(-cardapio)?\]'\)\.onclick/.test(src), 'handler de semear sem ?.');
  assert.equal((src.match(/semear\(/g) || []).length, 2);
  assert.equal((src.match(/querySelector\('\[data-seed(-cardapio)?\]'\)\?\.addEventListener\('click'/g) || []).length, 2);
});

test('todo semear() fora do seed esta sob guarda DEMO', () => {
  const arqs = [];
  const varrer = d => { for (const n of readdirSync(join(raiz, d))) { const q = join(d, n); if (statSync(join(raiz, q)).isDirectory()) varrer(q); else if (/\.js$/.test(n)) arqs.push(q); } };
  varrer('js');
  let chamadas = 0;
  for (const f of arqs) {
    if (f.replace(/[\\/]/g, '/') === 'js/seed.js') continue;
    const src = ler(f);
    for (const m of src.matchAll(/\bsemear\(/g)) {
      chamadas++;
      const antes = src.slice(Math.max(0, m.index - 250), m.index);
      assert.match(antes, /if \(DEMO\)|DEMO \?|if \(!DEMO\) return/, f + ': semear() sem guarda DEMO');
    }
  }
  assert.equal(chamadas, 5);
});
