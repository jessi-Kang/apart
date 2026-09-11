"use client";

import { useEffect, useState } from "react";
import { installReady, isIos, isStandalone, onInstallReady, promptInstall } from "@/lib/install";

/**
 * 홈 화면 설치 안내. 브라우저 배너는 재량이라 안 뜨는 경우가 많아서,
 * beforeinstallprompt를 직접 받아 우리 버튼으로 띄운다.
 * iOS Safari는 이 이벤트가 없으므로 수동 설치 경로를 안내한다.
 */
export function InstallApp() {
  const [ready, setReady] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setReady(installReady());
    setIos(isIos());
    return onInstallReady(() => setReady(installReady()));
  }, []);

  if (ready) {
    return (
      <div className="install-line">
        <span>홈 화면에 앱으로 설치할 수 있습니다</span>
        <button type="button" className="install-btn" onClick={() => void promptInstall()}>
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
