// Dashboard: vendas, pedidos, ticket médio, gráfico, mais vendidos e alertas do financeiro.
import { db } from '../db.js?v=2.0.2';
import { store, onStore } from './app.js?v=2.0.2';
import { resumoVendas, msDe } from '../nucleo/faturamento.js?v=2.0.2';
import { moeda, esc, inicioDoDia, TIPOS, PAGAMENTOS, hojeISO, debounce } from '../utils.js?v=2.0.2';

export function render(el) {
  let dias = 1;
  el.innerHTML = `
    <div class="barra-acoes">
      <div class="opcoes" id="periodo">${[[1, 'Hoje'], [7, '7 dias'], [30, '30 dias']].map(([v, n], i) =>
        `<label class="opcao"><input type="radio" name="per" value="${v}" ${i === 0 ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
    </div>
    <div id="dash"><div class="spinner"></div></div>`;
  el.querySelector('#periodo').onchange = e => { dias = +e.target.value; carregar(); };

  async function carregar() {
    const ini = dias === 1 ? inicioDoDia() : inicioDoDia(new Date(Date.now() - (dias - 1) * 86400e3));
    const [pedidos, vendas, pagar] = await Promise.all([
      db.list('pedidos', { where: [['criadoEm', '>=', ini]] }).catch(() => []),
      db.list('vendas', { where: [['criadoEm', '>=', ini]] }).catch(() => []),
      db.list('contas_pagar', { where: [['pago', '==', false]] }).catch(() => [])
    ]);
    desenhar(pedidos, vendas, pagar, ini);
  }

  function desenhar(pedidos, vendas, pagar, ini) {
    const validos = pedidos.filter(p => p.status !== 'cancelado');
    const res = resumoVendas(vendas, ini, Infinity);
    const fat = res.faturamento;
    const emAndamento = pedidos.filter(p => !['entregue', 'cancelado'].includes(p.status)).length;
    const cancelados = pedidos.length - validos.length;

    // gráfico: por hora (hoje) ou por dia
    let barras;
    if (dias === 1) {
      barras = Array.from({ length: 24 }, (_, h) => ({ r: `${h}h`, v: 0 }));
      vendas.forEach(v => { const t = msDe(v.criadoEm); if (t !== null && t >= ini) barras[new Date(t).getHours()].v += Number(v.total) || 0; });
      const usadas = barras.map((b, i) => b.v ? i : -1).filter(i => i >= 0);
      barras = usadas.length ? barras.slice(Math.max(0, Math.min(...usadas) - 1), Math.max(...usadas) + 2) : barras.slice(17, 24);
    } else {
      barras = Array.from({ length: dias }, (_, i) => {
        const d = new Date(ini + i * 86400e3);
        return { r: `${d.getDate()}/${d.getMonth() + 1}`, k: hojeISO(d), v: 0 };
      });
      vendas.forEach(v => { const t = msDe(v.criadoEm); if (t === null) return; const b = barras.find(x => x.k === hojeISO(new Date(t))); if (b) b.v += Number(v.total) || 0; });
    }
    const max = Math.max(1, ...barras.map(b => b.v));

    const top = res.maisVendidos.slice(0, 6).map(m => [m.nome, { q: m.qtd, v: m.valor }]);
    const maxTop = Math.max(1, ...top.map(t => t[1].q));

    const agrupar = (fn) => { const g = {}; validos.forEach(p => { const k = fn(p); g[k] = (g[k] || 0) + p.total; }); return Object.entries(g).sort((a, b) => b[1] - a[1]); };
    const porTipo = agrupar(p => TIPOS[p.tipo]);
    const porPag = Object.entries(res.porForma).map(([k, v]) => [k === 'fiado' ? 'Pagamento a prazo (fiado)' : (PAGAMENTOS[k] || k), v]).sort((a, b) => b[1] - a[1]);
    const totalV = validos.reduce((s, p) => s + p.total, 0) || 1;
    const totalF = Object.values(res.porForma).reduce((s, v) => s + v, 0) || 1;

    const hoje = hojeISO();
    const vencendo = pagar.filter(c => c.vencimento <= hoje);

    el.querySelector('#dash').innerHTML = `
      <div class="metricas">
        <div class="card metrica ok"><small><i class="ti ti-currency-real"></i>Faturamento</small><strong>${moeda(fat)}</strong><span class="sub">${res.quantidade} venda(s)</span></div>
        <div class="card metrica"><small><i class="ti ti-receipt"></i>Pedidos</small><strong>${validos.length}</strong><span class="sub">${emAndamento} em andamento</span></div>
        <div class="card metrica"><small><i class="ti ti-chart-arrows"></i>Ticket médio</small><strong>${moeda(res.ticketMedio)}</strong></div>
        <div class="card metrica ${cancelados ? 'danger' : ''}"><small><i class="ti ti-x"></i>Cancelados</small><strong>${cancelados}</strong></div>
      </div>
      ${vencendo.length ? `<a href="#/financeiro" class="card painel" style="display:block;border-color:var(--warn);text-decoration:none;color:inherit">
        <i class="ti ti-alert-triangle" style="color:var(--warn)"></i> <strong>${vencendo.length} conta(s) a pagar</strong> vencendo hoje ou vencida(s): ${moeda(vencendo.reduce((s, c) => s + c.valor, 0))}. Ver financeiro →</a>` : ''}
      <div class="grade-painel">
        <div class="card painel"><h2>Vendas ${dias === 1 ? 'por hora' : 'por dia'}</h2>
          <div class="grafico">${barras.map(b => `<div class="gb" title="${b.r}: ${moeda(b.v)}"><i style="height:${b.v / max * 100}%"></i><small>${b.r}</small></div>`).join('')}</div>
        </div>
        <div class="card painel"><h2 style="margin-bottom:8px">Mais vendidos</h2>
          <ul class="ranking">${top.map(([n, d]) => `<li><div style="flex:1;min-width:0">${esc(n)}<div class="barra-h"><i style="width:${d.q / maxTop * 100}%"></i></div></div><strong>${d.q}</strong></li>`).join('') || '<li class="vazio">Sem vendas no período.</li>'}</ul>
        </div>
        <div class="card painel"><h2 style="margin-bottom:8px">Por tipo de pedido</h2>
          <ul class="ranking">${porTipo.map(([k, v]) => `<li><span>${esc(k)}</span><span>${moeda(v)} <small style="color:var(--txt3)">${Math.round(v / totalV * 100)}%</small></span></li>`).join('') || '<li class="vazio">—</li>'}</ul>
        </div>
        <div class="card painel"><h2 style="margin-bottom:8px">Formas de pagamento</h2>
          <ul class="ranking">${porPag.map(([k, v]) => `<li><span>${esc(k)}</span><span>${moeda(v)} <small style="color:var(--txt3)">${Math.round(v / totalF * 100)}%</small></span></li>`).join('') || '<li class="vazio">—</li>'}</ul>
        </div>
      </div>`;
  }

  carregar();
  return onStore(debounce(carregar, 1500));
}
