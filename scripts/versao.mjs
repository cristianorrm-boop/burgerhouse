// Versão única de publicação: aplica ?v=<versão> em todo JS/CSS local referenciado
// (src/href nos HTML, import/import() entre módulos, lista de pré-cache do SW).
//
//   node scripts/versao.mjs 2.0.0-f2   → grava a versão em todos os arquivos
//   node scripts/versao.mjs --check    → confere tudo contra versao.json (código 1 se divergir)
//
// Publicar sem rodar isto é erro de processo: o navegador poderia misturar
// módulos de versões diferentes.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// prefixo (from / import( / import só de efeito / src= / href=), aspas, caminho local .js/.css, ?v= opcional.
// Caminho local: ./ ../ ou /x; em src/href também o relativo "sem ponto" (style.css, js/a.js), mas nunca http(s): etc.
const REF = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+(?=['"])|\b(?:src|href)\s*=\s*)(['"])((?:\.{1,2}\/|\/(?!\/)|(?<=\b(?:src|href)\s*=\s*['"])(?![a-zA-Z][a-zA-Z0-9+.-]*:)[\w-])[^'"?#]*?\.(?:js|css))(\?v=[^'"]*)?\2/g;
// strings soltas com caminho absoluto local .js/.css (lista de pré-cache do sw.js)
const LISTA = /(['"])(\/(?!\/)[^'"?#]*?\.(?:js|css))(\?v=[^'"]*)?\1/g;

export function aplicarVersao(texto, versao) {
  return texto.replace(REF, (_, pre, q, caminho) => `${pre}${q}${caminho}?v=${versao}${q}`);
}

export function referenciasSemVersao(texto, versao) {
  const fora = [];
  for (const m of texto.matchAll(REF)) if (m[4] !== `?v=${versao}`) fora.push(m[3] + (m[4] || ''));
  return fora;
}

function aplicarNoSW(texto, versao) {
  return texto
    .replace(/const VERSAO = '[^']*';/, `const VERSAO = 'bh-${versao}';`)
    .replace(LISTA, (_, q, caminho) => caminho === '/sw.js' ? `${q}${caminho}${q}` : `${q}${caminho}?v=${versao}${q}`);
}

function swForaDaVersao(texto, versao) {
  const fora = [];
  if (!texto.includes(`const VERSAO = 'bh-${versao}';`)) fora.push('const VERSAO');
  for (const m of texto.matchAll(LISTA)) if (m[2] !== '/sw.js' && m[3] !== `?v=${versao}`) fora.push(m[2] + (m[3] || ''));
  return fora;
}

const IGNORAR = new Set(['scripts', 'tests', 'node_modules', 'api', 'assets', 'docs', '.git', '.superpowers', '.impeccable', '.vscode', '.claude']);

function arquivos(raiz, dir = '') {
  const out = [];
  for (const n of readdirSync(join(raiz, dir))) {
    const rel = dir ? join(dir, n) : n;
    if (statSync(join(raiz, rel)).isDirectory()) { if (!IGNORAR.has(n)) out.push(...arquivos(raiz, rel)); }
    else if (/\.(html|js)$/.test(n)) out.push(rel);
  }
  return out;
}

function main(args) {
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  const lista = arquivos(raiz);
  const ehSW = f => relative(raiz, join(raiz, f)).replace(/\\/g, '/') === 'sw.js';

  if (args[0] === '--check') {
    const versao = JSON.parse(readFileSync(join(raiz, 'versao.json'), 'utf8')).versao;
    const problemas = [];
    for (const f of lista) {
      const t = readFileSync(join(raiz, f), 'utf8');
      const fora = ehSW(f) ? swForaDaVersao(t, versao) : referenciasSemVersao(t, versao);
      fora.forEach(r => problemas.push(`${f}: ${r}`));
    }
    const vjs = readFileSync(join(raiz, 'js/versao.js'), 'utf8');
    if (!vjs.includes(`'${versao}'`)) problemas.push(`js/versao.js: VERSAO diferente de ${versao}`);
    problemas.forEach(p => console.log(p));
    process.exit(problemas.length ? 1 : 0);
  }

  const versao = args[0];
  if (!versao || !/^[\w.-]+$/.test(versao)) { console.error('uso: node scripts/versao.mjs <versao> | --check'); process.exit(2); }
  for (const f of lista) {
    const t = readFileSync(join(raiz, f), 'utf8');
    const novo = ehSW(f) ? aplicarNoSW(t, versao) : aplicarVersao(t, versao);
    if (novo !== t) writeFileSync(join(raiz, f), novo);
  }
  writeFileSync(join(raiz, 'js/versao.js'), `// Gerado por scripts/versao.mjs — não editar à mão.\nexport const VERSAO = '${versao}';\n`);
  writeFileSync(join(raiz, 'versao.json'), JSON.stringify({ versao }) + '\n');
  console.log(`versão ${versao} aplicada em ${lista.length} arquivos`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
