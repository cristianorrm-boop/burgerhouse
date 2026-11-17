// Service Worker: app abre rápido e funciona com internet instável.
// Ao publicar uma nova versão, aumente o número abaixo para forçar a atualização.
const VERSAO = 'bh-2.0.0-f1';
const ESSENCIAIS = [
  '/', '/index.html', '/pedido.html', '/admin/', '/admin/index.html', '/offline.html',
  '/css/base.css?v=2.0.0-f1', '/css/cliente.css?v=2.0.0-f1', '/css/admin.css?v=2.0.0-f1',
  '/js/config.js?v=2.0.0-f1', '/js/db.js?v=2.0.0-f1', '/js/utils.js?v=2.0.0-f1', '/js/seed.js?v=2.0.0-f1', '/js/cliente.js?v=2.0.0-f1', '/js/pedido.js?v=2.0.0-f1',
  '/js/admin/app.js?v=2.0.0-f1', '/js/admin/acoes.js?v=2.0.0-f1', '/js/admin/pedidos.js?v=2.0.0-f1', '/js/admin/mesas.js?v=2.0.0-f1', '/js/admin/cardapio.js?v=2.0.0-f1',
  '/js/admin/cupons.js?v=2.0.0-f1', '/js/admin/clientes.js?v=2.0.0-f1', '/js/admin/financeiro.js?v=2.0.0-f1', '/js/admin/dashboard.js?v=2.0.0-f1',
  '/js/admin/entrega.js?v=2.0.0-f1', '/js/admin/loja.js?v=2.0.0-f1', '/js/admin/impressora.js?v=2.0.0-f1',
  '/manifest.json', '/admin/manifest.json', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca interceptar Firebase/Google APIs (dados em tempo real) nem as funções da Vercel
  if (/googleapis\.com|firebaseio\.com|identitytoolkit|securetoken/.test(url.host) || url.pathname.startsWith('/api/') || url.pathname.startsWith('/p/')) return;

  // Páginas: rede primeiro, cache como reserva
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); return r; })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('/offline.html'))
    );
    return;
  }

  // Arquivos estáticos (inclui fontes, ícones e SDK do Firebase): cache primeiro, atualiza em segundo plano
  e.respondWith(
    caches.match(req).then(cache => {
      const rede = fetch(req).then(r => {
        if (r.ok || r.type === 'opaque') { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
        return r;
      }).catch(() => cache);
      return cache || rede;
    })
  );
});
