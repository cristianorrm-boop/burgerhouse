// Mesas: funções puras (sem banco, sem DOM). O QR impresso usa o id do documento da mesa.

/** Id da mesa vindo de ?mesa=: usado literalmente (só tira espaços). Vazio vira null. */
export function idMesaDoLink(valor) {
  const v = String(valor ?? '').trim();
  return v || null;
}

/** Nome para exibir: `nome` quando existe; senão "Mesa N". */
export function nomeMesa(m) {
  const nome = String(m?.nome ?? '').trim();
  if (nome) return nome;
  const n = m?.numero;
  return n !== undefined && n !== null && n !== '' ? `Mesa ${n}` : 'Mesa';
}

/** Mesmo formato dos QR Codes impressos pela V1. */
export function urlMesa(origem, id) {
  return `${origem}/index.html?mesa=${encodeURIComponent(id)}`;
}

/** Próxima mesa: número = maior + 1; id = o número, ou "N-2", "N-3"... se já existir. */
export function proximaMesa(mesas) {
  const numero = Math.max(0, ...mesas.map(m => Number(m.numero) || 0)) + 1;
  const ids = new Set(mesas.map(m => String(m.id)));
  let id = String(numero);
  for (let n = 2; ids.has(id); n++) id = `${numero}-${n}`;
  return { id, numero };
}
