// Recibo da venda (V1): texto de pagamento, payload e link que o recibo.html decodifica. Módulo puro.
import { valorLinhaItem } from './pedidos.js?v=2.0.1';
import { msDe } from './faturamento.js?v=2.0.1';
import { saldoFiado } from './fiado.js?v=2.0.1';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arred = n => Math.round(n * 100) / 100;
const ROTULOS = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' };
const rotulo = f => ROTULOS[f] || ROTULOS[String(f ?? '').toLowerCase()] || (f ? String(f) : '–');
const reais = v => 'R$ ' + num(v).toFixed(2).replace('.', ',');

/** "Pix: R$ 30,00 + Crédito: R$ 20,00"; sem `pagamentos`, o texto de `pagamento`; fiado: "Pagamento a Prazo". */
export function textoPagamento(venda) {
  if (venda.fiado) return 'Pagamento a Prazo';
  if (Array.isArray(venda.pagamentos) && venda.pagamentos.length) {
    return venda.pagamentos.map(p => `${rotulo(p.forma)}: ${reais(p.valor)}`).join(' + ');
  }
  return rotulo(venda.pagamento);
}

/** "X-Bacon (+ Bacon extra, Cheddar; obs: sem cebola)": nome do item com adicionais e observação. */
function textoItem(i) {
  const nome = i.nome ?? '';
  const adic = (Array.isArray(i.adicionais) ? i.adicionais : []).map(a => a?.nome || a?.opcaoNome).filter(Boolean);
  const obs = String(i.observacao ?? '').trim();
  const partes = [];
  if (adic.length) partes.push('+ ' + adic.join(', '));
  if (obs) partes.push('obs: ' + obs);
  return partes.length ? `${nome} (${partes.join('; ')})` : nome;
}

/** Mesmas chaves da V1, as que o recibo.html lê. `p` = valor da linha / qtd, para as linhas somarem o subtotal. */
export function payloadRecibo(venda, nomeLoja) {
  const t = msDe(venda.criadoEm);
  const fiado = !!venda.fiado;
  return {
    loja: nomeLoja || 'Loja',
    data: new Date(t ?? Date.now()).toISOString(),
    cliente: venda.cliente || null,
    itens: (venda.itens || []).map(i => {
      const q = num(i.qtd) || 1;
      return { n: textoItem(i), q, p: arred(valorLinhaItem({ ...i, qtd: q }) / q) };
    }),
    subtotal: num(venda.subtotal),
    desconto: num(venda.desconto),
    cupom: venda.cupom || null,
    total: num(venda.total),
    pagamentos: Array.isArray(venda.pagamentos) && (venda.pagamentos.length || fiado) ? venda.pagamentos : [{ forma: venda.pagamento || '', valor: num(venda.total) }],
    recebido: venda.recebidoDinheiro ?? null,
    troco: venda.troco ?? null,
    fiado,
    pago: fiado ? num(venda.valorPago) : null,
    deve: fiado ? saldoFiado(venda) : null
  };
}

function base64Utf8(texto) {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(texto)));
  return Buffer.from(texto, 'utf8').toString('base64');
}

/** `${origem}/recibo.html#<base64 do JSON em UTF-8>` (o recibo.html decodifica com atob + escape). */
export function linkRecibo(venda, nomeLoja, origem) {
  return `${origem}/recibo.html#${base64Utf8(JSON.stringify(payloadRecibo(venda, nomeLoja)))}`;
}
