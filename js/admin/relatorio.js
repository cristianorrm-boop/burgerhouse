// Relatório de vendas: filtro por mês/dia, resumo, gráfico de barras por dia, tabela e exportação em CSV.
import { db } from '../db.js?v=2.0.0-f4';
import { store } from './app.js?v=2.0.0-f4';
import { moeda, esc, toast, confirmar, hojeISO, horaBR } from '../utils.js?v=2.0.0-f4';
import { msDe } from '../nucleo/faturamento.js?v=2.0.0-f4';
import { textoPagamento } from '../nucleo/recibo.js?v=2.0.0-f4';
import { saldoFiado } from '../nucleo/fiado.js?v=2.0.0-f4';
import { periodoRelatorio, diasDoMes, resumoRelatorio, totaisPorDia, csvRelatorio, origemVenda, mostrarRotuloDia } from '../nucleo/relatorio.js?v=2.0.0-f4';
import { imprimirRecibo, compartilharRecibo } from './recibo.js?v=2.0.0-f4';

const CLASSE_ORIGEM = { online: 'badge-info', mesa: 'badge-pri' };
const dois = n => String(n).padStart(2, '0');
const mesAtual = () => hojeISO().slice(0, 7);

export function render(el) {
  let vendas = [];
  let pedido = 0; // descarta respostas de consultas antigas
  const ehDono = () => store.user?.perfil === 'dono';

  el.innerHTML = `
    <div class="barra-acoes">
      <input class="inp" id="rl-mes" type="month" aria-label="Mês" value="${mesAtual()}">
      <select class="inp" id="rl-dia" aria-label="Dia"></select>
      <button class="btn btn-ghost" id="rl-limpar"><i class="ti ti-eraser"></i> Limpar</button>
      <span class="espaco"></span>
      <button class="btn btn-ghost" id="rl-csv"><i class="ti ti-file-spreadsheet"></i> Exportar CSV</button>
    </div>
    <div class="metricas">
      <div class="card metrica"><small><i class="ti ti-receipt-2"></i><span id="rl-lbl-qtd">Vendas no mês</span></small><strong id="rl-qtd">–</strong></div>
      <div class="card metrica ok"><small><i class="ti ti-currency-real"></i><span id="rl-lbl-total">Faturamento no mês</span></small><strong id="rl-total">–</strong></div>
      <div class="card metrica"><small><i class="ti ti-chart-arrows"></i>Ticket médio</small><strong id="rl-ticket">–</strong></div>
    </div>
    <div class="card painel"><h2>Faturamento por dia</h2><div class="grafico" id="rl-grafico"></div></div>
    <section class="card painel">
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Data</th><th>Hora</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th class="num">Total</th><th class="acoes">Ações</th></tr></thead>
        <tbody id="rl-vendas"><tr><td colspan="7"><div class="spinner"></div></td></tr></tbody>
      </table></div>
    </section>`;

  const $ = s => el.querySelector(s);
  const mes = () => $('#rl-mes').value || mesAtual();
  const dia = () => Number($('#rl-dia').value) || null;

  function popularDias() {
    const sel = $('#rl-dia');
    const atual = sel.value;
    const n = diasDoMes(mes());
    sel.innerHTML = '<option value="">Mês inteiro</option>' + Array.from({ length: n }, (_, i) => `<option value="${i + 1}">Dia ${dois(i + 1)}</option>`).join('');
    if (atual && Number(atual) <= n) sel.value = atual;
  }

  async function carregar() {
    const eu = ++pedido;
    $('#rl-vendas').innerHTML = '<tr><td colspan="7"><div class="spinner"></div></td></tr>';
    const { ini, fim } = periodoRelatorio(mes(), dia());
    try {
      const lista = await db.list('vendas', { where: [['criadoEm', '>=', ini], ['criadoEm', '<', fim]], orderBy: ['criadoEm', 'desc'] });
      if (eu !== pedido) return;
      vendas = lista;
      desenhar();
    } catch (e) {
      if (eu !== pedido) return;
      console.error('Falha ao carregar relatório', e);
      vendas = [];
      $('#rl-vendas').innerHTML = '<tr><td colspan="7"><div class="vazio"><i class="ti ti-alert-triangle"></i>Não foi possível carregar o relatório.</div></td></tr>';
    }
  }

  function pagamentoHtml(v) {
    if (v.fiado === true) {
      const s = saldoFiado(v);
      return s > 0.004
        ? `<span class="badge badge-warn"><i class="ti ti-heart-handshake"></i>A Prazo — deve ${moeda(s)}</span>`
        : '<span class="badge badge-ok"><i class="ti ti-heart-handshake"></i>A Prazo — pago</span>';
    }
    return esc(textoPagamento(v));
  }

  function seloOrigem(v) {
    const o = origemVenda(v);
    return o.tipo === 'pdv' ? '' : ` <span class="badge ${CLASSE_ORIGEM[o.tipo]}">${esc(o.rotulo)}</span>`;
  }

  function desenhar() {
    const r = resumoRelatorio(vendas);
    const filtrandoDia = !!dia();
    $('#rl-qtd').textContent = r.quantidade;
    $('#rl-total').textContent = moeda(r.faturamento);
    $('#rl-ticket').textContent = moeda(r.ticket);
    $('#rl-lbl-qtd').textContent = filtrandoDia ? 'Vendas no dia' : 'Vendas no mês';
    $('#rl-lbl-total').textContent = filtrandoDia ? 'Faturamento no dia' : 'Faturamento no mês';

    const totais = totaisPorDia(vendas, mes());
    const max = Math.max(1, ...totais);
    const estreito = window.matchMedia('(max-width: 600px)').matches;
    $('#rl-grafico').innerHTML = totais.map((v, i) =>
      `<div class="gb" title="Dia ${dois(i + 1)}: ${moeda(v)}"><i style="height:${v / max * 100}%"></i><small>${mostrarRotuloDia(i + 1, totais.length, estreito) ? i + 1 : ''}</small></div>`).join('');

    const dono = ehDono();
    $('#rl-vendas').innerHTML = vendas.length ? vendas.map(v => {
      const t = msDe(v.criadoEm);
      const d = t === null ? null : new Date(t);
      return `<tr>
        <td>${d ? d.toLocaleDateString('pt-BR') : '–'}</td>
        <td>${t !== null ? horaBR(t) : '–'}</td>
        <td>${esc(v.cliente || '–')}${seloOrigem(v)}</td>
        <td class="pdv-col-itens">${esc((v.itens || []).map(i => `${Number(i.qtd) || 1}x ${i.nome ?? ''}`).join(', '))}</td>
        <td>${pagamentoHtml(v)}</td>
        <td class="num"><strong>${moeda(v.total)}</strong></td>
        <td class="acoes">
          <button class="btn btn-ghost btn-s" data-recibo="imprimir" data-id="${esc(v.id)}" title="Imprimir recibo" aria-label="Imprimir recibo"><i class="ti ti-printer"></i></button>
          <button class="btn btn-ghost btn-s" data-recibo="whatsapp" data-id="${esc(v.id)}" title="Enviar recibo pelo WhatsApp" aria-label="Enviar recibo pelo WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>
          ${dono ? `<button class="btn btn-ghost btn-s" data-excluir="${esc(v.id)}" title="Excluir venda" aria-label="Excluir venda" style="color:var(--danger)"><i class="ti ti-trash"></i></button>` : ''}
        </td></tr>`;
    }).join('') : '<tr><td colspan="7"><div class="vazio"><i class="ti ti-chart-bar"></i>Nenhuma venda encontrada neste período.</div></td></tr>';
  }

  $('#rl-vendas').onclick = async ev => {
    const r = ev.target.closest('[data-recibo]');
    if (r) {
      const venda = vendas.find(x => x.id === r.dataset.id);
      if (venda) (r.dataset.recibo === 'imprimir' ? imprimirRecibo : compartilharRecibo)(venda);
      return;
    }
    const b = ev.target.closest('[data-excluir]');
    if (!b || !ehDono()) return;
    if (!(await confirmar('Excluir esta venda? Esta ação não pode ser desfeita.', { ok: 'Excluir', perigo: true }))) return;
    try {
      await db.remove('vendas', b.dataset.excluir);
      vendas = vendas.filter(x => x.id !== b.dataset.excluir);
      desenhar();
      toast('Venda excluída.');
    } catch (e) {
      console.error('Falha ao excluir venda', e);
      toast('Não foi possível excluir a venda.', 'erro');
    }
  };

  $('#rl-mes').onchange = () => { popularDias(); carregar(); };
  $('#rl-dia').onchange = carregar;
  $('#rl-limpar').onclick = () => {
    $('#rl-mes').value = mesAtual();
    popularDias();
    $('#rl-dia').value = '';
    carregar();
  };
  $('#rl-csv').onclick = () => {
    if (!vendas.length) { toast('Nenhuma venda para exportar neste período.', 'erro'); return; }
    const url = URL.createObjectURL(new Blob([csvRelatorio(vendas)], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendas-${mes()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  popularDias();
  carregar();
  return () => { pedido++; };
}
