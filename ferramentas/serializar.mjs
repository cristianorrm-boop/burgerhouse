// Converte documentos do Firestore para JSON e de volta. Roda no navegador e no Node.
export const COLECOES_V1 = ['produtos', 'categorias', 'cupons', 'configuracoes', 'gruposAdicionais', 'tiposVariacao', 'mesas', 'pedidos', 'vendas', 'usuarios'];
export const COLECOES_V2_NOVAS = ['config', 'adicionais', 'equipe', 'contadores', 'bairros', 'clientes', 'fidelidade', 'contas_pagar', 'contas_receber'];

// Coleções da V1 que deram erro na leitura: o backup fica incompleto e não serve.
// (Erro só em coleção nova da V2 é aviso: ela pode nem existir ainda.)
export function errosBloqueantes(erros) {
  const e = erros !== null && typeof erros === 'object' ? erros : {};
  return COLECOES_V1.filter(nome => e[nome]);
}

const ehTimestamp =v => v !== null && typeof v === 'object' && typeof v.toMillis === 'function';

export function serializar(valor) {
  if (ehTimestamp(valor)) return { __tipo: 'ts', ms: valor.toMillis() };
  if (valor instanceof Date) return { __tipo: 'ts', ms: valor.getTime() };
  if (Array.isArray(valor)) return valor.map(serializar);
  if (valor !== null && typeof valor === 'object') {
    const o = {};
    for (const k of Object.keys(valor)) o[k] = serializar(valor[k]);
    return o;
  }
  return valor;
}

export function desserializar(json, F) {
  if (Array.isArray(json)) return json.map(v => desserializar(v, F));
  if (json !== null && typeof json === 'object') {
    if (json.__tipo === 'ts' && typeof json.ms === 'number') return F ? F.Timestamp.fromMillis(json.ms) : new Date(json.ms);
    const o = {};
    for (const k of Object.keys(json)) o[k] = desserializar(json[k], F);
    return o;
  }
  return json;
}
