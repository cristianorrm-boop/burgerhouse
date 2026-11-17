import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializar, desserializar, COLECOES_V1, COLECOES_V2_NOVAS } from '../ferramentas/serializar.mjs';

test('timestamp vai e volta', () => {
  const ts = { toMillis: () => 1730000000000, seconds: 1730000000, nanoseconds: 0 };
  const j = serializar({ a: { b: [ts] } });
  assert.deepEqual(j, { a: { b: [{ __tipo: 'ts', ms: 1730000000000 }] } });
  const v = desserializar(j, null);
  assert.ok(v.a.b[0] instanceof Date);
  assert.equal(v.a.b[0].getTime(), 1730000000000);
});

test('desserializar com F usa Timestamp.fromMillis', () => {
  const F = { Timestamp: { fromMillis: ms => ({ fake: ms }) } };
  assert.deepEqual(desserializar({ t: { __tipo: 'ts', ms: 5 } }, F), { t: { fake: 5 } });
});

test('null e numeros preservados', () => {
  const o = { x: null, y: 0, z: '' };
  assert.deepEqual(desserializar(serializar(o), null), o);
});

test('listas de colecoes', () => {
  assert.equal(COLECOES_V1.length, 10);
  assert.equal(COLECOES_V2_NOVAS.length, 9);
});
