import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { CloudSync } from "@/components/CloudSync";
import { InstallToast } from "@/components/InstallToast";
import { PwaRegister } from "@/components/PwaRegister";

const SITE = "https://apt-game.app";
const DESC = "이거 진짜 있는 아파트야, AI가 지어낸 거야? 진짜 아파트와 AI가 지은 이름을 가려내는 데일리 퀴즈.";

export const metadata: Metadata = {
  // 상대 경로 이미지를 정식 도메인으로 풀어 준다. 없으면 미리보기 이미지
  // 주소가 localhost로 나가 카카오톡·슬랙에서 그림이 안 뜬다
  metadataBase: new URL(SITE),
  title: {
    default: "아파트 감별사",
    // 하위 화면은 "구역 명부 · 아파트 감별사"처럼 붙는다 — 링크만 봐도 어느 서비스인지 안다
    template: "%s · 아파트 감별사",
  },
  description: DESC,
  applicationName: "아파트 감별사",
  openGraph: {
    type: "website",
    siteName: "아파트 감별사",
    locale: "ko_KR",
    url: SITE,
    title: "아파트 감별사",
    description: DESC,
  },
  twitter: { card: "summary_large_image", title: "아파트 감별사", description: DESC },
  // SVG(벡터)와 고해상도 PNG를 함께 선언한다 — SVG를 못 쓰거나
  // 저해상도로 래스터하는 컨텍스트(구형 브라우저·검색결과·북마크)가 PNG를 집게.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "아파트 감별사",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f6f3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 설치 프롬프트는 번들 로드 전에 발사될 수 있어 헤드에서 선점해 둔다 */}
        <Script id="bip-capture" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__aptgamBIP=e;try{window.dispatchEvent(new Event('aptgam:bip'))}catch(_){}});`}
        </Script>
        {/* 매니페스트 링크는 직접 head에 둔다 — force-dynamic 페이지에서 Next가
            메타데이터를 body로 스트리밍하면 크롬이 매니페스트를 못 찾아 설치가 막힌다 */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <PwaRegister />
        <InstallToast />
        <CloudSync />
      </body>
    </html>
  );
}
