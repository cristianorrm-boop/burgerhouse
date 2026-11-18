// Relatório de vendas (V1): período, resumo, totais por dia, CSV e origem da venda. Módulo puro.
import { msDe } from './faturamento.js?v=2.0.0-f4';
import { textoPagamento } from './recibo.js?v=2.0.0-f4';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dois = n => String(n).padStart(2, '0');

const partes = mesISO => { const [a, m] = String(mesISO).split('-').map(Number); return [a, m]; };

export function diasDoMes(mesISO) {
  const [a, m] = partes(mesISO);
  return new Date(a, m, 0).getDate();
}

/** { ini, fim } em ms, horário local: o mês inteiro ou só o `dia`. */
export function periodoRelatorio(mesISO, dia) {
  const [a, m] = partes(mesISO);
  if (dia) return { ini: new Date(a, m - 1, Number(dia)).getTime(), fim: new Date(a, m - 1, Number(dia) + 1).getTime() };
  return { ini: new Date(a, m - 1, 1).getTime(), fim: new Date(a, m, 1).getTime() };
}

/** Soma de `total`, inclusive fiado (como na V1). */
export function resumoRelatorio(vendas) {
  const quantidade = vendas.length;
  const faturamento = vendas.reduce((s, v) => s + num(v.total), 0);
  return { quantidade, faturamento, ticket: quantidade ? faturamento / quantidade : 0 };
}

export function totaisPorDia(vendas, mesISO) {
  const totais = Array(diasDoMes(mesISO)).fill(0);
  vendas.forEach(v => {
    const t = msDe(v.criadoEm);
    if (t !== null) { const i = new Date(t).getDate() - 1; if (i >= 0 && i < totais.length) totais[i] += num(v.total); }
  });
  return totais;
}

// Texto livre que começa com = + - @ tab ou CR viraria fórmula no Excel: prefixa apóstrofo.
const texto = t => (/^[=+\-@\t\r]/.test(String(t)) ? "'" + t : String(t));
const campo = c => `"${String(c).replace(/"/g, '""')}"`;

export function csvRelatorio(vendas) {
  const cab = ['Data', 'Hora', 'Cliente', 'Itens', 'Pagamento', 'Cupom', 'Subtotal', 'Desconto', 'Total'];
  const linhas = vendas.map(v => {
    const t = msDe(v.criadoEm);
    const d = t === null ? null : new Date(t);
    return [
      d ? `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}` : '',
      d ? `${dois(d.getHours())}:${dois(d.getMinutes())}` : '',
      texto(v.cliente || ''),
      texto((v.itens || []).map(i => `${num(i.qtd) || 1}x ${i.nome ?? ''}`).join(' | ')),
      texto(textoPagamento(v)),
      texto(v.cupom || ''),
      num(v.subtotal).toFixed(2), num(v.desconto).toFixed(2), num(v.total).toFixed(2)
    ].map(campo).join(';');
  });
  return '﻿' + [cab.join(';'), ...linhas].join('\r\n');
}

/** De onde veio a venda: pedido online, mesa fechada ou PDV (nenhum dos dois campos). */
export function origemVenda(v) {
  if (v.pedidoOrigem) return { tipo: 'online', rotulo: `Online · ${v.pedidoOrigem.origem === 'delivery' ? 'Entrega' : 'Retirada'}` };
  if (v.mesaFechamento) return { tipo: 'mesa', rotulo: v.mesaFechamento.mesaNome || 'Mesa' };
  return { tipo: 'pdv', rotulo: '' };
}
