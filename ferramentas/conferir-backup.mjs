// Uso: node ferramentas/conferir-backup.mjs backups/<arquivo>.json
// Imprime as contagens por coleção de um backup (somente leitura).
import { readFileSync } from 'node:fs';

const arq = process.argv[2];
if (!arq) { console.error('uso: node ferramentas/conferir-backup.mjs <arquivo.json>'); process.exit(2); }

const b = JSON.parse(readFileSync(arq, 'utf8'));
console.log(`projeto: ${b.projeto}  gerado em: ${new Date(b.geradoEm).toISOString()}`);
const erros = b.erros || {};
const nomes = [...new Set([...Object.keys(b.colecoes || {}), ...Object.keys(erros)])];
for (const nome of nomes) {
  if (erros[nome]) console.log(`${nome.padEnd(20)} ERRO: ${erros[nome]}`);
  else console.log(`${nome.padEnd(20)} ${Object.keys(b.colecoes[nome]).length}`);
}
if (Object.keys(erros).length) { console.log(`\n${Object.keys(erros).length} coleção(ões) com erro.`); process.exit(1); }
