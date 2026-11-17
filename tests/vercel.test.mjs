import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const cabecalho = (fonte, chave) => v.headers.find(h => h.source === fonte)?.headers.find(x => x.key === chave)?.value;

test('html js e css sempre revalidam', () => {
  for (const f of [String.raw`/(.*)\.(html|js|css)`, '/', '/admin/', '/versao.json'])
    assert.equal(cabecalho(f, 'Cache-Control'), 'no-cache, must-revalidate', f);
});

test('sw nunca fica em cache', () => {
  assert.equal(cabecalho('/sw.js', 'Cache-Control'), 'no-cache, no-store, must-revalidate');
  assert.equal(cabecalho('/sw.js', 'Service-Worker-Allowed'), '/');
});

test('fotos com cache de 1 dia', () => {
  assert.equal(cabecalho(String.raw`/assets/(.*)\.(png|jpe?g|webp|avif|svg)`,'Cache-Control'), 'public, max-age=86400');
});

test('admin antigo redireciona para o novo', () => {
  assert.deepEqual(v.redirects, [{ source: '/admin.html', destination: '/admin/', permanent: false }]);
});

test('sem cleanUrls e com prévia de produto', () => {
  assert.ok(!('cleanUrls' in v));
  assert.ok(v.rewrites.some(r => r.source === '/p/:id' && r.destination === '/api/produto?id=:id'));
});
