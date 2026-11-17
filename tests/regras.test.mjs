import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ler = p => readFileSync(join(raiz, p), 'utf8');
const norm = s => s.replace(/\s+/g, ' ').trim();

// blocos "match /x/{doc} { ... }" de nivel unico (sem chaves aninhadas)
const blocos = t => [...t.matchAll(/match\s+\/[^\s{]+(?:\/\{[^}]+\})?\s*\{[^{}]*\}/g)].map(m => m[0]);

test('v1.rules e o bloco de docs/regras-v1.md', () => {
  const md = ler('docs/regras-v1.md');
  const bloco = md.match(/```\r?\n([\s\S]*?)\r?\n```/)[1];
  assert.equal(norm(ler('regras/v1.rules')), norm(bloco));
});

test('transicao preserva a v1', () => {
  const v1 = blocos(ler('regras/v1.rules'));
  assert.ok(v1.length >= 10);
  const t = norm(ler('regras/transicao.rules'));
  for (const b of v1) assert.ok(t.includes(norm(b)), b.slice(0, 40));
});

test('transicao abre as colecoes novas', () => {
  const t = ler('regras/transicao.rules');
  for (const c of ['config/{doc}', 'adicionais/{id}', 'bairros/{id}', 'fidelidade/{tel}', 'clientes/{tel}', 'contadores/pedidos', 'contas_pagar/{id}', 'contas_receber/{id}', 'equipe/{uid}'])
    assert.ok(t.includes('match /' + c), c);
  for (const f of ['logado', 'superadmin', 'equipe', 'dono', 'soMudou', 'cadastroValido'])
    assert.ok(t.includes('function ' + f + '('), f);
});

test('transicao nao muda colecoes compartilhadas', () => {
  const t = ler('regras/transicao.rules');
  const v1 = ler('regras/v1.rules');
  for (const c of ['produtos', 'categorias', 'cupons', 'mesas', 'pedidos']) {
    const re = new RegExp('match\\s+/' + c + '/', 'g');
    assert.equal((t.match(re) || []).length, 1, c);
    assert.equal(blocos(t).filter(b => b.startsWith('match /' + c + '/')).length, 1, c + ' V1');
    assert.ok(!/soMudou|equipe\(\)|dono\(\)/.test(blocos(t).find(b => b.startsWith('match /' + c + '/')) || ''), c + ' sem regra V2');
  }
  assert.equal((v1.match(/match\s+\/databases/g) || []).length, 1);
});

test('superadmin certo', () => {
  assert.ok(ler('regras/transicao.rules').includes("'admin@gmail.com'"));
});
