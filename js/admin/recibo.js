// Recibo da venda: impressão (janela, como a comanda) e link do WhatsApp.
import { store } from './app.js?v=2.0.0';
import { moeda, esc, toast } from '../utils.js?v=2.0.0';
import { valorLinhaItem } from '../nucleo/pedidos.js?v=2.0.0';
import { textoPagamento, payloadRecibo, linkRecibo } from '../nucleo/recibo.js?v=2.0.0';

const nomeLoja = () => store.cfg?.nome || 'Loja';

export function imprimirRecibo(venda) {
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) { toast('Permita pop-ups para imprimir', 'erro'); return; }
  const p = payloadRecibo(venda, nomeLoja());
  const d = new Date(p.data);
  const dataTxt = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const linhas = (venda.itens || []).map(i => `<tr><td>${Number(i.qtd) || 1}x ${esc(i.nome)}</td><td>${moeda(valorLinhaItem(i))}</td></tr>
    ${(i.adicionais || []).map(a => `<tr><td class="s" colspan="2">+ ${esc(a.nome || a.opcaoNome)}</td></tr>`).join('')}
    ${i.observacao ? `<tr><td class="s" colspan="2">OBS: ${esc(i.observacao)}</td></tr>` : ''}`).join('');
  const pagamento = p.fiado
    ? `<div><b>PAGAMENTO A PRAZO — ${p.deve > 0.004 ? 'em aberto' : 'quitado'}</b></div>
       <table><tr><td>Pago até agora</td><td>${moeda(p.pago)}</td></tr><tr><td>Falta pagar</td><td>${moeda(p.deve)}</td></tr></table>`
    : `<div>${esc(textoPagamento(venda))}</div>
       ${p.troco != null ? `<table><tr><td>Recebido</td><td>${moeda(p.recebido)}</td></tr><tr><td>Troco</td><td>${moeda(p.troco)}</td></tr></table>` : ''}`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title>
  <style>
    @page { margin: 0; size: 80mm auto; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 4mm; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
    .c { text-align: center; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 1px 0; }
    td:last-child { text-align: right; white-space: nowrap; } .s { font-size: 11px; padding-left: 10px; }
  </style></head><body>
  <h1>${esc(p.loja)}</h1>
  <div class="c">${esc(dataTxt)}</div>
  ${p.cliente ? `<div>Cliente: ${esc(p.cliente)}</div>` : ''}
  <hr><table>${linhas}</table><hr><table>
  <tr><td>Subtotal</td><td>${moeda(p.subtotal)}</td></tr>
  ${p.desconto ? `<tr><td>Desconto${p.cupom ? ` (${esc(p.cupom)})` : ''}</td><td>-${moeda(p.desconto)}</td></tr>` : ''}
  <tr><td><b>TOTAL</b></td><td><b>${moeda(p.total)}</b></td></tr></table><hr>
  ${pagamento}
  <hr><div class="c">Obrigado pela preferência!</div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}<\/script>
  </body></html>`);
  w.document.close();
}

export function compartilharRecibo(venda) {
  const url = linkRecibo(venda, nomeLoja(), location.origin);
  const texto = `Aqui está o recibo da sua compra:\n${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}
