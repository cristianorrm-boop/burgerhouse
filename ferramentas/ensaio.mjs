// Ensaio geral: monta, a partir de um backup, o banco demo (formato de localStorage['co_db_v1']
// do js/db.js) com TUDO o que o corte aplicará. Função pura (Node e navegador), sem Firebase.
import { desserializar, errosBloqueantes } from './serializar.mjs';
import { planejarAditivos, planejarCorte } from './plano.mjs';

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

// Backup que não serve para o ensaio falha alto (em vez de um "Pronto: 0 produtos").
function conferirBackup(backup) {
  if (!ehObjeto(backup) || !ehObjeto(backup.colecoes)) {
    throw new Error('Backup inválido: o arquivo não tem "colecoes".');
  }
  const ruins = errosBloqueantes(backup.erros);
  if (ruins.length) throw new Error(`Backup incompleto: erro ao ler ${ruins.join(', ')}.`);
  const p = backup.colecoes.produtos;
  if (!ehObjeto(p) || Object.keys(p).length === 0) throw new Error('Backup sem produtos.');
}

// opcoes.aberta24h: a cópia demo abre todos os dias, 00:00–23:59 (só os horarios mudam).
export function montarBancoDemo(backup, opcoes = {}) {
  conferirBackup(backup);
  const colecoes = desserializar(backup.colecoes, null);
  const banco = structuredClone(colecoes);
  const col = nome => (banco[nome] ??= {});

  // 1. Aditivos e 2. corte (pedidos, vendas, contador): os mesmos planos do banco real,
  // aplicados em memória (update = mescla rasa; criar = set).
  const aplicar = op => {
    const c = col(op.colecao);
    if (op.tipo === 'criar') { if (!(op.id in c)) c[op.id] = { ...op.campos }; }
    else c[op.id] = { ...c[op.id], ...op.campos };
  };
  planejarAditivos(colecoes).operacoes.forEach(aplicar);
  for (const op of planejarCorte(banco).operacoes) {
    // O demo guarda JSON: o Timestamp original (criadoEmTs) não entra.
    const { criadoEmTs, ...campos } = op.campos;
    if (Object.keys(campos).length) aplicar({ ...op, campos });
  }

  // Garante as coleções esperadas pelo app.
  for (const n of ['config', 'categorias', 'produtos', 'adicionais', 'mesas', 'cupons', 'pedidos', 'vendas', 'equipe']) col(n);

  if (opcoes.aberta24h && banco.config.loja) {
    banco.config.loja.horarios = Array.from({ length: 7 },
      () => ({ ativo: true, abre: '00:00', fecha: '23:59' }));
  }

  return datasParaMs(banco);
}
