// Regras de produto sem tela (testadas em tests/destaque.test.mjs).

const SELOS_DESTAQUE = ['Mais vendido', 'Promoção', 'Novo', 'Mais pedido'];

/** Produto aparece no carrossel "Destaques" do cardápio:
 *  marcado como Destaque no cadastro, ou com selo de destaque, ou com preço promocional — e disponível. */
export function emDestaque(p) {
  if (!p || p.disponivel === false) return false;
  return p.destaque === true
    || (p.selos || []).some(s => SELOS_DESTAQUE.includes(s))
    || !!p.precoPromo;
}
