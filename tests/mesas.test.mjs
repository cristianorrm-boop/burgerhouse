import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { idMesaDoLink, nomeMesa, urlMesa, proximaMesa } from '../js/nucleo/mesas.js';

test('id do link e usado literalmente', () => {
  assert.equal(idMesaDoLink(' 0T0IAUJFCzRUchfFR7a3 '), '0T0IAUJFCzRUchfFR7a3');
  assert.equal(idMesaDoLink(''), null);
  assert.equal(idMesaDoLink(null), null);
});

test('nome da comanda', () => {
  assert.equal(nomeMesa({ nome: 'Comanda 11', numero: 11 }), 'Comanda 11');
  assert.equal(nomeMesa({ numero: 4 }), 'Mesa 4');
  assert.equal(nomeMesa({}), 'Mesa');
});

test('url igual ao qr impresso', () => {
  assert.equal(urlMesa('https://burgerhouse-nine.vercel.app', 'SfyFdUBaBRDchD1MlFFK'),
    'https://burgerhouse-nine.vercel.app/index.html?mesa=SfyFdUBaBRDchD1MlFFK');
});

test('proxima mesa', () => {
  const mesas = Array.from({ length: 15 }, (_, i) => ({ id: 'auto' + i, numero: i + 1 }));
  assert.deepEqual(proximaMesa(mesas), { id: '16', numero: 16 });
  assert.deepEqual(proximaMesa([...mesas, { id: '16', numero: 3 }]), { id: '16-2', numero: 16 });
  assert.deepEqual(proximaMesa([]), { id: '1', numero: 1 });
});

test('cliente nao limpa o id da mesa', () => {
  const src = readFileSync(new URL('../js/cliente.js', import.meta.url), 'utf8');
  assert.ok(!src.includes("soDigitos(q.get('mesa'))"));
  assert.ok(src.includes('idMesaDoLink'));
});
