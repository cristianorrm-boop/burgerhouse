// Plano da migração aditiva V1 -> V2. Função pura (Node e navegador), sem Firebase.
// É o único lugar que decide o que será escrito no banco.
//
// planejarAditivos(atual) => { operacoes, avisos }
//   atual = { <colecao>: { <id>: doc } } com o estado lido do banco agora.
//   Op = { colecao, id, tipo: 'criar' | 'completar', campos }
//   - completar: só campos do conversor AUSENTES no doc (chave inexistente; null/'' conta
//     como presente). Vai como update só desses campos.
//   - criar: só se o doc de destino não existe. Vai como set sem merge.
//
// planejarCorte(atual) => { operacoes, avisos }   (só no corte; pode rodar mais de uma vez)
//   Op = { colecao: 'pedidos' | 'vendas', id, tipo: 'converter', campos }
//      | { colecao: 'contadores', id: 'pedidos', tipo: 'criar' | 'atualizar', campos: { n } }
//   - converter: só pedidos/vendas ainda no formato V1, e só os campos cujo valor muda.
//     Vai como update desses campos. Doc criado pela V2 ou já convertido não é tocado.
//   - contador: criar se não existe; atualizar só se o número calculado for maior.
import {
  converterProduto, converterCategoria, converterCupom, converterMesa,
  converterConfig, converterGrupoAdicional, converterUsuario,
  converterPedido, converterVenda, contadorInicial,
  precisaConverterPedido, precisaConverterVenda,
} from './conversores.mjs';

// Campos que a V1 lê e que nenhuma operação pode conter.
const PROIBIDOS = {
  produtos: ['categoria', 'imagem', 'adicionaisGrupos', 'ativo', 'preco', 'nome'],
  mesas: ['nome', 'ativo'],
};
const DESTINOS_COMPLETAR = ['produtos', 'categorias', 'mesas', 'cupons'];
const DESTINOS_CRIAR = ['config', 'adicionais', 'equipe'];

const ehObjeto = v => v !== null && typeof v === 'object';
const colecao = (atual, nome) => (ehObjeto(atual?.[nome]) ? atual[nome] : {});
const idsOrdenados = docs => Object.keys(docs).sort();
const existe = (atual, nome, id) => ehObjeto(colecao(atual, nome)[id]);

function faltantes(doc, campos, nomeColecao) {
  const proibidos = PROIBIDOS[nomeColecao] || [];
  const out = {};
  for (const k of Object.keys(campos)) {
    if (proibidos.includes(k)) continue;
    if (!(k in doc)) out[k] = campos[k];
  }
  return out;
}

function numeroDoNome(nome) {
  const m = /\d+/.exec(typeof nome === 'string' ? nome : '');
  return m ? parseInt(m[0], 10) : Infinity;
}

export function planejarAditivos(atual) {
  const operacoes = [];
  const avisos = [];

  const completar = (nomeColecao, id, doc, r) => {
    const campos = faltantes(doc, r.campos, nomeColecao);
    if (Object.keys(campos).length === 0) return;
    operacoes.push({ colecao: nomeColecao, id, tipo: 'completar', campos });
    avisos.push(...r.avisos);
  };

  // Produtos (o doc tem um campo "id" numérico próprio, que vira "ordem").
  const produtos = colecao(atual, 'produtos');
  for (const id of idsOrdenados(produtos)) {
    const doc = produtos[id];
    if (!ehObjeto(doc)) continue;
    completar('produtos', id, doc, converterProduto(doc));
  }

  // Categorias (o emoji sai do id do documento).
  const categorias = colecao(atual, 'categorias');
  for (const id of idsOrdenados(categorias)) {
    const doc = categorias[id];
    if (!ehObjeto(doc)) continue;
    completar('categorias', id, doc, converterCategoria({ ...doc, id }));
  }

  // Mesas: números já salvos ficam reservados; as demais recebem número em ordem estável
  // (número do nome, depois id), para que rodadas repetidas deem o mesmo resultado.
  const mesas = colecao(atual, 'mesas');
  const numerosUsados = new Set();
  const comNumero = [];
  const semNumero = [];
  for (const id of Object.keys(mesas)) {
    const doc = mesas[id];
    if (!ehObjeto(doc)) continue;
    if ('numero' in doc) {
      if (typeof doc.numero === 'number' && Number.isFinite(doc.numero)) numerosUsados.add(doc.numero);
      comNumero.push(id);
    } else {
      semNumero.push(id);
    }
  }
  semNumero.sort((a, b) => {
    const na = numeroDoNome(mesas[a].nome);
    const nb = numeroDoNome(mesas[b].nome);
    if (na !== nb) return na < nb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (const id of semNumero) {
    const r = converterMesa(mesas[id], numerosUsados);
    numerosUsados.add(r.campos.numero);
    completar('mesas', id, mesas[id], r);
  }
  for (const id of comNumero.sort()) {
    // "numero" já existe e não entra; os avisos de numeração não se aplicam.
    const r = converterMesa(mesas[id], new Set());
    completar('mesas', id, mesas[id], { campos: r.campos, avisos: [] });
  }

  // Cupons.
  const cupons = colecao(atual, 'cupons');
  for (const id of idsOrdenados(cupons)) {
    const doc = cupons[id];
    if (!ehObjeto(doc)) continue;
    completar('cupons', id, doc, converterCupom(doc));
  }

  // configuracoes/geral -> config/loja.
  const geral = colecao(atual, 'configuracoes').geral;
  if (!existe(atual, 'config', 'loja')) {
    if (ehObjeto(geral)) {
      const r = converterConfig(geral);
      operacoes.push({ colecao: 'config', id: 'loja', tipo: 'criar', campos: r.campos });
      avisos.push(...r.avisos);
    } else {
      avisos.push('configuracoes/geral não existe: config/loja não será criado.');
    }
  }

  // gruposAdicionais/X -> adicionais/X.
  const grupos = colecao(atual, 'gruposAdicionais');
  for (const id of idsOrdenados(grupos)) {
    const doc = grupos[id];
    if (!ehObjeto(doc) || existe(atual, 'adicionais', id)) continue;
    const r = converterGrupoAdicional(doc);
    operacoes.push({ colecao: 'adicionais', id, tipo: 'criar', campos: r.campos });
    avisos.push(...r.avisos);
  }

  // usuarios/U -> equipe/U (inativos ficam de fora).
  const usuarios = colecao(atual, 'usuarios');
  for (const id of idsOrdenados(usuarios)) {
    const doc = usuarios[id];
    if (!ehObjeto(doc) || existe(atual, 'equipe', id)) continue;
    const r = converterUsuario(id, doc);
    if (r === null) continue;
    operacoes.push({ colecao: 'equipe', id, tipo: 'criar', campos: r.campos });
    avisos.push(...r.avisos);
  }

  conferirSeguranca(operacoes);
  return { operacoes, avisos };
}

// ---------- Corte: pedidos, vendas e contador ----------

// Campos que o corte pode escrever (os campos de origem da V1 nunca são tocados).
const CAMPOS_CORTE = {
  pedidos: ['status', 'tipo', 'numero', 'mesa', 'taxa', 'pagamento', 'contaFechada',
    'criadoEm', 'criadoEmTs', 'itens', 'historico', 'endereco'],
  vendas: ['criadoEm', 'criadoEmTs'],
};

const ehData = v => v instanceof Date || (ehObjeto(v) && typeof v.toMillis === 'function');

function igual(a, b) {
  if (a === b) return true;
  if (ehData(a) || ehData(b)) {
    if (!ehData(a) || !ehData(b)) return false;
    const ms = v => (v instanceof Date ? v.getTime() : v.toMillis());
    return ms(a) === ms(b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => igual(x, b[i]));
  }
  if (ehObjeto(a) && ehObjeto(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every(k => k in b && igual(a[k], b[k]));
  }
  return false;
}

function mudancas(doc, campos) {
  const out = {};
  for (const k of Object.keys(campos)) if (!(k in doc) || !igual(doc[k], campos[k])) out[k] = campos[k];
  return out;
}

export function planejarCorte(atual) {
  const operacoes = [];
  const avisos = [];

  const converter = (nomeColecao, precisa, conversor) => {
    const docs = colecao(atual, nomeColecao);
    for (const id of idsOrdenados(docs)) {
      const doc = docs[id];
      if (!precisa(doc)) continue;
      const r = conversor(doc);
      avisos.push(...r.avisos);
      const campos = mudancas(doc, r.campos);
      if (Object.keys(campos).length) operacoes.push({ colecao: nomeColecao, id, tipo: 'converter', campos });
    }
  };
  converter('pedidos', precisaConverterPedido, converterPedido);
  converter('vendas', precisaConverterVenda, converterVenda);

  // Contador: começa no maior número real; nunca desce.
  const cont = contadorInicial(Object.values(colecao(atual, 'pedidos')));
  avisos.push(...cont.avisos);
  const docCont = colecao(atual, 'contadores').pedidos;
  if (!ehObjeto(docCont)) {
    operacoes.push({ colecao: 'contadores', id: 'pedidos', tipo: 'criar', campos: { n: cont.n } });
  } else if (!(typeof docCont.n === 'number' && docCont.n >= cont.n)) {
    operacoes.push({ colecao: 'contadores', id: 'pedidos', tipo: 'atualizar', campos: { n: cont.n } });
  }

  conferirSegurancaCorte(operacoes, atual);
  return { operacoes, avisos };
}

function temUndefined(v) {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(temUndefined);
  if (ehObjeto(v) && !ehData(v)) return Object.values(v).some(temUndefined);
  return false;
}

// Trava final do corte, conferida contra o estado lido agora.
export function conferirSegurancaCorte(operacoes, atual) {
  for (const op of operacoes) {
    const onde = `${op.colecao}/${op.id}`;
    const chaves = Object.keys(op.campos || {});
    if (!chaves.length) throw new Error(`Plano inválido: ${onde} sem campos.`);
    if (temUndefined(op.campos)) throw new Error(`Plano inválido: ${onde} com valor indefinido.`);
    if (op.colecao === 'contadores') {
      const ok = op.id === 'pedidos' && ['criar', 'atualizar'].includes(op.tipo)
        && chaves.length === 1 && Number.isFinite(op.campos.n);
      const existeDoc = existe(atual, 'contadores', 'pedidos');
      if (!ok || (op.tipo === 'criar') === existeDoc) throw new Error(`Plano inválido: ${op.tipo} em ${onde}.`);
      continue;
    }
    const permitidos = CAMPOS_CORTE[op.colecao];
    if (op.tipo !== 'converter' || !permitidos) throw new Error(`Plano inválido: ${op.tipo} em ${onde}.`);
    const doc = colecao(atual, op.colecao)[op.id];
    if (!ehObjeto(doc)) throw new Error(`Plano inválido: ${onde} não existe.`);
    for (const k of chaves) {
      if (!permitidos.includes(k)) throw new Error(`Plano inválido: ${onde} contém ${k}.`);
    }
    if ('criadoEmTs' in op.campos && 'criadoEmTs' in doc) {
      throw new Error(`Plano inválido: ${onde} já tem criadoEmTs.`);
    }
  }
}

// Trava final: nenhuma operação fora dos destinos permitidos nem com campo da V1.
function conferirSeguranca(operacoes) {
  for (const op of operacoes) {
    const permitidos = op.tipo === 'completar' ? DESTINOS_COMPLETAR
      : op.tipo === 'criar' ? DESTINOS_CRIAR : [];
    if (!permitidos.includes(op.colecao)) {
      throw new Error(`Plano inválido: ${op.tipo} em ${op.colecao}/${op.id}.`);
    }
    for (const k of PROIBIDOS[op.colecao] || []) {
      if (k in op.campos) throw new Error(`Plano inválido: ${op.colecao}/${op.id} contém ${k}.`);
    }
  }
}
