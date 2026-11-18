import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mesaLivrePara } from '../js/nucleo/mesas.js';

const ler = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('mesa sem celular dono fica livre para qualquer aparelho', () => {
  assert.equal(mesaLivrePara({ id: '3' }, 'aaa'), true);
  assert.equal(mesaLivrePara({ id: '3', dispositivo: null }, 'aaa'), true);
});

test('mesa aberta em um celular fica livre so para ele', () => {
  assert.equal(mesaLivrePara({ dispositivo: 'aaa' }, 'aaa'), true);
  assert.equal(mesaLivrePara({ dispositivo: 'aaa' }, 'bbb'), false);
});

test('cliente reserva a mesa antes de enviar o pedido', () => {
  const c = ler('js/cliente.js');
  assert.match(c, /await reservarMesa\(\)/);
  assert.match(c, /mesaLivrePara\(/);
});

test('fechar conta e liberar no painel apagam o celular dono', () => {
  const m = ler('js/admin/mesas.js');
  assert.match(m, /clienteAtual: null, dispositivo: null/);
  assert.match(m, /data-liberar/);
});

test('regra deixa o cliente so ocupar mesa livre (ou a propria)', () => {
  const r = ler('firestore.rules').replace(/\s+/g, ' ');
  assert.match(r, /soMudou\(\['dispositivo', 'dispositivoEm'\]\)/);
  assert.match(r, /resource\.data\.get\('dispositivo', null\) == null \|\| resource\.data\.dispositivo == request\.resource\.data\.dispositivo/);
});
