// Vendas no formato da V1 (coleção `vendas`). Módulo puro: sem db, DOM ou localStorage.
//
// Convenção do item (fixada antes da Fase 4):
// - Item V2 = tem produtoId (gravado pelo cardápio da V2): preco JÁ inclui os adicionais.
// - Item V1 = sem produtoId (pedidos da V1 convertidos pela Fase 2 não têm produtoId):
//   preco é o base e cada adicional tem o seu preço à parte.
// - A venda grava sempre na convenção V1 (itemDaVenda); valorLinhaItem (nucleo/pedidos.js) lê as duas.
import { nomeMesa } from './mesas.js?v=2.0.0-f3';
import { pagamentoRotulo } from './pedidos.js?v=2.0.0-f3';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

const arred = n => Math.round(n * 100) / 100;

// Convenção V1 do item da venda: preco base, adicionais com preço à parte.
// Item V2 (tem produtoId) traz o preco já com os adicionais: volta ao base. Item V1 vai como está.
function itemDaVenda(i) {
  const lista = Array.isArray(i.adicionais) ? i.adicionais : [];
  const v2 = i.produtoId != null;
  const adicionais = v2
    ? lista.map(a => ({ nome: a.nome ?? '', preco: num(a.preco), ...(a.grupo != null ? { grupo: a.grupo } : {}) }))
    : lista.map(a => ({ ...a }));
  const preco = v2 ? Math.max(0, arred(num(i.preco) - adicionais.reduce((s, a) => s + a.preco, 0))) : num(i.preco);
  return {
    nome: i.nome ?? '',
    preco,
    qtd: num(i.qtd) || 1,
    adicionais,
    observacao: i.obs || i.observacao || null
  };
}

export const idVendaPedido = p => 'ped-' + p.id;

export function idVendaMesa(pedidoIds) {
  return 'mesa-' + [...pedidoIds].map(String).sort()[0];
}

/** Id da venda do fechamento: reaproveita o de uma tentativa anterior incompleta (vendaId 'mesa-…' sem contaFechada). */
export function idVendaFechamento(pedidos) {
  const sobra = pedidos
    .filter(p => typeof p.vendaId === 'string' && p.vendaId.startsWith('mesa-') && !p.contaFechada)
    .map(p => p.vendaId).sort()[0];
  return sobra || idVendaMesa(pedidos.map(p => p.id));
}

export function deveGerarVendaAoEntregar(p, novoStatus) {
  return novoStatus === 'entregue' && p.tipo !== 'mesa' && !p.vendaId;
}

export function vendaDePedidoOnline(p, agora) {
  const total = num(p.total);
  const forma = p.pagamento?.forma || 'a combinar';
  const recebido = p.pagamento?.troco ? num(p.pagamento.troco) : null;
  return {
    itens: (p.itens || []).map(itemDaVenda),
    subtotal: num(p.subtotal ?? total),
    desconto: num(p.desconto) + num(p.descontoFidelidade),
    total,
    fiado: false,
    pagamentos: [{ forma, valor: total }],
    pagamento: pagamentoRotulo(forma),
    recebidoDinheiro: recebido,
    troco: recebido !== null ? Math.max(0, recebido - total) : null,
    cliente: p.cliente?.nome || (p.tipo === 'delivery' ? 'Cliente (entrega)' : 'Cliente (retirada)'),
    cupom: p.cupom || null,
    pedidoOrigem: { pedidoId: p.id, origem: p.tipo, numeroPedido: p.numero ?? null },
    criadoEm: agora
  };
}

export function pedidosParaFechar(pedidos, mesaId) {
  return pedidos.filter(p => p.tipo === 'mesa' && String(p.mesa) === String(mesaId) && p.status !== 'cancelado' && !p.contaFechada);
}

export function vendaDeFechamentoMesa(mesa, pedidos, forma, agora) {
  const validos = pedidos.filter(p => p.status !== 'cancelado');
  const total = arred(validos.reduce((s, p) => s + num(p.total), 0));
  const desconto = arred(validos.reduce((s, p) => s + num(p.desconto) + num(p.descontoFidelidade), 0));
  return {
    itens: validos.flatMap(p => (p.itens || []).map(itemDaVenda)),
    subtotal: arred(total + desconto),
    desconto,
    total,
    fiado: false,
    pagamentos: [{ forma, valor: total }],
    pagamento: pagamentoRotulo(forma),
    recebidoDinheiro: null,
    troco: null,
    cliente: mesa.clienteAtual || nomeMesa(mesa),
    cupom: null,
    mesaFechamento: { mesaId: mesa.id, mesaNome: nomeMesa(mesa), pedidoIds: validos.map(p => p.id) },
    criadoEm: agora
  };
}

export const MOTIVO_CONTA_FECHADA = 'Conta já fechada — atualize a tela';

/** Regra do fechamento, sobre os pedidos relidos dentro da transação: nenhum sumiu, foi cancelado ou já teve a conta fechada. */
export function podeFecharConta(pedidosRelidos) {
  const ok = Array.isArray(pedidosRelidos) && pedidosRelidos.length > 0 &&
    pedidosRelidos.every(p => p && p.status !== 'cancelado' && !p.contaFechada);
  return ok ? { ok: true, motivo: null } : { ok: false, motivo: MOTIVO_CONTA_FECHADA };
}

/** Pedidos do fechamento cujo cupom ainda não foi contado no limite de usos. */
export function cuponsAContar(pedidos) {
  return pedidos.filter(p => !p.contabilizado && p.cupom).map(p => ({ pedidoId: p.id, cupom: p.cupom }));
}
