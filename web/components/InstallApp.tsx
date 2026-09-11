"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * 홈 화면 설치 안내. 브라우저 배너는 재량이라 안 뜨는 경우가 많아서,
 * beforeinstallprompt를 직접 받아 우리 버튼으로 띄운다.
 * iOS Safari는 이 이벤트가 없으므로 수동 설치 경로를 안내한다.
 */
export function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // 이미 앱으로 실행 중이면 아무것도 보여주지 않는다
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) setIos(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (deferred) {
    return (
      <div className="install-line">
        <span>홈 화면에 앱으로 설치할 수 있습니다</span>
        <button
          type="button"
          className="install-btn"
          onClick={async () => {
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === "accepted") setDeferred(null);
          }}
        >
          앱 설치
        </button>
      </div>
    );
  }

  if (ios) {
    return (
      <div className="install-line">
        <span>
          iPhone은 공유 버튼 → <strong>홈 화면에 추가</strong>로 앱처럼 설치됩니다
        </span>
      </div>
    );
  }

  return null;
}
