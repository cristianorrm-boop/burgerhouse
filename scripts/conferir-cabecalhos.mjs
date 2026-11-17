// Confere, num endereço publicado, se os cabeçalhos de cache estão como planejado.
//   node scripts/conferir-cabecalhos.mjs https://<endereço>
// Sai com código 1 se algo divergir. Rodar depois de TODA publicação (prévia e produção).
import { readFileSync } from 'node:fs';

// Prévia protegida da Vercel: passe o link de compartilhamento (botão "Share", com ?_vercel_share=...).
// O script troca o link por um cookie de acesso e confere sem o parâmetro. O link não é gravado em lugar nenhum.
const arg = process.argv[2] || '';
if (!/^https?:\/\//.test(arg)) { console.error('uso: node scripts/conferir-cabecalhos.mjs https://<endereço>[?_vercel_share=...]'); process.exit(2); }
const u0 = new URL(arg);
const base = u0.origin;
let cookie = '';
if (u0.searchParams.has('_vercel_share')) {
  const r = await fetch(arg, { redirect: 'manual' });
  cookie = (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  if (!cookie) { console.error('O link de compartilhamento não devolveu cookie de acesso (expirado?).'); process.exit(2); }
}
const versao = JSON.parse(readFileSync(new URL('../versao.json', import.meta.url), 'utf8')).versao;

const REVALIDA = /no-cache/;
const casos = [
  ['/', 200, REVALIDA],
  ['/index.html?mesa=SfyFdUBaBRDchD1MlFFK', 200, REVALIDA],
  ['/admin/', 200, REVALIDA],
  ['/sw.js', 200, /no-store/],
  ['/versao.json', 200, REVALIDA],
  [`/js/db.js?v=${versao}`, 200, REVALIDA],
  [`/css/base.css?v=${versao}`, 200, REVALIDA],
  ['/assets/hamburgueria/x-bacon.jpeg', 200, /max-age=86400/],
  ['/admin.html', 307, null],
  ['/recibo.html', 200, REVALIDA]
];

let falhas = 0;
for (const [caminho, status, cache] of casos) {
  const r = await fetch(base + caminho, { redirect: 'manual', cache: 'no-store', headers: cookie ? { cookie } : {} });
  const cc = r.headers.get('cache-control') || '';
  const okStatus = r.status === status;
  const okCache = !cache || cache.test(cc);
  let extra = '';
  if (caminho === '/admin.html') extra = ` → ${r.headers.get('location')}`;
  if (caminho === '/versao.json' && okStatus) {
    const v = (await r.json()).versao;
    if (v !== versao) { extra = ` versão publicada ${v} ≠ local ${versao}`; falhas++; }
  }
  if (!okStatus || !okCache) falhas++;
  console.log(`${okStatus && okCache ? 'OK  ' : 'ERRO'} ${r.status} ${caminho}  [${cc}]${extra}`);
}
console.log(falhas ? `\n${falhas} problema(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
