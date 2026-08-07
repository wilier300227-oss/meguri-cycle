/* =========================================================
   出張買取 記入システム — Service Worker（フェーズ③ オフライン対応）
   アプリシェル（HTML/JS/CSS/ライブラリ/アイコン）をキャッシュし、
   通信が無い現場でも 入力→署名→PDF/画像生成 まで完結できるようにする。
   台帳・Drive送信（GAS）はオンライン時のみ。オフライン中はアプリ側の
   localStorage キューに退避し、復帰時に自動再送する（app.js の flushQueue）。
   ※ ファイルを更新したら CACHE の版数を上げること（旧キャッシュは activate で破棄）。
   ========================================================= */
'use strict';

const CACHE = 'kaitori-v2';

/* オフラインで動くために最低限必要なアプリシェル */
const CORE = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'vendor/signature_pad.umd.min.js',
  'vendor/jspdf.umd.min.js',
  'vendor/html2canvas.min.js',
  'data/zip_hokuriku.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  '../logo/favicon.png',
];

/* 任意（無くてもオフライン動作は成立する）。config.js は端末により存在しないことがある */
const OPTIONAL = ['config.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // config.js は 404 でも install を失敗させない
    await Promise.all(OPTIONAL.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET 以外（GASへのPOST等）は素通し。キャッシュもしない。
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 別オリジン（GAS Web App / zipcloud 住所API 等）は常にネットワーク。
  // オフライン時は失敗させ、アプリ側で「未送信キュー」「住所は手入力」にフォールバックさせる。
  if (url.origin !== self.location.origin) return;

  // 同一オリジンGET：キャッシュ優先。無ければネットワーク取得しつつ動的キャッシュ。
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      // 正常な同一オリジンレスポンスは動的にキャッシュ（config.js 等の後追い取得も拾う）
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      // オフラインでナビゲーション（ページ遷移）に失敗したらキャッシュのトップを返す
      if (req.mode === 'navigate') {
        return (await caches.match('index.html')) || (await caches.match('./'));
      }
      throw e;
    }
  })());
});
