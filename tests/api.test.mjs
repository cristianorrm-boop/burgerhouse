import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

// As variáveis de ambiente são lidas no carregamento de api/_firestore.js.
process.env.FIREBASE_PROJECT_ID = 'projeto-teste';
process.env.FIREBASE_API_KEY = 'chave-teste';
const produto = require('../api/produto.js');
const imagem = require('../api/imagem.js');

const campos = foto => ({
  fields: {
    nome: { stringValue: 'X-Bacon' },
    preco: { integerValue: '28' },
    ...(foto === undefined ? {} : { foto: { stringValue: foto } }),
  },
});

function simularFirestore(foto) {
  globalThis.fetch = async url => ({
    ok: true,
    json: async () => (String(url).includes('/produtos/') ? campos(foto) : { fields: {} }),
  });
}

function resFalso() {
  const r = { headers: {}, status: 200, corpo: null, redirecionou: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.codigo = c; return r; };
  r.send = c => { r.corpo = c; return r; };
  r.redirect = (c, l) => { r.codigo = c; r.redirecionou = l; return r; };
  return r;
}

const reqFalso = () => ({ query: { id: 'abc123' }, headers: { host: 'loja.exemplo.com' } });

test('og usa foto do site', async () => {
  simularFirestore('/assets/hamburgueria/x-bacon.jpeg');
  const res = resFalso();
  await produto(reqFalso(), res);
  assert.equal(res.codigo, 200);
  assert.match(res.corpo, /og:image" content="https:\/\/loja\.exemplo\.com\/assets\/hamburgueria\/x-bacon\.jpeg"/);
});

test('og sem foto usa a imagem padrão e foto https é mantida', async () => {
  simularFirestore(undefined);
  let res = resFalso();
  await produto(reqFalso(), res);
  assert.match(res.corpo, /og:image" content="https:\/\/loja\.exemplo\.com\/assets\/og-image\.png"/);
  simularFirestore('https://cdn.exemplo.com/a.jpg');
  res = resFalso();
  await produto(reqFalso(), res);
  assert.match(res.corpo, /og:image" content="https:\/\/cdn\.exemplo\.com\/a\.jpg"/);
});

test('imagem redireciona para a foto do site', async () => {
  simularFirestore('/assets/hamburgueria/x-bacon.jpeg');
  const res = resFalso();
  await imagem(reqFalso(), res);
  assert.equal(res.codigo, 302);
  assert.equal(res.redirecionou, 'https://loja.exemplo.com/assets/hamburgueria/x-bacon.jpeg');
});

test('base64 continua funcionando', async () => {
  const b64 = Buffer.from('PNGDATA').toString('base64');
  const foto = `data:image/png;base64,${b64}`;
  simularFirestore(foto);
  let res = resFalso();
  await produto(reqFalso(), res);
  assert.match(res.corpo, /og:image" content="https:\/\/loja\.exemplo\.com\/api\/imagem\?id=abc123"/);
  res = resFalso();
  await imagem(reqFalso(), res);
  assert.equal(res.codigo, 200);
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert.equal(res.corpo.toString(), 'PNGDATA');
});
