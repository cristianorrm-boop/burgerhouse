// Vendas no formato da V1 (coleção `vendas`). Módulo puro: sem db, DOM ou localStorage.
import { nomeMesa } from './mesas.js?v=2.0.0-f1';
import { pagamentoRotulo } from './pedidos.js?v=2.0.0-f1';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

const itemDaVenda = i => ({
  nome: i.nome ?? '',
  preco: num(i.preco),
  qtd: num(i.qtd) || 1,
  adicionais: Array.isArray(i.adicionais) ? i.adicionais.map(a => ({ ...a })) : [],
  observacao: i.obs || i.observacao || null
});

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
  const total = validos.reduce((s, p) => s + num(p.total), 0);
  return {
    itens: validos.flatMap(p => (p.itens || []).map(itemDaVenda)),
    subtotal: total,
    desconto: 0,
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
