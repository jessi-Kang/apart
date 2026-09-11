/**
 * 설치 요건용 서비스 워커. 캐시는 일부러 하지 않는다 —
 * 데일리 콘텐츠는 항상 네트워크 최신본이어야 한다.
 *
 * fetch 핸들러는 등록만 하고 respondWith는 부르지 않는다.
 * 전에는 event.respondWith(fetch(event.request))로 그대로 통과시켰는데,
 * 그러면 네트워크가 한 번 흔들릴 때 워커가 실패를 떠안아
 * "FetchEvent resulted in a network error" 콘솔 오류가 남았다.
 * respondWith를 부르지 않으면 브라우저가 평소대로 네트워크를 타고,
 * 설치 요건(fetch 핸들러 존재)은 그대로 충족된다.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* 브라우저 기본 동작에 맡긴다 */
});
