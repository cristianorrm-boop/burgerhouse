// Limpeza dos dados de teste antes do corte (Fase 5).
// Apaga TODOS os documentos de `pedidos` e `vendas` (eram testes, confirmado pela usuária)
// e zera `usos` dos cupons usados nos testes. Nada mais é tocado.
// Puro: sem Firebase, sem DOM — usado por ferramentas/limpar.html e pelos testes.

const APAGAR = ['pedidos', 'vendas'];

/** atual = { [colecao]: { [id]: doc } } → { operacoes, resumo } */
export function planejarLimpeza(atual = {}) {
  const operacoes = [];
  const resumo = { pedidos: 0, vendas: 0, cupons: 0 };
  for (const colecao of APAGAR) {
    for (const id of Object.keys(atual[colecao] || {}).sort()) {
      operacoes.push({ colecao, id, tipo: 'apagar' });
      resumo[colecao]++;
    }
  }
  for (const [id, cupom] of Object.entries(atual.cupons || {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (Number(cupom?.usos) > 0) {
      operacoes.push({ colecao: 'cupons', id, tipo: 'zerarUsos' });
      resumo.cupons++;
    }
  }
  conferirLimpeza(operacoes);
  return { operacoes, resumo };
}

/** Trava final: lança erro se alguma operação sair do combinado. */
export function conferirLimpeza(operacoes) {
  for (const op of operacoes) {
    const ok = (op.tipo === 'apagar' && APAGAR.includes(op.colecao))
      || (op.tipo === 'zerarUsos' && op.colecao === 'cupons');
    if (!ok) throw new Error(`Operação recusada: ${op.tipo} em ${op.colecao}/${op.id}`);
  }
}
