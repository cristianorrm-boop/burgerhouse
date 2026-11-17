// Pedidos em tempo real (kanban): aceitar, avançar status, cancelar, imprimir.
import { db } from '../db.js?v=2.0.0-f3';
import { store, onStore } from './app.js?v=2.0.0-f3';
import { rotuloPedido, mesaDoPedido, filtroHistorico, valorLinhaItem } from '../nucleo/pedidos.js?v=2.0.0-f3';
import { proximoStatus, rotuloAcao, mudarStatus, cancelar, imprimir, enderecoTexto, pagamentoTexto, statusBadge, mesasPorId } from './acoes.js?v=2.0.0-f3';
import { moeda, esc, TIPOS, tempoDesde, dataHoraBR, horaBR, mascaraTelefone, modal, confirmar, toast, inicioDoDia, soDigitos } from '../utils.js?v=2.0.0-f3';

const COLUNAS = [
  ['novo', 'Novos', s => s === 'novo'],
  ['preparo', 'Em preparo', s => s === 'preparo'],
  ['pronto', 'Prontos / em entrega', s => s === 'pronto' || s === 'entrega'],
  ['fim', 'Finalizados hoje', s => s === 'entregue' || s === 'cancelado']
];

export function render(el) {
  let filtro = 'todos';
  el.innerHTML = `
    <div class="opcoes" id="abas-ped" style="margin-bottom:12px">
      <label class="opcao"><input type="radio" name="ap" value="kanban" checked><span>Pedidos</span></label>
      <label class="opcao"><input type="radio" name="ap" value="hist"><span>Histórico</span></label>
    </div>
    <div id="hist" class="oculto"></div>
    <div id="vista-kanban">
    <div class="barra-acoes">
      <div class="opcoes" id="filtro-tipo">
        ${[['todos', 'Todos'], ['delivery', 'Delivery'], ['retirada', 'Retirada'], ['mesa', 'Mesa']].map(([v, n], i) =>
          `<label class="opcao"><input type="radio" name="ft" value="${v}" ${i === 0 ? 'checked' : ''}><span>${n}</span></label>`).join('')}
      </div>
    </div>
    <div class="kanban" id="kanban"></div>
    </div>`;
  el.querySelector('#abas-ped').onchange = e => {
    const h = e.target.value === 'hist';
    el.querySelector('#vista-kanban').classList.toggle('oculto', h);
    el.querySelector('#hist').classList.toggle('oculto', !h);
    if (h) historico(el.querySelector('#hist'));
  };

  el.querySelector('#filtro-tipo').onchange = e => { filtro = e.target.value; desenhar(); };

  function desenhar() {
    const hoje = inicioDoDia();
    const lista = store.pedidos.filter(p => filtro === 'todos' || p.tipo === filtro);
    el.querySelector('#kanban').innerHTML = COLUNAS.map(([k, nome, f]) => {
      const ps = lista.filter(p => f(p.status) && (k !== 'fim' || p.criadoEm >= hoje));
      if (k !== 'fim') ps.sort((a, b) => a.criadoEm - b.criadoEm);
      return `<div class="coluna">
        <div class="coluna-cab"><span>${nome}</span><span class="badge">${ps.length}</span></div>
        ${ps.map(cartao).join('') || '<p class="vazio" style="padding:20px 0;font-size:13px">Nenhum pedido</p>'}
      </div>`;
    }).join('');
  }

  function cartao(p) {
    const min = (Date.now() - p.criadoEm) / 60000;
    const ativo = !['entregue', 'cancelado'].includes(p.status);
    const prox = proximoStatus(p);
    return `<div class="ped ${p.status === 'novo' ? 'novo' : ''}" data-id="${p.id}">
      <div class="ped-cab"><strong>${esc(rotuloPedido(p, mesasPorId()))}</strong>
        <span class="badge ${p.tipo === 'mesa' ? 'badge-info' : p.tipo === 'delivery' ? 'badge-pri' : ''}">${p.tipo === 'mesa' ? esc(mesaDoPedido(p, mesasPorId())) : TIPOS[p.tipo]}</span>
        <span class="ped-tempo ${ativo && min > 40 ? 'atraso' : ''}">${ativo ? tempoDesde(p.criadoEm) : horaBR(p.criadoEm)}</span>
      </div>
      <div class="ped-cli">${esc(p.cliente?.nome || '')}${p.endereco ? ` · ${esc(p.endereco.bairro)}` : ''}</div>
      <ul class="ped-itens">${p.itens.slice(0, 4).map(i => `<li>${i.qtd}× ${esc(i.nome)}</li>`).join('')}${p.itens.length > 4 ? `<li>+ ${p.itens.length - 4} itens</li>` : ''}</ul>
      <div class="ped-rod"><strong>${moeda(p.total)}</strong>
        ${ativo && prox ? `<button class="btn btn-s ${p.status === 'novo' ? 'btn-pri' : ''}" data-avancar="${p.id}">${rotuloAcao[prox]}</button>` : statusBadge(p.status)}
      </div>
    </div>`;
  }

  el.addEventListener('click', async e => {
    const av = e.target.closest('[data-avancar]');
    if (av) {
      e.stopPropagation();
      const p = store.pedidos.find(x => x.id === av.dataset.avancar);
      av.disabled = true;
      await mudarStatus(p, proximoStatus(p));
      return;
    }
    const c = e.target.closest('.ped');
    if (c) detalhe(c.dataset.id);
  });

  desenhar();
  const parar = onStore(desenhar);
  const relogio = setInterval(desenhar, 30000);
  // abre direto um pedido: #/pedidos?id=...
  const idHash = new URLSearchParams(location.hash.split('?')[1]).get('id');
  if (idHash) setTimeout(() => detalhe(idHash), 100);
  return () => { parar(); clearInterval(relogio); };
}

export function detalhe(id, avulso = null) {
  const busca = x => store.pedidos.find(p => p.id === x) || (avulso?.id === x ? avulso : undefined);
  // pedido antigo (fora de store.pedidos) não atualiza sozinho: relê do banco depois de cada ação
  const reler = async () => {
    if (!avulso || store.pedidos.some(x => x.id === id)) return;
    const novo = await db.get('pedidos', id);
    if (!novo) return;
    avulso = novo;
    document.dispatchEvent(new CustomEvent('pedido-atualizado', { detail: novo }));
  };
  const p0 = busca(id);
  if (!p0) return;
  let parar = null;
  const m = modal('<div id="det"></div>', { classe: 'modal-g', aoFechar: () => parar?.() });
  const desenhar = () => {
    const p = busca(id);
    if (!p) return;
    const prox = proximoStatus(p);
    const ativo = !['entregue', 'cancelado'].includes(p.status);
    const tel = soDigitos(p.cliente?.telefone);
    m.el.querySelector('#det').innerHTML = `
      <h2>Pedido ${esc(rotuloPedido(p, mesasPorId()))} ${statusBadge(p.status)}</h2>
      <div class="det-grade">
        <div><small>Tipo</small>${p.tipo === 'mesa' ? esc(mesaDoPedido(p, mesasPorId())) : TIPOS[p.tipo]}</div>
        <div><small>Recebido</small>${dataHoraBR(p.criadoEm)}</div>
        <div><small>Cliente</small>${esc(p.cliente?.nome || '—')}${tel ? `<br><a href="https://wa.me/55${tel}" target="_blank" rel="noopener">${esc(mascaraTelefone(tel))}</a>` : ''}</div>
        <div><small>Pagamento</small>${esc(pagamentoTexto(p))}</div>
        ${p.endereco ? `<div style="grid-column:1/-1"><small>Endereço</small>${esc(enderecoTexto(p.endereco))}</div>` : ''}
        ${p.obs ? `<div style="grid-column:1/-1"><small>Observação</small>${esc(p.obs)}</div>` : ''}
        ${p.motivoCancelamento ? `<div style="grid-column:1/-1"><small>Motivo do cancelamento</small>${esc(p.motivoCancelamento)}</div>` : ''}
      </div>
      <table class="tabela">
        ${p.itens.map(i => `<tr><td><strong>${i.qtd}×</strong> ${esc(i.nome)}
          ${i.adicionais?.length ? `<br><small style="color:var(--txt2)">+ ${i.adicionais.map(a => esc(a.nome)).join(', ')}</small>` : ''}
          ${i.obs ? `<br><small style="color:var(--warn)">Obs.: ${esc(i.obs)}</small>` : ''}</td>
          <td class="num">${moeda(valorLinhaItem(i))}</td></tr>`).join('')}
        <tr><td>Subtotal</td><td class="num">${moeda(p.subtotal)}</td></tr>
        ${p.taxa ? `<tr><td>Taxa de entrega</td><td class="num">${moeda(p.taxa)}</td></tr>` : ''}
        ${p.desconto ? `<tr><td>Cupom ${esc(p.cupom || '')}</td><td class="num">− ${moeda(p.desconto)}</td></tr>` : ''}
        ${p.descontoFidelidade ? `<tr><td>Recompensa fidelidade</td><td class="num">− ${moeda(p.descontoFidelidade)}</td></tr>` : ''}
        <tr><td><strong>Total</strong></td><td class="num"><strong>${moeda(p.total)}</strong></td></tr>
      </table>
      <div class="linha-btns">
        ${store.user?.perfil === 'dono' ? '<button class="btn btn-ghost" data-excluir style="color:var(--danger)"><i class="ti ti-trash"></i>Excluir pedido</button>' : ''}
        ${ativo ? '<button class="btn btn-ghost" data-cancelar style="color:var(--danger);margin-right:auto"><i class="ti ti-x"></i>Cancelar pedido</button>' : ''}
        <button class="btn" data-imprimir><i class="ti ti-printer"></i>Imprimir</button>
        ${ativo && prox ? `<button class="btn btn-pri" data-prox>${rotuloAcao[prox]}</button>` : ''}
      </div>`;
    const el = m.el;
    el.querySelector('[data-imprimir]').onclick = () => imprimir(p);
    el.querySelector('[data-prox]')?.addEventListener('click', async () => {
      await mudarStatus(p, prox);
      await reler();
      desenhar();
      if (prox === 'entregue') m.fechar();
    });
    el.querySelector('[data-excluir]')?.addEventListener('click', async () => {
      if (!await confirmar(`Excluir o pedido ${rotuloPedido(p, mesasPorId())} de vez? Isso não pode ser desfeito.`, { ok: 'Excluir', perigo: true })) return;
      await db.remove('pedidos', p.id);
      toast('Pedido excluído');
      m.fechar();
      document.dispatchEvent(new CustomEvent('pedido-excluido', { detail: p.id }));
    });
    el.querySelector('[data-cancelar]')?.addEventListener('click', () => {
      const c = modal(`<h2>Cancelar pedido ${esc(rotuloPedido(p, mesasPorId()))}</h2>
        <label class="campo"><span>Motivo (o cliente verá esta mensagem)</span>
        <select id="mot"><option>Produto em falta</option><option>Fora da área de entrega</option><option>Loja fechando</option><option>Solicitado pelo cliente</option><option>Outro</option></select></label>
        <div class="linha-btns"><button class="btn" data-n>Voltar</button><button class="btn btn-perigo" data-s>Cancelar pedido</button></div>`, { classe: 'modal-p' });
      c.el.querySelector('[data-n]').onclick = c.fechar;
      c.el.querySelector('[data-s]').onclick = async () => { await cancelar(p, c.el.querySelector('#mot').value); await reler(); c.fechar(); m.fechar(); };
    });
  };
  desenhar();
  parar = onStore(desenhar);
}

/* ================= Histórico ================= */
const DIA = 86400e3;
function historico(box) {
  if (box.dataset.pronto) return;
  box.dataset.pronto = '1';
  const hoje = inicioDoDia();
  let periodo = '30', dados = [];
  const isoParaMs = (v, fimDoDia) => v ? new Date(v + 'T00:00:00').getTime() + (fimDoDia ? DIA : 0) : null;
  box.innerHTML = `
    <div class="barra-acoes">
      <div class="opcoes" id="h-per">
        ${[['0', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['x', 'De–Até']].map(([v, n]) =>
          `<label class="opcao"><input type="radio" name="hp" value="${v}" ${v === periodo ? 'checked' : ''}><span>${n}</span></label>`).join('')}
      </div>
      <span id="h-datas" class="oculto"><input type="date" id="h-de" aria-label="De"> <input type="date" id="h-ate" aria-label="Até"></span>
      <input type="search" id="h-busca" placeholder="Buscar cliente, mesa ou número" style="flex:1;min-width:180px">
    </div>
    <div id="h-tab"></div>`;
  const intervalo = () => {
    if (periodo === 'x') {
      const ini = isoParaMs(box.querySelector('#h-de').value, false);
      const fim = isoParaMs(box.querySelector('#h-ate').value, true);
      return { ini: ini ?? 0, fim: fim ?? Date.now() + DIA };
    }
    return { ini: hoje - Number(periodo) * DIA, fim: Date.now() + DIA };
  };
  const desenhar = () => {
    const lista = filtroHistorico(dados, { ...intervalo(), busca: box.querySelector('#h-busca').value }, mesasPorId());
    box.querySelector('#h-tab').innerHTML = lista.length ? `<table class="tabela">
      <tr><th>Data</th><th>Pedido</th><th>Tipo</th><th>Cliente / mesa</th><th class="num">Total</th><th>Status</th></tr>
      ${lista.map(p => `<tr data-id="${p.id}" style="cursor:pointer"><td>${dataHoraBR(p.criadoEm)}</td>
        <td>${esc(rotuloPedido(p, mesasPorId()))}</td><td>${TIPOS[p.tipo] || esc(p.tipo || '')}</td>
        <td>${esc(p.tipo === 'mesa' ? mesaDoPedido(p, mesasPorId()) : (p.cliente?.nome || '—'))}</td>
        <td class="num">${moeda(p.total)}</td><td>${statusBadge(p.status)}</td></tr>`).join('')}</table>`
      : '<p class="vazio">Nenhum pedido neste período.</p>';
  };
  const carregar = async () => {
    const { ini, fim } = intervalo();
    box.querySelector('#h-tab').innerHTML = '<p class="vazio">Carregando…</p>';
    try {
      dados = await db.list('pedidos', { where: [['criadoEm', '>=', ini], ['criadoEm', '<', fim]], orderBy: ['criadoEm', 'desc'] });
    } catch (e) { console.error(e); dados = []; toast('Não foi possível carregar o histórico', 'erro'); }
    desenhar();
  };
  box.querySelector('#h-per').onchange = e => {
    periodo = e.target.value;
    box.querySelector('#h-datas').classList.toggle('oculto', periodo !== 'x');
    carregar();
  };
  box.querySelector('#h-de').onchange = box.querySelector('#h-ate').onchange = carregar;
  box.querySelector('#h-busca').oninput = desenhar;
  box.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) detalhe(tr.dataset.id, dados.find(x => x.id === tr.dataset.id));
  });
  document.addEventListener('pedido-atualizado', e => { dados = dados.map(p => p.id === e.detail.id ? e.detail : p); desenhar(); });
  document.addEventListener('pedido-excluido', e => { dados = dados.filter(p => p.id !== e.detail); desenhar(); });
  carregar();
}
