import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  converterUsuario, converterPedido, converterVenda, contadorInicial,
} from '../ferramentas/conversores.mjs';
import { desserializar } from '../ferramentas/serializar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fx = desserializar(
  JSON.parse(readFileSync(path.join(aqui, 'fixtures', 'movimento-v1.json'), 'utf8')), null,
).colecoes;

const CHAVES_REGRAS = ['nome', 'email', 'perfil', 'abas', 'criadoEm'];

test('garcom vira atendente com abas padrao', () => {
  const r = converterUsuario('uGarcom', fx.usuarios.uGarcom);
  assert.equal(r.campos.perfil, 'atendente');
  assert.deepEqual(r.campos.abas, ['pedidos', 'mesas', 'pdv']);
  assert.equal(r.campos.nome, 'Garcom Teste');
  assert.equal(r.campos.email, 'garcom@teste.com');
  assert.deepEqual(r.avisos, []);
});

test('inativo nao entra na equipe', () => {
  assert.equal(converterUsuario('uInativo', fx.usuarios.uInativo), null);
});

test('dono sem abas', () => {
  const r = converterUsuario('uDono', fx.usuarios.uDono);
  assert.equal(r.campos.perfil, 'dono');
  assert.equal('abas' in r.campos, false);
});

test('so chaves aceitas pelas regras', () => {
  for (const [uid, doc] of Object.entries(fx.usuarios)) {
    const r = converterUsuario(uid, doc);
    if (!r) continue;
    for (const k of Object.keys(r.campos)) assert.ok(CHAVES_REGRAS.includes(k), k);
  }
});

test('status mapeados', () => {
  const mapa = { pRecebido: 'novo', pPreparo: 'preparo', pPronto: 'pronto', pDelivery: 'entregue' };
  for (const [id, esperado] of Object.entries(mapa)) {
    assert.equal(converterPedido(fx.pedidos[id]).campos.status, esperado, id);
  }
});

test('status desconhecido fica igual com aviso', () => {
  const r = converterPedido({ ...fx.pedidos.pRecebido, status: 'cancelado' });
  assert.equal(r.campos.status, 'cancelado');
  assert.equal(r.avisos.length, 1);
});

test('pedido de mesa', () => {
  const { campos, avisos } = converterPedido(fx.pedidos.pMesa);
  assert.equal(campos.tipo, 'mesa');
  assert.equal(campos.mesa, 'mesaFx3');
  assert.equal(campos.pagamento, null);
  assert.equal(campos.numero, null);
  assert.equal(campos.contaFechada, true);
  assert.equal(campos.taxa, 0);
  assert.deepEqual(avisos, []);
});

test('pedido delivery: pagamento minusculo, taxa, endereco, numero em codigo', () => {
  const { campos, avisos } = converterPedido(fx.pedidos.pDelivery);
  assert.equal(campos.tipo, 'delivery');
  assert.deepEqual(campos.pagamento, { forma: 'pix', troco: null });
  assert.equal(campos.taxa, 8);
  assert.equal(campos.numero, 'AB12CD34');
  assert.deepEqual(campos.endereco, { texto: 'Rua Teste, 100', cep: '00000-000' });
  assert.deepEqual(avisos, []);
});

test('retirada nao tem endereco', () => {
  const { campos } = converterPedido(fx.pedidos.pRecebido);
  assert.equal(campos.tipo, 'retirada');
  assert.equal('endereco' in campos, false);
});

test('forma de pagamento desconhecida avisa', () => {
  const r = converterPedido({ ...fx.pedidos.pRecebido, formaPagamento: 'Vale' });
  assert.equal(r.campos.pagamento.forma, 'vale');
  assert.equal(r.avisos.length, 1);
});

test('criadoEm vira milissegundos e guarda o original', () => {
  const doc = fx.pedidos.pDelivery;
  const { campos } = converterPedido(doc);
  assert.equal(campos.criadoEm, 1790001000000);
  assert.equal(campos.criadoEmTs, doc.criadoEm);
  assert.deepEqual(campos.historico, [{ status: 'entregue', em: 1790001000000 }]);
});

test('pedido sem itens vira lista vazia', () => {
  const { campos, avisos } = converterPedido(fx.pedidos.pSemItens);
  assert.deepEqual(campos.itens, []);
  assert.equal(avisos.length, 1);
});

test('itens antigos ganham obs e nome do adicional', () => {
  const { campos } = converterPedido(fx.pedidos.pMesa);
  const it = campos.itens[0];
  assert.equal(it.obs, 'sem cebola');
  assert.equal(it.observacao, 'sem cebola');
  assert.equal(it.adicionais[0].nome, 'Bacon');
  assert.equal(it.adicionais[0].opcaoNome, 'Bacon');
  assert.equal(it.adicionais[0].grupoNome, 'Extras');
  const sem = converterPedido(fx.pedidos.pDelivery).campos.itens[0];
  assert.equal(sem.obs, '');
});

test('nenhum campo undefined nas saidas', () => {
  for (const doc of Object.values(fx.pedidos)) {
    const { campos } = converterPedido(doc);
    for (const [k, v] of Object.entries(campos)) assert.notEqual(v, undefined, k);
  }
});

test('venda so muda a data', () => {
  for (const doc of Object.values(fx.vendas)) {
    const { campos, avisos } = converterVenda(doc);
    assert.deepEqual(Object.keys(campos).sort(), ['criadoEm', 'criadoEmTs']);
    assert.equal(typeof campos.criadoEm, 'number');
    assert.equal(campos.criadoEmTs, doc.criadoEm);
    assert.deepEqual(avisos, []);
  }
});

test('contador ignora numero em codigo', () => {
  const r = contadorInicial(Object.values(fx.pedidos));
  assert.equal(r.n, 12);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /2/);
});

test('contador sem numeros e 0', () => {
  assert.deepEqual(contadorInicial([{ numeroPedido: null }]), { n: 0, avisos: [] });
});
