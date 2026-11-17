// Taxa de entrega do delivery. Função pura (sem banco, sem DOM).

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Com bairros ativos: o bairro é obrigatório e a taxa é a dele.
 * Sem bairros ativos (loja vinda da V1): endereço livre e taxa = taxaPadrao (0 se ausente).
 */
export function taxaEntrega({ bairros = [], bairroId = '', taxaPadrao = 0 } = {}) {
  const ativos = (bairros || []).filter(b => b && b.ativo !== false);
  if (!ativos.length) return { taxa: num(taxaPadrao), exigeBairro: false, erro: null };
  const b = ativos.find(x => String(x.id) === String(bairroId ?? ''));
  if (!b) return { taxa: 0, exigeBairro: true, erro: 'Selecione o bairro.' };
  return { taxa: num(b.taxa), exigeBairro: true, erro: null };
}
