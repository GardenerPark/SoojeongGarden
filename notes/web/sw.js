// 앱 껍데기만 저장해 두어, 연결이 없어도 앱이 열리고 기기에 보관한 메모를 쓸 수 있게 한다.
// 먼저 네트워크에서 받고, 안 되면 저장해 둔 것을 쓴다. /api는 건드리지 않는다.
const CACHE = 'notes-shell-v1';
const SHELL = ['/', '/index.html', '/app.js', '/app.css', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const key = url.pathname === '/' || !SHELL.includes(url.pathname) ? '/index.html' : url.pathname;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copy));
        }
        return res;
      })
      .catch(() => caches.match(SHELL.includes(url.pathname) ? url.pathname : key)),
  );
});
