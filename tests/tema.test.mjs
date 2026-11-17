import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corTextoSobre, contraste, ABAS_PADRAO_ATENDENTE } from '../js/nucleo/tema.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ler = p => readFileSync(join(raiz, p), 'utf8');

test('texto escuro sobre dourado e claro sobre preto', () => {
  assert.equal(corTextoSobre('#d4af37'), '#1C1C1C');
  assert.equal(corTextoSobre('#1c1c1c'), '#FFFFFF');
  assert.ok(contraste('#d4af37', corTextoSobre('#d4af37')) >= 4.5);
  assert.ok(contraste('#1c1c1c', corTextoSobre('#1c1c1c')) >= 4.5);
});

test('contraste preto no branco e 21', () => {
  assert.ok(Math.abs(contraste('#000000', '#ffffff') - 21) < 1e-9);
});

test('padrao do atendente', () => {
  assert.deepEqual(ABAS_PADRAO_ATENDENTE, ['pedidos', 'mesas', 'pdv']);
});

test('cardapio so do dono e atendente usa o padrao', () => {
  const app = ler('js/admin/app.js');
  assert.match(app, /cardapio:\s*\{[^}]*perfis:\s*\['dono'\]/);
  assert.match(app, /ABAS_PADRAO_ATENDENTE/);
});
