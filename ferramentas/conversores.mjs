// Conversores V1 -> V2 do cardápio, loja, cupons e mesas.
// Funções puras, sem Firebase e sem importar nada de js/.
// Cada uma devolve { campos, avisos } (avisos sempre é um array).

const EMOJI_CATEGORIA = {
  lanches: '🍔',
  porcoes: '🍟',
  bebidas: '🥤',
  combos: '🍱',
  sobremesas: '🍨',
};
const EMOJI_PADRAO = '🍽️';
const CATEGORIAS_UPSELL = ['bebidas', 'sobremesas'];

function fotoDe(imagem) {
  if (typeof imagem !== 'string' || !imagem) return '';
  return imagem.startsWith('./') ? '/' + imagem.slice(2) : imagem;
}

export function converterProduto(doc) {
  const avisos = [];
  const nome = doc.nome || '(sem nome)';
  const foto = fotoDe(doc.imagem);
  if (!foto) avisos.push(`Produto "${nome}" sem imagem: foto ficou vazia.`);
  const cat = doc.categoria;
  const ordem = typeof doc.id === 'number' && Number.isFinite(doc.id) ? doc.id : 999;
  const campos = {
    categoriaId: cat || '',
    foto,
    adicionais: Array.isArray(doc.adicionaisGrupos) ? [...doc.adicionaisGrupos] : [],
    ordem,
    disponivel: doc.ativo !== false,
    precoPromo: null,
    selos: doc.destaque === true ? ['Mais vendido'] : [],
    emoji: EMOJI_CATEGORIA[cat] || EMOJI_PADRAO,
    upsell: CATEGORIAS_UPSELL.includes(cat),
  };
  return { campos, avisos };
}

export function converterCategoria(doc) {
  const emoji = EMOJI_CATEGORIA[doc.id] || EMOJI_PADRAO;
  return { campos: { ativo: true, emoji }, avisos: [] };
}

export function converterGrupoAdicional(doc) {
  const opcoes = (Array.isArray(doc.opcoes) ? doc.opcoes : [])
    .map(o => ({ nome: o.nome, preco: o.preco }));
  return {
    campos: { nome: doc.nome || '', min: 0, max: opcoes.length, opcoes },
    avisos: [],
  };
}

export function converterConfig(geral) {
  const dias = Array.isArray(geral.funcionamentoDias) ? geral.funcionamentoDias : [];
  const horarios = [];
  for (let d = 0; d < 7; d++) {
    horarios.push({
      ativo: dias.includes(d),
      abre: geral.funcionamentoHoraInicio ?? '',
      fecha: geral.funcionamentoHoraFim ?? '',
    });
  }
  const campos = {
    nome: geral.nomeLoja ?? '',
    logo: fotoDe(geral.logoUrl),
    capa: fotoDe(geral.bannerUrl),
    whatsapp: geral.whatsapp ?? '',
    tema: {
      primaria: geral.corPrimaria ?? '',
      secundaria: geral.corSecundaria ?? '',
      fundo: 'auto',
    },
    corDestaque: geral.corDestaque ?? '',
    horarios,
    taxaPadrao: geral.taxaEntrega ?? 0,
    pausado: false,
  };
  return { campos, avisos: [] };
}

function brl(n) {
  return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
}

export function converterCupom(doc) {
  const avisos = [];
  let descricao;
  if (doc.tipo === 'percentual') descricao = `${doc.valor}% de desconto`;
  else if (doc.tipo === 'fixo') descricao = `${brl(doc.valor)} de desconto`;
  else if (doc.tipo === 'frete') descricao = 'Entrega grátis';
  else {
    descricao = '';
    avisos.push(`Cupom "${doc.codigo}" com tipo desconhecido "${doc.tipo}".`);
  }
  return {
    campos: {
      minimo: doc.valorMinimo ?? 0,
      validade: doc.validade ?? '',
      limite: 0,
      usos: 0,
      descricao,
    },
    avisos,
  };
}

export function converterMesa(doc, numerosUsados) {
  const avisos = [];
  const m = /\d+/.exec(doc.nome || '');
  let numero = m ? parseInt(m[0], 10) : NaN;
  if (!Number.isFinite(numero) || numerosUsados.has(numero)) {
    const motivo = Number.isFinite(numero)
      ? `número ${numero} já usado`
      : 'sem número no nome';
    numero = 1;
    while (numerosUsados.has(numero)) numero++;
    avisos.push(`Mesa "${doc.nome}" (${motivo}): recebeu o número ${numero}.`);
  }
  return {
    campos: { numero, ativa: doc.ativo !== false, chamado: null, chamadoEm: null },
    avisos,
  };
}
