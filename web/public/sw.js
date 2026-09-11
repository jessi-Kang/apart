/**
 * PWA 서비스 워커. 캐시는 일부러 하지 않는다 —
 * 데일리 콘텐츠는 항상 네트워크 최신본이어야 한다.
 *
 * fetch 핸들러도 두지 않는다. 예전 크롬은 설치 요건으로 fetch 핸들러를
 * 요구했지만 지금은 아니다. 빈 핸들러를 남겨 두면 크롬이 "no-op fetch
 * handler는 네비게이션에 오버헤드만 준다"고 경고한다.
 * 크로미움 141에서 핸들러 없이도 Page.getInstallabilityErrors가 비었고
 * beforeinstallprompt도 그대로 발화하는 것을 확인하고 제거했다.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
