// ferramentas/conferir-backup.mjs: sai 1 se uma coleção da V1 deu erro; confere contagens esperadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../ferramentas/conferir-backup.mjs', import.meta.url));

function rodar(backup, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'bh-backup-'));
  try {
    const arq = join(dir, 'b.json');
    writeFileSync(arq, JSON.stringify(backup));
    return spawnSync(process.execPath, [script, arq, ...args], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const base = () => ({ projeto: 'x', geradoEm: 0, colecoes: {
  produtos: { a: {}, b: {} }, categorias: { c: {} }, pedidos: {},
} });

test('backup bom sai 0 e imprime contagens', () => {
  const r = rodar(base());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /produtos\s+2/);
  assert.match(r.stdout, /categorias\s+1/);
});

test('erro em colecao da V1 sai 1 e ainda imprime as contagens', () => {
  const r = rodar({ ...base(), erros: { vendas: 'permission-denied' } });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /vendas\s+ERRO/);
  assert.match(r.stdout, /produtos\s+2/);
});

test('erro so em colecao nova da V2 avisa e sai 0', () => {
  const r = rodar({ ...base(), erros: { bairros: 'permission-denied' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /bairros\s+ERRO/);
});

test('--esperado confere as contagens', () => {
  assert.equal(rodar(base(), '--esperado', 'produtos=2,categorias=1').status, 0);
  const r = rodar(base(), '--esperado', 'produtos=35,categorias=1');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /produtos.*35/);
  assert.equal(rodar(base(), '--esperado', 'mesas=15').status, 1);
});

test('backup.html nao baixa com erro em colecao da V1', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(fileURLToPath(new URL('../ferramentas/backup.html', import.meta.url)), 'utf8');
  const i = html.indexOf('errosBloqueantes(erros)');
  assert.ok(i > 0, 'backup.html precisa usar errosBloqueantes');
  assert.ok(i < html.indexOf('createObjectURL'), 'a checagem vem antes do download');
});
