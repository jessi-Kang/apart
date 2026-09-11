import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트. 홈 화면에 앱으로 설치할 수 있게 한다.
 * 서비스 워커는 일부러 두지 않는다 — 데일리 콘텐츠 특성상 캐시 신선도가
 * 설치 오프라인 지원보다 중요하고, 의존성 0 원칙도 지킨다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "아파트 감별사",
    short_name: "아파트 감별사",
    description: "이거 진짜 있는 아파트야, AI가 지어낸 거야? 하루 10문제 데일리 퀴즈",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f3",
    theme_color: "#f6f6f3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
