// 홈 화면 앱용 최소 서비스워커.
// 뉴스(/data/)는 절대 캐시하지 않고 항상 인터넷에서 새로 받는다.
// 화면 파일만 인터넷이 끊겼을 때를 대비해 보관한다.
const CACHE = "saudi-watch-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/data/")) return;

  // 화면: 인터넷 우선, 실패하면 보관본
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
