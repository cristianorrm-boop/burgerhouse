import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { montarBancoDemo } from '../ferramentas/ensaio.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pasta = path.join(aqui, '..', 'backups');
const arquivos = existsSync(pasta)
  ? readdirSync(pasta).filter(f => /^backup-.*\.json$/.test(f)).sort()
  : [];
const ultimo = arquivos.at(-1);
const opcoes = ultimo ? {} : { skip: 'sem backup local em backups/' };
const backup = () => JSON.parse(readFileSync(path.join(pasta, ultimo), 'utf8'));

test('todas as colecoes presentes', opcoes, () => {
  const banco = montarBancoDemo(backup());
  for (const c of ['config', 'categorias', 'produtos', 'adicionais', 'mesas', 'cupons',
    'pedidos', 'vendas', 'equipe', 'contadores']) {
    assert.ok(banco[c] && typeof banco[c] === 'object', `falta ${c}`);
  }
  assert.ok(banco.config.loja);
  assert.equal(typeof banco.contadores.pedidos.n, 'number');
});

test('contagens preservadas', opcoes, () => {
  const b = backup();
  const banco = montarBancoDemo(b);
  const n = o => Object.keys(o || {}).length;
  for (const c of ['produtos', 'categorias', 'cupons', 'mesas', 'pedidos', 'vendas']) {
    assert.equal(n(banco[c]), n(b.colecoes[c]), c);
  }
  assert.equal(n(banco.adicionais), n(b.colecoes.gruposAdicionais));
});

test('sem timestamp', opcoes, () => {
  const texto = JSON.stringify(montarBancoDemo(backup()));
  assert.ok(!texto.includes('__tipo'));
  assert.ok(!texto.includes('"seconds"'));
});

test('nao altera a entrada e converte pedidos', opcoes, () => {
  const b = backup();
  const antes = JSON.stringify(b);
  const banco = montarBancoDemo(b);
  assert.equal(JSON.stringify(b), antes);
  const p = Object.values(banco.pedidos)[0];
  assert.equal(typeof p.criadoEm, 'number');
  assert.ok(['novo', 'preparo', 'pronto', 'entregue'].includes(p.status) || p.status);
});

test('backup sintetico minimo', () => {
  const b = { colecoes: {
    produtos: { a: { id: 1, nome: 'X', preco: 5, categoria: 'lanches', imagem: './img/x.jpg', ativo: true } },
    pedidos: { p1: { numeroPedido: 7, status: 'recebido', origem: 'mesa', criadoEm: { __tipo: 'ts', ms: 1000 }, itens: [] } },
    vendas: { v1: { criadoEm: { __tipo: 'ts', ms: 2000 } } },
    configuracoes: { geral: { nomeLoja: 'T' } },
  } };
  const banco = montarBancoDemo(b);
  assert.equal(banco.contadores.pedidos.n, 7);
  assert.equal(banco.pedidos.p1.status, 'novo');
  assert.equal(banco.pedidos.p1.criadoEm, 1000);
  assert.equal(banco.vendas.v1.criadoEm, 2000);
  assert.ok(!JSON.stringify(banco).includes('__tipo'));
});

const minimo = () => ({ colecoes: {
  produtos: { a: { id: 1, nome: 'X', preco: 5, categoria: 'lanches', imagem: './img/x.jpg', ativo: true } },
  configuracoes: { geral: { nomeLoja: 'T' } },
} });

test('ensaio usa o plano do corte: pedido da v2 intacto', () => {
  const b = minimo();
  const nativo = { status: 'preparo', tipo: 'delivery', mesa: null, numero: 21, taxa: 6,
    pagamento: { forma: 'pix', troco: null }, criadoEm: 1790020000000,
    itens: [{ produtoId: 'a', nome: 'X', qtd: 1, preco: 5, adicionais: [], obs: 'sem sal' }],
    historico: [{ status: 'novo', em: 1790020000000 }, { status: 'preparo', em: 1790020100000 }] };
  b.colecoes.pedidos = { n1: nativo };
  b.colecoes.contadores = { pedidos: { n: 21 } };
  const banco = montarBancoDemo(b);
  assert.deepEqual(banco.pedidos.n1, nativo);
  assert.deepEqual(banco.contadores.pedidos, { n: 21 });
});

test('backup malformado falha alto', () => {
  assert.throws(() => montarBancoDemo({}), /colecoes/);
  assert.throws(() => montarBancoDemo({ produtos: minimo().colecoes.produtos }), /colecoes/);
  assert.throws(() => montarBancoDemo({ colecoes: { configuracoes: {} } }), /produtos/);
  assert.throws(() => montarBancoDemo({ colecoes: { produtos: {} } }), /produtos/);
  assert.throws(() => montarBancoDemo({ ...minimo(), erros: { pedidos: 'permission-denied' } }), /pedidos/);
  // Erro só numa coleção nova da V2 não impede o ensaio.
  montarBancoDemo({ ...minimo(), erros: { bairros: 'permission-denied' } });
});

test('abrir 24h so muda horarios da copia', () => {
  const b = minimo();
  const antes = JSON.stringify(b);
  const normal = montarBancoDemo(b);
  const aberta = montarBancoDemo(b, { aberta24h: true });
  assert.equal(JSON.stringify(b), antes);
  const h = aberta.config.loja.horarios;
  assert.equal(Object.keys(h).length, 7);
  for (let d = 0; d < 7; d++) assert.deepEqual(h[d], { ativo: true, abre: '00:00', fecha: '23:59' });
  const semHorarios = banco => {
    const c = structuredClone(banco);
    delete c.config.loja.horarios;
    return c;
  };
  assert.deepEqual(semHorarios(aberta), semHorarios(normal));
  assert.notDeepEqual(normal.config.loja.horarios, h);
  // Sem a opção, nada muda.
  assert.deepEqual(montarBancoDemo(b, {}), normal);
});
