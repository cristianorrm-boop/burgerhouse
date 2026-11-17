// Pedidos: rótulos e textos legíveis, inclusive para pedidos migrados da V1 (funções puras).
import { nomeMesa } from './mesas.js?v=2.0.0-f3';

const PAGAMENTOS = {
  dinheiro: 'Dinheiro',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  pix: 'Pix',
  vale: 'Vale-refeição'
};

const ruim = s => !s || /^(null|undefined|nan)$/i.test(s);

/** Nome da mesa de um pedido: o gravado no pedido, senão o da mesa atual, senão "Mesa". */
export function mesaDoPedido(p, mesasPorId = {}) {
  const gravado = String(p?.mesaNome ?? '').trim();
  if (!ruim(gravado)) return gravado;
  const m = p?.mesa != null ? mesasPorId?.[p.mesa] : null;
  return m ? nomeMesa(m) : 'Mesa';
}

/** Rótulo do pedido: #12, #CODIGO, nome da mesa ou #ID. Nunca null/undefined/NaN. */
export function rotuloPedido(p, mesasPorId = {}) {
  const n = p?.numero;
  if (typeof n === 'number' && Number.isInteger(n) && n > 0) return `#${n}`;
  if (typeof n === 'string') {
    const t = n.trim();
    if (!ruim(t)) return `#${t}`;
  }
  if (p?.tipo === 'mesa') return mesaDoPedido(p, mesasPorId);
  const id = String(p?.id ?? '').slice(0, 5).toUpperCase();
  return id ? `#${id}` : 'Pedido';
}

/** Endereço do formato V1 ({texto, cep}) ou V2 (rua, número, bairro...). */
export function enderecoTexto(e) {
  if (!e) return '';
  const texto = String(e.texto ?? '').trim();
  if (texto) {
    const cep = String(e.cep ?? '').trim();
    return cep ? `${texto} · CEP ${cep}` : texto;
  }
  if (!e.rua && !e.bairro) return '';
  const rua = [e.rua, e.numero].filter(Boolean).join(', ');
  return `${rua}${e.complemento ? ' - ' + e.complemento : ''}${e.bairro ? (rua ? ' · ' : '') + e.bairro : ''}${e.referencia ? ` (ref.: ${e.referencia})` : ''}`;
}

/** Forma de pagamento por extenso; aceita maiúsculas e minúsculas. */
export function pagamentoRotulo(forma) {
  if (forma == null || forma === '') return '';
  const f = String(forma);
  return PAGAMENTOS[f] || PAGAMENTOS[f.toLowerCase()] || f;
}

const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Histórico: ini <= criadoEm < fim, com busca por cliente, mesa e rótulo; mais novo primeiro. */
export function filtroHistorico(pedidos, { ini = -Infinity, fim = Infinity, busca = '' } = {}, mesasPorId = {}) {
  const q = semAcento(busca).trim();
  return pedidos
    .filter(p => p.criadoEm >= ini && p.criadoEm < fim)
    .filter(p => !q || semAcento([p.cliente?.nome, p.mesaNome, rotuloPedido(p, mesasPorId)].join(' ')).includes(q))
    .sort((a, b) => b.criadoEm - a.criadoEm);
}
