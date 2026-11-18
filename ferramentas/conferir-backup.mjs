// Uso: node ferramentas/conferir-backup.mjs backups/<arquivo>.json [--esperado produtos=35,categorias=5,...]
// Imprime as contagens por coleção de um backup (somente leitura).
// Sai 1 se alguma coleção da V1 deu erro na leitura ou se uma contagem esperada não bate.
// Erro só em coleção nova da V2 é aviso (sai 0).
import { readFileSync } from 'node:fs';
import { errosBloqueantes } from './serializar.mjs';

const args = process.argv.slice(2);
const uso = 'uso: node ferramentas/conferir-backup.mjs <arquivo.json> [--esperado colecao=N,...]';
const arq = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--esperado');
const iEsp = args.indexOf('--esperado');
if (!arq || (iEsp >= 0 && !args[iEsp + 1])) { console.error(uso); process.exit(2); }

const esperado = {};
if (iEsp >= 0) {
  for (const par of args[iEsp + 1].split(',')) {
    const m = /^\s*([\w-]+)\s*=\s*(\d+)\s*$/.exec(par);
    if (!m) { console.error(`--esperado inválido: "${par}"\n${uso}`); process.exit(2); }
    esperado[m[1]] = Number(m[2]);
  }
}

const b = JSON.parse(readFileSync(arq, 'utf8'));
console.log(`projeto: ${b.projeto}  gerado em: ${new Date(b.geradoEm).toISOString()}`);
const colecoes = b.colecoes && typeof b.colecoes === 'object' ? b.colecoes : {};
const erros = b.erros && typeof b.erros === 'object' ? b.erros : {};
const nomes = [...new Set([...Object.keys(colecoes), ...Object.keys(erros)])];
for (const nome of nomes) {
  if (erros[nome]) console.log(`${nome.padEnd(20)} ERRO: ${erros[nome]}`);
  else console.log(`${nome.padEnd(20)} ${Object.keys(colecoes[nome] || {}).length}`);
}

let falhou = false;
const bloqueantes = errosBloqueantes(erros);
const soAviso = Object.keys(erros).filter(n => erros[n] && !bloqueantes.includes(n));
if (soAviso.length) console.log(`\nAviso: erro em coleção nova da V2 (${soAviso.join(', ')}).`);
if (bloqueantes.length) {
  console.log(`\nFALHA: erro em coleção da V1 (${bloqueantes.join(', ')}). Este backup não serve.`);
  falhou = true;
}
for (const [nome, n] of Object.entries(esperado)) {
  const real = erros[nome] || !colecoes[nome] ? null : Object.keys(colecoes[nome]).length;
  if (real !== n) {
    console.log(`DIFERENÇA: ${nome} tem ${real ?? 'nada'}, esperado ${n}.`);
    falhou = true;
  }
}
if (Object.keys(esperado).length && !falhou) console.log('\nContagens esperadas conferem.');
process.exit(falhou ? 1 : 0);
