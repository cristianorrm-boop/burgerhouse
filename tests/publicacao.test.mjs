// O que vai ao ar na Vercel: funções da api, referências entre arquivos, pré-cache do SW, o que fica fora do deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ler = p => readFileSync(join(raiz, p), 'utf8');

test('funcoes da api carregam como na Vercel (CommonJS)', () => {
  for (const f of ['api/produto.js', 'api/imagem.js']) {
    const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(join(raiz, f))})`], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr.split('\n').find(l => /Error/.test(l))}`);
  }
});

function htmls(dir = '') {
  const out = [];
  for (const n of readdirSync(join(raiz, dir))) {
    const rel = dir ? join(dir, n) : n;
    if (['node_modules', '.git', '.superpowers', '.impeccable', 'docs', 'tests'].includes(n)) continue;
    if (statSync(join(raiz, rel)).isDirectory()) out.push(...htmls(rel));
    else if (n.endsWith('.html')) out.push(rel);
  }
  return out;
}

test('referencias locais dos html existem', () => {
  const faltando = [];
  for (const h of htmls()) {
    const base = dirname(h);
    for (const m of ler(h).matchAll(/\b(?:src|href)\s*=\s*["']([^"'#]+)["']/g)) {
      const u = m[1];
      if (/^(https?:|data:|mailto:|tel:|\/\/)/.test(u) || u.includes('${')) continue;
      let p = u.split('?')[0];
      p = p.startsWith('/') ? p.slice(1) : join(base, p);
      if (p === '' || p.endsWith('/')) p = join(p, 'index.html');
      if (!existsSync(join(raiz, p))) faltando.push(`${h}: ${u}`);
    }
  }
  assert.deepEqual(faltando, []);
});

test('pre-cache do SW so tem arquivos que existem', () => {
  const lista = ler('sw.js').match(/const ESSENCIAIS = \[([\s\S]*?)\];/)[1];
  const faltando = [...lista.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(u => {
    let p = u.split('?')[0].slice(1);
    if (p === '' || p.endsWith('/')) p += 'index.html';
    return !existsSync(join(raiz, p));
  });
  assert.deepEqual(faltando, []);
});

test('documentos e ferramentas nao vao ao ar', () => {
  const ign = ler('.vercelignore').split(/\r?\n/).map(l => l.trim());
  for (const x of ['docs/', 'tests/', 'scripts/', 'ferramentas/', 'package.json', 'README.md', 'firestore.rules']) assert.ok(ign.includes(x), x);
  assert.ok(!ign.some(l => l.startsWith('api')), 'api/ precisa ir ao ar');
});
