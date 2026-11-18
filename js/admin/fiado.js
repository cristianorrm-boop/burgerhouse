// Pagamento a Prazo (fiado): lista das vendas a prazo, registro de pagamentos parciais e recibo.
import { db } from '../db.js?v=2.0.2';
import { store } from './app.js?v=2.0.2';
import { moeda, esc, toast, modal, confirmar, hojeISO } from '../utils.js?v=2.0.2';
import { msDe } from '../nucleo/faturamento.js?v=2.0.2';
import { saldoFiado, quitado, aplicarPagamentoFiado, filtrarFiados } from '../nucleo/fiado.js?v=2.0.2';
import { imprimirRecibo, compartilharRecibo } from './recibo.js?v=2.0.2';

export function render(el) {
  let vendas = [];
  let carregou = false;
  const ehDono = () => store.user?.perfil === 'dono';

  el.innerHTML = `
    <div class="metricas">
      <div class="card metrica"><small><i class="ti ti-hand-finger"></i>Em aberto</small><strong id="fi-qtd">–</strong></div>
      <div class="card metrica"><small><i class="ti ti-cash"></i>Total a receber</small><strong id="fi-total">–</strong></div>
    </div>
    <div class="barra-acoes">
      <select class="inp" id="fi-filtro" aria-label="Filtrar pagamentos a prazo">
        <option value="aberto">Em aberto</option><option value="quitado">Pagos</option><option value="todos">Todos</option>
      </select>
    </div>
    <div class="card tabela-wrap"><table class="tabela">
      <thead><tr><th>Cliente</th><th>Data da venda</th><th>Itens</th><th class="num">Total</th><th class="num">Pago</th><th class="num">Deve</th><th>Status</th><th class="acoes">Ações</th></tr></thead>
      <tbody id="fi-tb"></tbody></table></div>`;

  const $ = s => el.querySelector(s);
  const filtro = $('#fi-filtro');

  function desenhar() {
    const abertos = vendas.filter(v => v.fiado === true && !quitado(v));
    $('#fi-qtd').textContent = abertos.length;
    $('#fi-total').textContent = moeda(abertos.reduce((s, v) => s + saldoFiado(v), 0));
    const lista = filtrarFiados(vendas, filtro.value);
    const dono = ehDono();
    $('#fi-tb').innerHTML = !carregou ? '<tr><td colspan="8"><div class="spinner"></div></td></tr>'
      : lista.length ? lista.map(v => {
        const t = msDe(v.criadoEm);
        const saldo = saldoFiado(v);
        const pago = quitado(v);
        const itens = (v.itens || []).map(i => `${Number(i.qtd) || 1}x ${i.nome ?? ''}`).join(', ');
        const id = esc(v.id);
        return `<tr>
          <td><strong>${esc(v.cliente || '–')}</strong></td>
          <td>${t !== null ? new Date(t).toLocaleDateString('pt-BR') : '–'}</td>
          <td class="pdv-col-itens">${esc(itens)}</td>
          <td class="num"><strong>${moeda(v.total)}</strong></td>
          <td class="num">${moeda(v.valorPago)}</td>
          <td class="num"><strong style="color:var(${pago ? '--ok' : '--danger'})">${moeda(saldo)}</strong></td>
          <td>${pago ? '<span class="badge badge-ok">Pago</span>' : '<span class="badge badge-warn">A Prazo</span>'}</td>
          <td class="acoes">
            ${pago ? '' : `<button class="btn btn-ok btn-s" data-pagar="${id}" title="Registrar pagamento" aria-label="Registrar pagamento"><i class="ti ti-cash"></i></button>`}
            <button class="btn btn-ghost btn-s" data-recibo="imprimir" data-id="${id}" title="Imprimir recibo" aria-label="Imprimir recibo"><i class="ti ti-printer"></i></button>
            <button class="btn btn-ghost btn-s" data-recibo="whatsapp" data-id="${id}" title="Enviar recibo pelo WhatsApp" aria-label="Enviar recibo pelo WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>
            ${dono ? `<button class="btn btn-ghost btn-s" data-excluir="${id}" title="Excluir venda" aria-label="Excluir venda" style="color:var(--danger)"><i class="ti ti-trash"></i></button>` : ''}
          </td></tr>`;
      }).join('') : '<tr><td colspan="8"><div class="vazio"><i class="ti ti-hand-finger"></i>Nenhum pagamento a prazo encontrado.</div></td></tr>';
  }

  function abrirPagamento(venda) {
    const saldo = saldoFiado(venda);
    const m = modal(`<h2>Registrar pagamento</h2>
      <p class="sub">${esc(venda.cliente || 'Cliente')} — deve ${moeda(saldo)}</p>
      <label class="campo"><span>Valor pago (R$)</span><input class="inp" id="fp-valor" type="number" inputmode="decimal" step="0.01" min="0.01" value="${saldo.toFixed(2)}"></label>
      <label class="campo"><span>Data do pagamento</span><input class="inp" id="fp-data" type="date" value="${hojeISO()}"></label>
      <div class="linha-btns"><button class="btn" data-n>Cancelar</button><button class="btn btn-ok" data-s><i class="ti ti-check"></i>Registrar</button></div>`,
    { classe: 'modal-p' });
    const btn = m.el.querySelector('[data-s]');
    m.el.querySelector('[data-n]').onclick = () => m.fechar();
    btn.onclick = async () => {
      const valor = Number(String(m.el.querySelector('#fp-valor').value).replace(',', '.'));
      const data = m.el.querySelector('#fp-data').value;
      const pre = aplicarPagamentoFiado(venda, valor, data);
      if (pre.erro) { toast(pre.erro, 'erro'); return; }
      btn.disabled = true;
      try {
        // Relê a venda dentro da transação: dois pagamentos ao mesmo tempo não se atropelam.
        const r = await db.transacao(async t => {
          const atual = await t.get('vendas', venda.id);
          const res = aplicarPagamentoFiado(atual, valor, data);
          if (res.erro) return res;
          t.update('vendas', venda.id, { valorPago: res.valorPago, pagamentosFiado: res.pagamentosFiado });
          return res;
        });
        if (r.erro) { toast(r.erro, 'erro'); btn.disabled = false; return; }
        toast(r.quitado ? 'Pagamento registrado — dívida quitada!' : 'Pagamento registrado. Ainda falta receber.');
        m.fechar();
      } catch (e) {
        console.error('Falha ao registrar pagamento', e);
        toast('Não foi possível registrar o pagamento. Tente de novo.', 'erro');
        btn.disabled = false;
      }
    };
  }

  filtro.onchange = desenhar;
  $('#fi-tb').onclick = async ev => {
    const achar = id => vendas.find(x => x.id === id);
    const p = ev.target.closest('[data-pagar]');
    if (p) { const v = achar(p.dataset.pagar); if (v) abrirPagamento(v); return; }
    const r = ev.target.closest('[data-recibo]');
    if (r) { const v = achar(r.dataset.id); if (v) (r.dataset.recibo === 'imprimir' ? imprimirRecibo : compartilharRecibo)(v); return; }
    const b = ev.target.closest('[data-excluir]');
    if (!b || !ehDono()) return;
    if (!(await confirmar('Excluir esta venda? Esta ação não pode ser desfeita.', { ok: 'Excluir', perigo: true }))) return;
    try {
      await db.remove('vendas', b.dataset.excluir);
      toast('Venda excluída.');
    } catch (e) {
      console.error('Falha ao excluir venda', e);
      toast('Não foi possível excluir a venda.', 'erro');
    }
  };

  desenhar();
  const parar = db.watch('vendas', { where: [['fiado', '==', true]] }, l => { vendas = l; carregou = true; desenhar(); });
  return () => parar();
}
