// Service Worker do Burger House (V2).
// VERSAO e a lista abaixo são reescritas por scripts/versao.mjs — não editar à mão.
//
// Regras (aprendizado do Manejo Mix: código novo publicado não pode ficar escondido atrás de cache):
//  - Páginas, JS e CSS: REDE PRIMEIRO. O cache só é usado sem internet.
//  - Imagens, fontes e bibliotecas de CDN com versão na URL: cache primeiro.
//  - Firebase, /api/, /p/ e /versao.json: nunca passam pelo SW.
//  - Ao ativar, apaga TODOS os caches que não sejam o desta versão, inclusive o da V1 (burger-house-shell-v2).
const VERSAO = 'bh-2.0.0-f3';
const ESSENCIAIS = [
  '/', '/index.html', '/pedido.html', '/admin/', '/admin/index.html', '/offline.html',
  '/css/base.css?v=2.0.0-f3', '/css/cliente.css?v=2.0.0-f3', '/css/admin.css?v=2.0.0-f3',
  '/js/config.js?v=2.0.0-f3', '/js/versao.js?v=2.0.0-f3', '/js/db.js?v=2.0.0-f3', '/js/utils.js?v=2.0.0-f3', '/js/seed.js?v=2.0.0-f3', '/js/cliente.js?v=2.0.0-f3', '/js/pedido.js?v=2.0.0-f3',
  '/js/admin/app.js?v=2.0.0-f3', '/js/admin/acoes.js?v=2.0.0-f3', '/js/admin/pedidos.js?v=2.0.0-f3', '/js/admin/mesas.js?v=2.0.0-f3', '/js/admin/pdv.js?v=2.0.0-f3','/js/admin/cardapio.js?v=2.0.0-f3',
  '/js/admin/cupons.js?v=2.0.0-f3', '/js/admin/clientes.js?v=2.0.0-f3', '/js/admin/financeiro.js?v=2.0.0-f3', '/js/admin/dashboard.js?v=2.0.0-f3',
  '/js/admin/entrega.js?v=2.0.0-f3', '/js/admin/loja.js?v=2.0.0-f3', '/js/admin/impressora.js?v=2.0.0-f3',
  '/manifest.json', '/admin/manifest.json', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png'
];

const CDN_VERSIONADO = /^(www\.gstatic\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

/** Decide como tratar uma requisição GET. */
function estrategia(url, modo, origem) {
  if (url.origin !== origem) {
    // Outras origens: só CDN com versão na URL vai para o cache (Firebase/Google APIs e o resto passam direto)
    if (url.host === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return 'ignorar';
    return CDN_VERSIONADO.test(url.host) ? 'cache-primeiro' : 'ignorar';
  }
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/p/') || p === '/versao.json') return 'ignorar';
  if (modo === 'navigate' || p.endsWith('/') || /\.(html|js|css)$/.test(p)) return 'rede-primeiro';
  return 'cache-primeiro';
}

/** Nomes de cache que devem ser apagados ao ativar esta versão. */
function limparCaches(nomes, atual) {
  return nomes.filter(n => n !== atual);
}

function guardar(req, resp) {
  if (resp && (resp.ok || resp.type === 'opaque')) {
    const copia = resp.clone();
    caches.open(VERSAO).then(c => c.put(req, copia));
  }
  return resp;
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(limparCaches(ks, VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const modo = estrategia(url, req.mode, self.location.origin);
  if (modo === 'ignorar') return;

  if (modo === 'rede-primeiro') {
    e.respondWith(
      fetch(req).then(r => guardar(req, r)).catch(async () => {
        // Sem internet: versão em cache (ignorando ?mesa= etc.) ou a página de aviso
        const emCache = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (emCache) return emCache;
        if (req.mode === 'navigate') return caches.match('/offline.html');
        return Response.error();
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cache => cache || fetch(req).then(r => guardar(req, r)))
  );
});

// Permite testar as funções no Node (tests/sw.test.mjs). No navegador "module" não existe.
if (typeof module !== 'undefined') module.exports = { estrategia, limparCaches };
