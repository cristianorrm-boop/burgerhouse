// PDV (balcão): grade de produtos com leitor de código de barras, carrinho, cupom, pagamento a prazo,
// pagamento dividido, troco e as vendas de hoje em tempo real. A venda é gravada no formato da V1.
import { db, inc } from '../db.js?v=2.0.0';
import { store } from './app.js?v=2.0.0';
import { moeda, esc, toast, modal, confirmar, bip, hojeISO, horaBR, inicioDoDia } from '../utils.js?v=2.0.0';
import { msDe } from '../nucleo/faturamento.js?v=2.0.0';
import {
  ROTULOS_PDV, adicionarAoCarrinho, alterarQtd, removerLinha, precoUnitario, subtotalCarrinho, descontoPDV,
  validarCupomPDV, pagamentosPDV, dinheiroNecessario, montarVendaPDV, validarVendaPDV, produtoPorCodigo, novoIdVendaPDV,
  vendasNovasDeOutroAparelho
} from '../nucleo/pdv.js?v=2.0.0';
import { saldoFiado } from '../nucleo/fiado.js?v=2.0.0';
import { origemVenda } from '../nucleo/relatorio.js?v=2.0.0';
import { imprimirRecibo, compartilharRecibo } from './recibo.js?v=2.0.0';

const urlSegura = u => String(u || '').replace(/["'()\\\s]/g, '');
const numero = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const precoVitrine = p => (Number(p.precoPromo) > 0 && Number(p.precoPromo) < Number(p.preco) ? Number(p.precoPromo) : Number(p.preco) || 0);
const OPCOES_FORMA = sel => [['dinheiro', 'Dinheiro'], ['pix', 'Pix'], ['debito', 'Cartão de débito'], ['credito', 'Cartão de crédito']]
  .map(([k, n]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${n}</option>`).join('');

export function render(el) {
  const E = { prods: [], adic: {}, vendas: [] };
  let carrinho = [];
  let cupom = null;      // cupom aplicado (documento de cupons)
  let idVenda = null;    // id da venda deste carrinho: gerado uma vez, mantido até gravar com sucesso
  let salvando = false;
  const minhas = new Set();       // vendas gravadas por esta aba (não tocam o aviso)
  const conhecidas = new Set();   // vendas já vistas
  let primeiraCarga = true;
  const abertura = Date.now();

  el.innerHTML = `
    <div class="metricas">
      <div class="card metrica"><small><i class="ti ti-receipt-2"></i>Vendas hoje</small><strong id="pdv-qtd">–</strong></div>
      <div class="card metrica ok"><small><i class="ti ti-cash"></i>Total vendido hoje</small><strong id="pdv-total-dia">–</strong></div>
    </div>
    <div class="pdv-layout">
      <section class="card pdv-produtos">
        <input id="pdv-busca" class="inp" type="search" autocomplete="off" placeholder="Buscar produto ou passar o leitor de código de barras" aria-label="Buscar produto ou código de barras">
        <div class="pdv-grade" id="pdv-grade"><div class="spinner"></div></div>
      </section>
      <aside class="card pdv-carrinho" aria-label="Venda atual">
        <h2><i class="ti ti-shopping-cart"></i>Venda atual</h2>
        <div id="pdv-itens"></div>
        <div class="pdv-cupom">
          <input id="pdv-cupom" class="inp" placeholder="Código do cupom" autocomplete="off" style="text-transform:uppercase" aria-label="Código do cupom">
          <button class="btn" data-aplicar-cupom>Aplicar</button>
        </div>
        <div id="pdv-cupom-ok"></div>
        <label class="campo"><span>Desconto manual (R$)</span><input id="pdv-desc" type="number" min="0" step="0.01" placeholder="0,00" inputmode="decimal"></label>
        <label class="pdv-check"><input type="checkbox" id="pdv-fiado"><i class="ti ti-heart-handshake"></i>Pagamento a Prazo (cliente paga depois)</label>
        <div id="pdv-area-pag">
          <label class="campo"><span>Forma de pagamento</span><select id="pdv-forma1">${OPCOES_FORMA('dinheiro')}</select></label>
          <label class="pdv-check"><input type="checkbox" id="pdv-dividir">Dividir em 2 formas de pagamento</label>
          <div id="pdv-area-2" hidden>
            <div class="grade2">
              <label class="campo"><span>2ª forma de pagamento</span><select id="pdv-forma2">${OPCOES_FORMA('credito')}</select></label>
              <label class="campo"><span>Valor pago na 2ª forma (R$)</span><input id="pdv-valor2" type="number" min="0" step="0.01" placeholder="0,00" inputmode="decimal"></label>
            </div>
          </div>
          <div id="pdv-area-dinheiro" hidden>
            <label class="campo"><span>Valor recebido em dinheiro (R$)</span><input id="pdv-recebido" type="number" min="0" step="0.01" placeholder="0,00" inputmode="decimal"></label>
            <div class="pdv-linha forte"><span>Troco</span><span id="pdv-troco">R$ 0,00</span></div>
          </div>
        </div>
        <div class="pdv-aviso-fiado" id="pdv-aviso-fiado" hidden><i class="ti ti-info-circle"></i>
          <span>Essa venda vai ficar registrada como pagamento a prazo, sem pagamento agora. Informe o nome do cliente pra não perder o controle.</span></div>
        <label class="campo"><span id="pdv-cliente-rot">Cliente (opcional)</span><input id="pdv-cliente" maxlength="80" placeholder="Nome do cliente" autocomplete="off"></label>
        <div class="pdv-totais">
          <div class="pdv-linha"><span>Subtotal</span><span id="pdv-subtotal">R$ 0,00</span></div>
          <div class="pdv-linha"><span>Desconto</span><span id="pdv-desconto">R$ 0,00</span></div>
          <div class="pdv-linha total"><span>Total</span><span id="pdv-total">R$ 0,00</span></div>
          <div id="pdv-divisao"></div>
        </div>
        <button class="btn btn-pri btn-l btn-bloco" id="pdv-finalizar"></button>
        <button class="btn btn-ghost btn-bloco" data-limpar><i class="ti ti-eraser"></i>Limpar carrinho</button>
        <p class="pdv-atalhos">Atalhos: <kbd>F2</kbd> buscar · <kbd>F4</kbd> finalizar · <kbd>Esc</kbd> limpar</p>
      </aside>
    </div>
    <section class="card painel pdv-historico">
      <div class="painel-cab"><h2><i class="ti ti-history"></i> Vendas de hoje</h2></div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Horário</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th class="num">Total</th><th class="acoes">Ações</th></tr></thead>
        <tbody id="pdv-vendas"><tr><td colspan="6"><div class="spinner"></div></td></tr></tbody>
      </table></div>
    </section>`;

  const $ = s => el.querySelector(s);
  const busca = $('#pdv-busca');
  const btnFinalizar = $('#pdv-finalizar');
  const ponteiroFino = window.matchMedia?.('(pointer: fine)').matches;
  const focarBusca = () => { if (ponteiroFino) busca.focus(); };

  /* ---------- Grade de produtos ---------- */
  const gruposDe = p => (p.adicionais || []).map(id => E.adic[id]).filter(g => g?.nome);

  function desenharGrade() {
    const q = semAcento(busca.value.trim());
    const lista = E.prods.filter(p => p.disponivel !== false && (!q || semAcento(p.nome).includes(q)));
    $('#pdv-grade').innerHTML = lista.length ? lista.map(p => `
      <button type="button" class="pdv-prod" data-prod="${esc(p.id)}">
        <span class="pdv-prod-foto" style="${p.foto ? `background-image:url('${urlSegura(p.foto)}')` : ''}">${p.foto ? '' : esc(p.emoji || '🍽️')}</span>
        ${gruposDe(p).length ? '<span class="pdv-prod-adic" title="Tem adicionais"><i class="ti ti-plus"></i></span>' : ''}
        <span class="pdv-prod-nome">${esc(p.nome)}</span>
        <span class="pdv-prod-preco">${moeda(precoVitrine(p))}</span>
      </button>`).join('')
      : '<div class="vazio" style="grid-column:1/-1"><i class="ti ti-box-off"></i>Nenhum produto encontrado.</div>';
  }

  function escolherProduto(p) {
    if (salvando) { toast('Aguarde: a venda anterior ainda está sendo salva.', 'erro'); return; }
    if (gruposDe(p).length) abrirAdicionais(p);
    else adicionar(p, [], '');
  }

  function adicionar(p, adicionais, observacao) {
    if (salvando) { toast('Aguarde: a venda anterior ainda está sendo salva.', 'erro'); return; }
    carrinho = adicionarAoCarrinho(carrinho, p, adicionais, observacao);
    atualizarCarrinho();
    focarBusca();
  }

  /** Modal de adicionais: respeita mínimo e máximo de cada grupo (igual ao cardápio do cliente). */
  function abrirAdicionais(p) {
    const grupos = (p.adicionais || []).map(id => ({ id, ...E.adic[id] })).filter(g => g.nome);
    const m = modal(`
      <h2>${esc(p.nome)}</h2>
      <p style="color:var(--txt2);margin:2px 0 6px">${moeda(precoVitrine(p))}</p>
      ${grupos.map(g => `
        <div class="pdv-grupo" data-grupo="${esc(g.id)}">
          <div class="pdv-grupo-cab">
            <div><strong>${esc(g.nome)}</strong>
            <small>${g.min > 0 ? `Escolha ${g.min === g.max ? g.min : `de ${g.min} a ${g.max}`}` : g.max ? `Até ${g.max} ${g.max > 1 ? 'opções' : 'opção'}` : 'Opcional'}</small></div>
            ${g.min > 0 ? '<span class="badge badge-pri">Obrigatório</span>' : ''}
          </div>
          ${(g.opcoes || []).map((o, i) => `
            <label class="pdv-adic">
              <span class="an">${esc(o.nome)}</span>
              ${Number(o.preco) ? `<span class="ap">+ ${moeda(o.preco)}</span>` : ''}
              <input type="${g.max === 1 ? 'radio' : 'checkbox'}" name="g_${esc(g.id)}" value="${i}">
            </label>`).join('')}
        </div>`).join('')}
      <label class="campo" style="margin-top:16px"><span>Observação</span>
        <textarea id="pdv-obs" maxlength="140" placeholder="Ex.: sem cebola, maionese à parte"></textarea></label>
      <div class="linha-btns"><button class="btn" data-cancelar>Cancelar</button>
        <button class="btn btn-pri" data-confirmar><i class="ti ti-plus"></i>Adicionar <span id="pdv-adic-total"></span></button></div>`);
    const e = m.el;
    const marcados = g => [...e.querySelectorAll(`[name="g_${CSS.escape(g.id)}"]:checked`)];
    const escolhidos = () => grupos.flatMap(g => marcados(g).map(inp => {
      const o = g.opcoes[+inp.value];
      return { grupoNome: g.nome, opcaoNome: o.nome, preco: Number(o.preco) || 0 };
    }));
    const atualizar = () => {
      grupos.forEach(g => {
        if (g.max > 1) {
          const n = marcados(g).length;
          e.querySelectorAll(`[name="g_${CSS.escape(g.id)}"]:not(:checked)`).forEach(i => { i.disabled = n >= g.max; });
        }
      });
      e.querySelector('#pdv-adic-total').textContent = '· ' + moeda(precoVitrine(p) + escolhidos().reduce((s, a) => s + a.preco, 0));
    };
    atualizar();
    e.addEventListener('change', () => { e.querySelectorAll('.pdv-grupo').forEach(g => { g.style.outline = ''; }); atualizar(); });
    e.querySelector('[data-cancelar]').onclick = m.fechar;
    e.querySelector('[data-confirmar]').onclick = () => {
      for (const g of grupos) {
        if (marcados(g).length < (g.min || 0)) {
          const box = e.querySelector(`[data-grupo="${CSS.escape(g.id)}"]`);
          box.style.outline = '2px solid var(--danger)';
          box.scrollIntoView({ behavior: 'smooth', block: 'center' });
          toast(`Escolha uma opção em “${g.nome}”`, 'erro');
          return;
        }
      }
      const obs = e.querySelector('#pdv-obs').value;
      m.fechar();
      adicionar(p, escolhidos(), obs);
    };
  }

  $('#pdv-grade').onclick = ev => {
    const b = ev.target.closest('[data-prod]');
    const p = b && E.prods.find(x => x.id === b.dataset.prod);
    if (p) escolherProduto(p);
  };
  busca.oninput = desenharGrade;
  // Leitor de código de barras: "digita" o código e manda Enter
  busca.onkeydown = ev => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const codigo = busca.value.trim();
    if (!codigo) return;
    if (salvando) { toast('Aguarde: a venda anterior ainda está sendo salva.', 'erro'); return; } // o código fica no campo
    const p = produtoPorCodigo(E.prods, codigo);
    busca.value = '';
    desenharGrade();
    if (p) {
      escolherProduto(p);
      toast(`${p.nome} adicionado!`);
    } else {
      toast('Código de barras não encontrado.', 'erro');
      busca.focus();
    }
  };

  /* ---------- Carrinho ---------- */
  const fiado = () => $('#pdv-fiado').checked;
  const dividir = () => $('#pdv-dividir').checked;

  function calculo() {
    const subtotal = subtotalCarrinho(carrinho);
    const desconto = descontoPDV({ subtotal, manual: numero($('#pdv-desc').value), cupom });
    const total = Math.round((subtotal - desconto) * 100) / 100;
    const pagamentos = fiado() ? [] : pagamentosPDV({
      total, forma1: $('#pdv-forma1').value, dividir: dividir(), forma2: $('#pdv-forma2').value, valor2: numero($('#pdv-valor2').value)
    });
    return { subtotal, desconto, total, pagamentos, recebido: numero($('#pdv-recebido').value) };
  }

  function rotuloBotao() {
    btnFinalizar.innerHTML = salvando ? '<i class="ti ti-loader-2"></i>Salvando…'
      : fiado() ? '<i class="ti ti-heart-handshake"></i>Registrar pagamento a prazo' : '<i class="ti ti-check"></i>Finalizar venda';
  }

  function atualizarCarrinho() {
    $('#pdv-itens').innerHTML = carrinho.length ? carrinho.map((l, i) => `
      <div class="pdv-item">
        <div class="pdv-item-info">
          <strong>${esc(l.nome)}</strong>
          ${l.adicionais.length ? `<small>+ ${esc(l.adicionais.map(a => a.opcaoNome).join(', '))}</small>` : ''}
          ${l.observacao ? `<small>Obs: ${esc(l.observacao)}</small>` : ''}
          <small>${moeda(precoUnitario(l))} un.</small>
        </div>
        <div class="pdv-qtd">
          <button type="button" data-menos="${i}" aria-label="Diminuir">−</button><span>${l.qtd}</span><button type="button" data-mais="${i}" aria-label="Aumentar">+</button>
        </div>
        <strong class="pdv-item-total">${moeda(precoUnitario(l) * l.qtd)}</strong>
        <button type="button" class="btn btn-ghost btn-s pdv-rem" data-rem="${i}" aria-label="Remover ${esc(l.nome)}"><i class="ti ti-trash"></i></button>
      </div>`).join('')
      : '<div class="pdv-vazio">Carrinho vazio. Clique em um produto para adicionar.</div>';

    const c = calculo();
    $('#pdv-subtotal').textContent = moeda(c.subtotal);
    $('#pdv-desconto').textContent = moeda(c.desconto);
    $('#pdv-total').textContent = moeda(c.total);
    $('#pdv-cupom-ok').innerHTML = cupom ? `<div class="pdv-cupom-aplicado"><span><i class="ti ti-discount-2"></i>Cupom <strong>${esc(cupom.id)}</strong> aplicado</span>
      <button type="button" class="btn btn-ghost btn-s" data-tirar-cupom aria-label="Remover cupom"><i class="ti ti-x"></i></button></div>` : '';

    const f = fiado();
    $('#pdv-area-pag').hidden = f;
    $('#pdv-aviso-fiado').hidden = !f;
    $('#pdv-area-2').hidden = !dividir();
    $('#pdv-cliente-rot').textContent = f ? 'Cliente *' : 'Cliente (opcional)';
    rotuloBotao();

    $('#pdv-divisao').innerHTML = !f && dividir()
      ? c.pagamentos.map(p => `<div class="pdv-linha sub"><span>${esc(ROTULOS_PDV[p.forma] || p.forma)}</span><span>${moeda(p.valor)}</span></div>`).join('') : '';

    const cash = f ? 0 : dinheiroNecessario(c.pagamentos);
    $('#pdv-area-dinheiro').hidden = !(cash > 0);
    if (cash > 0) {
      const troco = Math.round((c.recebido - cash) * 100) / 100;
      const t = $('#pdv-troco');
      const falta = c.recebido > 0 && troco < 0;
      t.textContent = falta ? `faltam ${moeda(-troco)}` : moeda(Math.max(troco, 0));
      t.style.color = falta ? 'var(--danger)' : 'var(--ok)';
    }
  }

  $('#pdv-itens').onclick = ev => {
    const b = ev.target.closest('button');
    if (!b || salvando) return;
    if (b.dataset.menos !== undefined) carrinho = alterarQtd(carrinho, +b.dataset.menos, -1);
    else if (b.dataset.mais !== undefined) carrinho = alterarQtd(carrinho, +b.dataset.mais, 1);
    else if (b.dataset.rem !== undefined) carrinho = removerLinha(carrinho, +b.dataset.rem);
    else return;
    if (!carrinho.length) idVenda = null;
    atualizarCarrinho();
  };
  el.querySelector('.pdv-carrinho').addEventListener('input', ev => { if (ev.target.id !== 'pdv-cupom' && ev.target.id !== 'pdv-cliente') atualizarCarrinho(); });
  el.querySelector('.pdv-carrinho').addEventListener('change', ev => { if (ev.target.matches('select, [type=checkbox]')) atualizarCarrinho(); });
  $('#pdv-cupom-ok').onclick = ev => { if (!salvando && ev.target.closest('[data-tirar-cupom]')) { cupom = null; $('#pdv-cupom').value = ''; atualizarCarrinho(); } };

  async function aplicarCupom() {
    const codigo = $('#pdv-cupom').value.trim().toUpperCase();
    if (!codigo || salvando) return;
    let c = null;
    try { c = await db.get('cupons', codigo); } catch (e) { console.error('Falha ao buscar cupom', e); }
    if (salvando) return; // a venda começou a gravar enquanto o cupom era buscado
    const r = validarCupomPDV(c, subtotalCarrinho(carrinho), hojeISO());
    if (!r.ok) { toast(r.erro, 'erro'); return; }
    cupom = c;
    toast('Cupom aplicado!');
    atualizarCarrinho();
  }
  $('[data-aplicar-cupom]').onclick = aplicarCupom;
  $('#pdv-cupom').onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); aplicarCupom(); } };

  function limparCarrinho() {
    carrinho = [];
    cupom = null;
    idVenda = null;
    for (const id of ['#pdv-cupom', '#pdv-desc', '#pdv-cliente', '#pdv-valor2', '#pdv-recebido']) $(id).value = '';
    $('#pdv-forma1').value = 'dinheiro';
    $('#pdv-forma2').value = 'credito';
    $('#pdv-dividir').checked = false;
    $('#pdv-fiado').checked = false;
    atualizarCarrinho();
    focarBusca();
  }
  $('[data-limpar]').onclick = () => { if (salvando) return; limparCarrinho(); busca.focus(); };

  /** Enquanto a venda grava, nada no carrinho muda (senão a limpeza do fim apagaria a próxima venda). */
  let avisoLento = null;
  function travar(sim) {
    salvando = sim;
    clearTimeout(avisoLento);
    el.querySelector('.pdv-layout').classList.toggle('pdv-salvando', sim);
    el.querySelectorAll('.pdv-carrinho input, .pdv-carrinho select, .pdv-carrinho textarea, .pdv-carrinho button')
      .forEach(x => { x.disabled = sim; });
    rotuloBotao();
    if (sim) {
      avisoLento = setTimeout(() => {
        if (salvando) btnFinalizar.innerHTML = '<i class="ti ti-wifi-off"></i>Sem conexão? A venda será enviada assim que a internet voltar.';
      }, 8000);
    }
  }

  async function finalizar() {
    if (salvando) return; // F4 repetido ou clique duplo enquanto grava
    const f = fiado();
    const cliente = $('#pdv-cliente').value.trim();
    const c = calculo();
    const erro = validarVendaPDV({ carrinho, fiado: f, cliente, pagamentos: c.pagamentos, recebido: c.recebido, dividir: !f && dividir() });
    if (erro) { toast(erro, 'erro'); return; }
    if (cupom) {
      const r = validarCupomPDV(cupom, c.subtotal, hojeISO());
      if (!r.ok) { toast(r.erro, 'erro'); return; }
    }
    // Tudo o que a venda usa é capturado antes do await: depois dele só valem estas constantes.
    const cupomId = cupom?.id || null;
    idVenda ||= novoIdVendaPDV();
    const idVendaGravando = idVenda;
    const venda = montarVendaPDV({
      carrinho, desconto: c.desconto, cupomCodigo: cupomId, fiado: f, pagamentos: c.pagamentos,
      recebido: c.recebido, cliente, agora: Date.now()
    });
    travar(true);
    try {
      minhas.add(idVendaGravando);
      await db.set('vendas', idVendaGravando, venda);
      if (cupomId) {
        try { await db.update('cupons', cupomId, { usos: inc(1) }); } catch (e) { console.error('Falha ao contar uso do cupom', cupomId, e); }
      }
      toast(f ? 'Pagamento a prazo registrado!' : 'Venda finalizada com sucesso!');
      limparCarrinho();
    } catch (e) {
      console.error('Falha ao finalizar venda', e);
      toast('Não foi possível finalizar a venda. Tente de novo.', 'erro');
    } finally {
      travar(false);
    }
  }
  btnFinalizar.onclick = finalizar;

  /* ---------- Vendas de hoje ---------- */
  const ehDono = () => store.user?.perfil === 'dono';

  function pagamentoTexto(v) {
    if (v.fiado === true) {
      const s = saldoFiado(v);
      return s > 0.004
        ? `<span class="badge badge-warn"><i class="ti ti-heart-handshake"></i>A Prazo — deve ${moeda(s)}</span>`
        : '<span class="badge badge-ok"><i class="ti ti-heart-handshake"></i>A Prazo — pago</span>';
    }
    if (Array.isArray(v.pagamentos) && v.pagamentos.length) {
      return esc(v.pagamentos.map(p => `${ROTULOS_PDV[p.forma] || p.forma || '–'} (${moeda(p.valor)})`).join(' + '));
    }
    return esc(ROTULOS_PDV[v.pagamento] || v.pagamento || '–');
  }

  const CLASSE_ORIGEM = { online: 'badge-info', mesa: 'badge-pri' };
  function seloOrigem(v) {
    const o = origemVenda(v);
    return o.tipo === 'pdv' ? '' : ` <span class="badge ${CLASSE_ORIGEM[o.tipo]}">${esc(o.rotulo)}</span>`;
  }

  function desenharVendas() {
    $('#pdv-qtd').textContent = E.vendas.length;
    $('#pdv-total-dia').textContent = moeda(E.vendas.reduce((s, v) => s + (Number(v.total) || 0), 0));
    const dono = ehDono();
    $('#pdv-vendas').innerHTML = E.vendas.length ? E.vendas.map(v => {
      const t = msDe(v.criadoEm);
      return `<tr>
        <td>${t !== null ? horaBR(t) : '–'}</td>
        <td>${esc(v.cliente || '–')}${seloOrigem(v)}</td>
        <td class="pdv-col-itens">${esc((v.itens || []).map(i => `${Number(i.qtd) || 1}x ${i.nome ?? ''}`).join(', '))}</td>
        <td>${pagamentoTexto(v)}</td>
        <td class="num"><strong>${moeda(v.total)}</strong></td>
        <td class="acoes">
          <span class="pdv-recibos">
            <button class="btn btn-ghost btn-s" data-recibo="imprimir" data-id="${esc(v.id)}" title="Imprimir recibo" aria-label="Imprimir recibo"><i class="ti ti-printer"></i></button>
            <button class="btn btn-ghost btn-s" data-recibo="whatsapp" data-id="${esc(v.id)}" title="Enviar recibo pelo WhatsApp" aria-label="Enviar recibo pelo WhatsApp"><i class="ti ti-brand-whatsapp"></i></button>
          </span>
          ${dono ? `<button class="btn btn-ghost btn-s" data-excluir="${esc(v.id)}" title="Excluir venda" aria-label="Excluir venda" style="color:var(--danger)"><i class="ti ti-trash"></i></button>` : ''}
        </td></tr>`;
    }).join('') : '<tr><td colspan="6"><div class="vazio"><i class="ti ti-cash-register"></i>Nenhuma venda registrada hoje.</div></td></tr>';
  }

  $('#pdv-vendas').onclick = async ev => {
    const r = ev.target.closest('[data-recibo]');
    if (r) {
      const venda = E.vendas.find(x => x.id === r.dataset.id);
      if (venda) (r.dataset.recibo === 'imprimir' ? imprimirRecibo : compartilharRecibo)(venda);
      return;
    }
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

  let pararVendas = () => {};
  let diaAtual = 0;
  function observarVendas() {
    pararVendas();
    diaAtual = inicioDoDia();
    primeiraCarga = true;
    pararVendas = db.watch('vendas', { where: [['criadoEm', '>=', diaAtual]], orderBy: ['criadoEm', 'desc'] }, l => {
      E.vendas = l;
      // Venda nova que não saiu desta aba = outro aparelho: som + aviso. Nunca na primeira carga, e só para
      // vendas criadas depois da abertura (o 2º snapshot do servidor pode trazer vendas antigas que o cache não tinha).
      const deFora = vendasNovasDeOutroAparelho(l, minhas, abertura - 5000, conhecidas);
      l.forEach(v => conhecidas.add(v.id));
      if (!primeiraCarga && deFora.length) { bip(1); toast('Nova venda registrada!'); }
      primeiraCarga = false;
      desenharVendas();
    });
  }

  /* ---------- Atalhos ---------- */
  function atalhos(ev) {
    if (document.querySelector('.modal-fundo')) return;
    if (ev.key === 'F2') { ev.preventDefault(); busca.focus(); busca.select(); }
    else if (ev.key === 'F4') { ev.preventDefault(); finalizar(); }
    else if (ev.key === 'Escape' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      if (carrinho.length && !salvando) limparCarrinho();
    }
  }
  document.addEventListener('keydown', atalhos);

  const pararProds = db.watch('produtos', { orderBy: ['ordem'] }, l => { E.prods = l; desenharGrade(); });
  const pararAdic = db.watch('adicionais', {}, l => { E.adic = Object.fromEntries(l.map(g => [g.id, g])); desenharGrade(); });
  observarVendas();
  // Virou o dia com a tela aberta: recomeça a lista de "hoje"
  const relogio = setInterval(() => { if (inicioDoDia() !== diaAtual) observarVendas(); }, 60000);

  atualizarCarrinho();
  focarBusca();

  return () => {
    document.removeEventListener('keydown', atalhos);
    pararProds(); pararAdic(); pararVendas();
    clearInterval(relogio);
  };
}
