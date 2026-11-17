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

// ---------- Equipe, pedidos e vendas ----------

const ABAS_ATENDENTE = ['pedidos', 'mesas', 'pdv'];
const PERFIL = { dono: 'dono', garcom: 'atendente' };
const STATUS = { recebido: 'novo', em_preparo: 'preparo', pronto: 'pronto', entregue: 'entregue' };
const FORMAS = ['cartao', 'credito', 'debito', 'dinheiro', 'pix'];

function paraMs(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

export function converterUsuario(uid, doc) {
  if (doc.ativo === false) return null;
  const avisos = [];
  let perfil = PERFIL[doc.perfil];
  if (!perfil) {
    perfil = 'atendente';
    avisos.push(`Usuário ${uid} com perfil desconhecido "${doc.perfil}": virou atendente.`);
  }
  const campos = { nome: doc.nome || '', email: doc.email || '', perfil };
  if (doc.criadoEm !== undefined && doc.criadoEm !== null) campos.criadoEm = doc.criadoEm;
  if (perfil === 'atendente') campos.abas = [...ABAS_ATENDENTE];
  return { campos, avisos };
}

export function converterPedido(doc) {
  const avisos = [];
  const id = doc.numeroPedido ?? doc.mesaNome ?? '?';

  let status = STATUS[doc.status];
  if (!status) {
    status = doc.status;
    avisos.push(`Pedido ${id}: status desconhecido "${doc.status}" mantido.`);
  }

  let tipo;
  if (doc.origem === 'mesa') tipo = 'mesa';
  else if (doc.tipoEntrega === 'delivery') tipo = 'delivery';
  else if (doc.tipoEntrega === 'retirada') tipo = 'retirada';
  else {
    tipo = 'retirada';
    avisos.push(`Pedido ${id}: tipo indefinido (origem "${doc.origem}", entrega "${doc.tipoEntrega}"): virou retirada.`);
  }

  let pagamento = null;
  if (tipo !== 'mesa') {
    const forma = typeof doc.formaPagamento === 'string' ? doc.formaPagamento.toLowerCase() : null;
    if (forma === null) avisos.push(`Pedido ${id}: sem forma de pagamento.`);
    else if (!FORMAS.includes(forma)) avisos.push(`Pedido ${id}: forma de pagamento desconhecida "${forma}" mantida.`);
    pagamento = { forma, troco: null };
  }

  let itens;
  if (Array.isArray(doc.itens)) {
    itens = doc.itens.map(it => ({
      ...it,
      obs: it.observacao ?? '',
      adicionais: (Array.isArray(it.adicionais) ? it.adicionais : [])
        .map(a => ({ ...a, nome: a.nome ?? a.opcaoNome ?? '' })),
    }));
  } else {
    itens = [];
    avisos.push(`Pedido ${id}: sem itens, ficou com lista vazia.`);
  }

  const ms = paraMs(doc.criadoEm);
  if (ms === null) avisos.push(`Pedido ${id}: sem data de criação válida.`);

  const campos = {
    status,
    tipo,
    numero: doc.numeroPedido ?? null,
    mesa: doc.mesaId ?? null,
    taxa: doc.taxaEntrega ?? 0,
    pagamento,
    contaFechada: doc.fechada ?? false,
    criadoEm: ms,
    criadoEmTs: doc.criadoEm ?? null,
    itens,
    historico: [{ status, em: ms }],
  };
  const c = doc.cliente;
  if (tipo === 'delivery' && c && typeof c === 'object' && c.endereco) {
    campos.endereco = { texto: c.endereco, cep: c.cep ?? '' };
  }
  return { campos, avisos };
}

export function converterVenda(doc) {
  const avisos = [];
  const ms = paraMs(doc.criadoEm);
  if (ms === null) avisos.push('Venda sem data de criação válida.');
  return { campos: { criadoEm: ms, criadoEmTs: doc.criadoEm ?? null }, avisos };
}

export function contadorInicial(pedidos) {
  let n = 0;
  let ignorados = 0;
  for (const p of pedidos) {
    const v = p.numeroPedido ?? p.numero;
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number' && Number.isFinite(v)) n = Math.max(n, v);
    else if (typeof v === 'string' && /^\d+$/.test(v)) n = Math.max(n, parseInt(v, 10));
    else ignorados++;
  }
  const avisos = ignorados
    ? [`${ignorados} número(s) de pedido em formato de código ignorado(s) no contador.`]
    : [];
  return { n, avisos };
}
