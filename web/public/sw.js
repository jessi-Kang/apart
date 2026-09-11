/**
 * 설치 요건용 서비스 워커. 캐시는 일부러 하지 않는다 —
 * 데일리 퀴즈는 항상 네트워크 최신본이어야 해서, 모든 요청을 그대로 통과시킨다.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
