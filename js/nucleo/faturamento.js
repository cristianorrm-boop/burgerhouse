// Faturamento a partir das vendas (V1), com fiado. Módulo puro: sem db, DOM ou localStorage.

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Milissegundos de número, Date, Timestamp ({toMillis}) ou {seconds}; null se não der. */
export function msDe(valor) {
  if (valor == null) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (valor instanceof Date) { const t = valor.getTime(); return Number.isFinite(t) ? t : null; }
  if (typeof valor.toMillis === 'function') { const t = valor.toMillis(); return Number.isFinite(t) ? t : null; }
  if (Number.isFinite(valor.seconds)) return valor.seconds * 1000 + Math.floor(num(valor.nanoseconds) / 1e6);
  return null;
}

const noPeriodo = (v, ini, fim) => { const t = msDe(v.criadoEm); return t !== null && t >= ini && t < fim; };
const arred = n => Math.round(n * 100) / 100;

export function resumoVendas(vendas, ini, fim) {
  const lista = vendas.filter(v => noPeriodo(v, ini, fim));
  const faturamento = arred(lista.reduce((s, v) => s + num(v.total), 0));
  const porForma = {};
  const itens = {};
  for (const v of lista) {
    if (v.fiado === true) porForma.fiado = arred((porForma.fiado || 0) + num(v.total));
    else for (const p of v.pagamentos || []) {
      const f = String(p.forma || '').toLowerCase();
      if (f) porForma[f] = arred((porForma[f] || 0) + num(p.valor));
    }
    for (const i of v.itens || []) {
      const nome = i.nome ?? '';
      const qtd = num(i.qtd) || 1;
      const unit = num(i.preco) + (Array.isArray(i.adicionais) ? i.adicionais.reduce((s, a) => s + num(a.preco), 0) : 0);
      const d = (itens[nome] ||= { nome, qtd: 0, valor: 0 });
      d.qtd += qtd;
      d.valor = arred(d.valor + unit * qtd);
    }
  }
  return {
    faturamento,
    quantidade: lista.length,
    ticketMedio: lista.length ? arred(faturamento / lista.length) : 0,
    porForma,
    maisVendidos: Object.values(itens).sort((a, b) => b.qtd - a.qtd)
  };
}

/** Dinheiro que entrou no período: vendas não-fiado (pelo total) + pagamentos de fiado pela data deles (local). */
export function caixaRecebido(vendas, ini, fim) {
  let soma = 0;
  for (const v of vendas) {
    if (v.fiado === true) {
      for (const p of v.pagamentosFiado || []) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.data || '');
        if (!m) continue;
        const t = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
        if (t >= ini && t < fim) soma += num(p.valor);
      }
    } else if (noPeriodo(v, ini, fim)) soma += num(v.total);
  }
  return arred(soma);
}

export function fiadoEmAberto(vendas) {
  return vendas
    .filter(v => v.fiado === true)
    .map(v => ({ id: v.id, cliente: v.cliente ?? '', total: num(v.total), valorPago: num(v.valorPago), saldo: arred(num(v.total) - num(v.valorPago)), criadoEm: v.criadoEm }))
    .filter(v => v.saldo > 0.004)
    .sort((a, b) => (msDe(a.criadoEm) ?? 0) - (msDe(b.criadoEm) ?? 0));
}
