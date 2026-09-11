import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { CloudSync } from "@/components/CloudSync";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "아파트 감별사",
  description: "이거 진짜 있는 아파트야, AI가 지어낸 거야? 하루 10문제 데일리 퀴즈",
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
        <CloudSync />
      </body>
    </html>
  );
}
