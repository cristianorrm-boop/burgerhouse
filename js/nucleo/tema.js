// Cores da marca e contraste (WCAG). Módulo puro: sem db, DOM ou localStorage.

export const ABAS_PADRAO_ATENDENTE = ['pedidos', 'mesas', 'pdv'];

const luminancia = hex => {
  const n = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contraste(hexA, hexB) {
  const [a, b] = [luminancia(hexA), luminancia(hexB)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Texto (#1C1C1C ou #FFFFFF) com maior contraste sobre a cor dada. */
export function corTextoSobre(hex) {
  return contraste(hex, '#1C1C1C') >= contraste(hex, '#FFFFFF') ? '#1C1C1C' : '#FFFFFF';
}

/** Rota a abrir: a desejada se permitida, senão a primeira permitida, senão null (conta sem abas). */
export function rotaInicial(permitidas, desejada) {
  const lista = Array.isArray(permitidas) ? permitidas : [];
  return lista.includes(desejada) ? desejada : (lista[0] ?? null);
}

/** Hash a gravar na barra quando a rota pedida não é a aberta ('#/rota'); null se não há o que trocar. */
export function hashDaRotaAberta(permitidas, desejada) {
  const aberta = rotaInicial(permitidas, desejada);
  return aberta && aberta !== desejada ? '#/' + aberta : null;
}
