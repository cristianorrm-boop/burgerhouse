// Pagamento a prazo (fiado) da V1: saldo, quitação, pagamento parcial e filtros. Módulo puro: sem db ou DOM.
import { msDe } from './faturamento.js?v=2.0.0-f4';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arred = n => Math.round(n * 100) / 100;

/** Quanto falta receber: max(0, total − valorPago), em centavos. */
export const saldoFiado = v => Math.max(0, arred(num(v?.total) - num(v?.valorPago)));

/** Quitado = saldo de até meio centavo (tolerância de arredondamento). */
export const quitado = v => saldoFiado(v) <= 0.004;

/**
 * Aplica um pagamento à venda sem alterá-la. Aplica só o que falta (min(valor, saldo)).
 * Devolve { valorPago, pagamentosFiado, aplicado, quitado } ou { erro }.
 */
export function aplicarPagamentoFiado(venda, valor, dataISO) {
  if (!venda) return { erro: 'Venda não encontrada.' };
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return { erro: 'Informe um valor de pagamento válido.' };
  if (!dataISO) return { erro: 'Informe a data do pagamento.' };
  if (quitado(venda)) return { erro: 'Esta venda já está quitada.' };
  const aplicado = Math.min(arred(v), saldoFiado(venda));
  const valorPago = arred(num(venda.valorPago) + aplicado);
  const pagamentosFiado = [...(Array.isArray(venda.pagamentosFiado) ? venda.pagamentosFiado : []), { valor: aplicado, data: dataISO }];
  return { valorPago, pagamentosFiado, aplicado, quitado: quitado({ total: venda.total, valorPago }) };
}

/** Só as vendas a prazo, da mais nova para a mais antiga. filtro: 'aberto' | 'quitado' | 'todos'. */
export function filtrarFiados(vendas, filtro = 'todos') {
  return (vendas || [])
    .filter(v => v.fiado === true)
    .filter(v => filtro === 'aberto' ? !quitado(v) : filtro === 'quitado' ? quitado(v) : true)
    .sort((a, b) => (msDe(b.criadoEm) ?? 0) - (msDe(a.criadoEm) ?? 0));
}
