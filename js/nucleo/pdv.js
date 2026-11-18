// Regras do PDV (balcão). Módulo puro: sem db, DOM ou localStorage.
// A venda sai no formato da V1 (ver nucleo/vendas.js): itens na convenção V1, sem produtoId.

import { msDe } from './faturamento.js?v=2.0.0-f3';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arred = n => Math.round(n * 100) / 100;
const brl = v => 'R$ ' + num(v).toFixed(2).replace('.', ',');

export const ROTULOS_PDV = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' };

const adicionalLimpo = a => ({ grupoNome: a.grupoNome ?? '', opcaoNome: a.opcaoNome ?? '', preco: num(a.preco) });

/** Chave da linha: mesmo produto com outros adicionais ou outra observação é outra linha. */
export function chaveItem(produtoId, adicionais = [], observacao = '') {
  const ads = (adicionais || []).map(a => `${a.grupoNome ?? ''}:${a.opcaoNome ?? ''}:${num(a.preco)}`).sort();
  return JSON.stringify([String(produtoId), ads, String(observacao || '').trim()]);
}

export function adicionarAoCarrinho(carrinho, produto, adicionais = [], observacao = '') {
  const ads = (adicionais || []).map(adicionalLimpo);
  const obs = String(observacao || '').trim();
  const chave = chaveItem(produto.id, ads, obs);
  const i = carrinho.findIndex(l => chaveItem(l.produtoId, l.adicionais, l.observacao) === chave);
  if (i >= 0) return carrinho.map((l, k) => (k === i ? { ...l, qtd: l.qtd + 1 } : l));
  const promo = num(produto.precoPromo);
  const base = num(produto.preco);
  const preco = promo > 0 && promo < base ? promo : base;
  return [...carrinho, { produtoId: produto.id, nome: produto.nome ?? '', preco, qtd: 1, adicionais: ads, observacao: obs }];
}

export function alterarQtd(carrinho, indice, delta) {
  return carrinho
    .map((l, k) => (k === indice ? { ...l, qtd: l.qtd + delta } : l))
    .filter(l => l.qtd > 0);
}

export const removerLinha = (carrinho, indice) => carrinho.filter((_, k) => k !== indice);

export const precoUnitario = l => arred(num(l.preco) + (l.adicionais || []).reduce((s, a) => s + num(a.preco), 0));

export const subtotalCarrinho = carrinho => arred(carrinho.reduce((s, l) => s + precoUnitario(l) * num(l.qtd), 0));

/** Desconto manual + cupom (percentual ou valor fixo), limitado ao subtotal. Cupom de frete não vale. */
export function descontoPDV({ subtotal, manual, cupom }) {
  const sub = num(subtotal);
  let porCupom = 0;
  if (cupom) {
    if (cupom.tipo === 'percentual') porCupom = sub * num(cupom.valor) / 100;
    else if (cupom.tipo === 'valor' || cupom.tipo === 'fixo') porCupom = num(cupom.valor);
  }
  return arred(Math.max(0, Math.min(sub, Math.max(0, num(manual)) + porCupom)));
}

export function validarCupomPDV(cupom, subtotal, hojeISO) {
  if (!cupom || cupom.ativo === false || !cupom.ativo) return { ok: false, erro: 'Cupom inválido.' };
  if (cupom.tipo === 'frete') return { ok: false, erro: 'Cupom de frete não vale no PDV.' };
  if (cupom.validade && cupom.validade < hojeISO) return { ok: false, erro: 'Este cupom expirou.' };
  if (cupom.limite && num(cupom.usos) >= num(cupom.limite)) return { ok: false, erro: 'Este cupom já atingiu o limite de usos.' };
  const minimo = num(cupom.minimo ?? cupom.valorMinimo);
  if (minimo > 0 && num(subtotal) < minimo) {
    return { ok: false, erro: `Cupom ${cupom.codigo ?? cupom.id ?? ''} vale para pedidos a partir de ${brl(minimo)}.`.replace('  ', ' ') };
  }
  return { ok: true, erro: null };
}

export function pagamentosPDV({ total, forma1, dividir, forma2, valor2 }) {
  const t = arred(num(total));
  if (!dividir) return [{ forma: forma1, valor: t }];
  const v2 = arred(Math.max(0, Math.min(num(valor2), t)));
  return [{ forma: forma1, valor: arred(t - v2) }, { forma: forma2, valor: v2 }];
}

export const dinheiroNecessario = pagamentos =>
  arred((pagamentos || []).filter(p => p.forma === 'dinheiro').reduce((s, p) => s + num(p.valor), 0));

export function montarVendaPDV({ carrinho, desconto, cupomCodigo, fiado, pagamentos, recebido, cliente, agora }) {
  const itens = carrinho.map(l => ({
    nome: l.nome ?? '',
    preco: num(l.preco),
    qtd: num(l.qtd) || 1,
    adicionais: (l.adicionais || []).map(a => ({ grupoNome: a.grupoNome ?? '', opcaoNome: a.opcaoNome ?? '', nome: a.opcaoNome ?? '', preco: num(a.preco) })),
    observacao: l.observacao ? String(l.observacao) : null
  }));
  const subtotal = subtotalCarrinho(carrinho);
  const desc = arred(Math.min(subtotal, Math.max(0, num(desconto))));
  const total = arred(subtotal - desc);
  const nome = String(cliente ?? '').trim();
  const base = { itens, subtotal, desconto: desc, total };
  if (fiado) {
    return {
      ...base, fiado: true, valorPago: 0, pagamentosFiado: [], pagamentos: [], pagamento: 'Pagamento a Prazo',
      recebidoDinheiro: null, troco: null, cliente: nome, cupom: cupomCodigo || null, criadoEm: agora
    };
  }
  const pags = (pagamentos || []).map(p => ({ forma: p.forma, valor: arred(num(p.valor)) }));
  const cash = dinheiroNecessario(pags);
  return {
    ...base, fiado: false, pagamentos: pags,
    pagamento: pags.map(p => ROTULOS_PDV[p.forma] || p.forma).join(' + '),
    recebidoDinheiro: cash > 0 ? num(recebido) : null,
    troco: cash > 0 ? arred(num(recebido) - cash) : null,
    cliente: nome || null, cupom: cupomCodigo || null, criadoEm: agora
  };
}

export function validarVendaPDV({ carrinho, fiado, cliente, pagamentos, recebido, dividir }) {
  if (!carrinho || !carrinho.length) return 'Adicione ao menos um produto ao carrinho.';
  if (fiado) {
    return String(cliente ?? '').trim() ? null : 'Informe o nome do cliente para registrar o pagamento a prazo.';
  }
  const pags = pagamentos || [];
  if (dividir && pags.length > 1 && (num(pags[0].valor) <= 0 || num(pags[1].valor) <= 0)) {
    return 'Informe um valor válido para a 2ª forma de pagamento (menor que o total).';
  }
  const cash = dinheiroNecessario(pags);
  if (cash > 0 && num(recebido) < cash) {
    return 'Informe quanto o cliente pagou em dinheiro (valor recebido menor que o necessário).';
  }
  return null;
}

export function produtoPorCodigo(produtos, codigo) {
  const c = String(codigo ?? '').trim();
  if (!c) return null;
  return (produtos || []).find(p => p.codigoBarras === c && p.disponivel !== false) || null;
}

/** Id da venda, gerado uma vez por carrinho: repetir o envio regrava o mesmo documento em vez de duplicar a venda. */
let seqId = 0;
export function novoIdVendaPDV() {
  seqId = (seqId + 1) % 1296;
  return 'pdv-' + Date.now().toString(36) + seqId.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 8);
}

/** Produto (outro que não idAtual) que já usa este código de barras, ou null. */
export function codigoDuplicado(produtos, codigo, idAtual) {
  const c = String(codigo ?? '').trim();
  if (!c) return null;
  return (produtos || []).find(p => p.codigoBarras === c && p.id !== idAtual) || null;
}

/**
 * Vendas que merecem o aviso "Nova venda registrada!": criadas a partir de `desde` (ms),
 * não gravadas por esta aba (idsMeus) e ainda não vistas. Vendas antigas que chegam
 * depois (cache → servidor) não avisam.
 */
export function vendasNovasDeOutroAparelho(vendas, idsMeus, desde, jaVistas = new Set()) {
  return (vendas || []).filter(v => {
    const t = msDe(v.criadoEm);
    return t !== null && t >= desde && !idsMeus.has(v.id) && !jaVistas.has(v.id);
  });
}
