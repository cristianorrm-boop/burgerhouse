// Ensaio geral: monta, a partir de um backup, o banco demo (formato de localStorage['co_db_v1']
// do js/db.js) com TUDO o que o corte aplicará. Função pura (Node e navegador), sem Firebase.
import { desserializar } from './serializar.mjs';
import { planejarAditivos } from './plano.mjs';
import { converterPedido, converterVenda, contadorInicial } from './conversores.mjs';

const ehObjeto = v => v !== null && typeof v === 'object';

// O demo guarda JSON: toda data vira número (ms).
function datasParaMs(v) {
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.map(datasParaMs);
  if (ehObjeto(v)) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = datasParaMs(v[k]);
    return o;
  }
  return v;
}

export function montarBancoDemo(backup) {
  const colecoes = desserializar(backup?.colecoes ?? backup ?? {}, null);
  const banco = structuredClone(colecoes);
  const col = nome => (banco[nome] ??= {});

  // 1. Aditivos (mesmo plano do corte).
  for (const op of planejarAditivos(colecoes).operacoes) {
    const c = col(op.colecao);
    if (op.tipo === 'completar') c[op.id] = { ...c[op.id], ...op.campos };
    else if (!(op.id in c)) c[op.id] = { ...op.campos };
  }

  // 2. Pedidos e vendas: patch mesclado ao documento original (sem criadoEmTs no demo).
  for (const [id, doc] of Object.entries(col('pedidos'))) {
    if (!ehObjeto(doc)) continue;
    const { criadoEmTs, ...campos } = converterPedido(doc).campos;
    col('pedidos')[id] = { ...doc, ...campos };
  }
  for (const [id, doc] of Object.entries(col('vendas'))) {
    if (!ehObjeto(doc)) continue;
    const { criadoEmTs, ...campos } = converterVenda(doc).campos;
    col('vendas')[id] = { ...doc, ...campos };
  }

  // 3. Contador de pedidos.
  col('contadores').pedidos = { n: contadorInicial(Object.values(colecoes.pedidos ?? {})).n };

  // Garante as coleções esperadas pelo app.
  for (const n of ['config', 'categorias', 'produtos', 'adicionais', 'mesas', 'cupons', 'pedidos', 'vendas', 'equipe']) col(n);

  return datasParaMs(banco);
}
