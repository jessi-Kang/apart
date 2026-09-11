"use client";

import { useEffect, useState } from "react";
import { installReady, isIos, isStandalone, onInstallReady, promptInstall } from "@/lib/install";

/**
 * 푸터의 상시 "앱 설치" 링크 — 어느 페이지에서든 설치 동선을 연다.
 * 프롬프트를 잡아둔 상태면 바로 다이얼로그를 띄우고,
 * 못 잡은 환경(iOS, 이미 뜬 배너를 닫은 경우 등)은 수동 경로를 안내한다.
 */
export function FooterInstall() {
  const [shown, setShown] = useState(false);
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    setShown(!isStandalone());
  }, []);

  if (!shown) return null;

  const onClick = async () => {
    if (installReady()) {
      setTip(null);
      const accepted = await promptInstall();
      if (accepted) setShown(false);
      return;
    }
    setTip((prev) =>
      prev
        ? null
        : isIos()
          ? "iPhone: Safari 공유 버튼 → “홈 화면에 추가”를 누르면 앱으로 설치됩니다"
          : "주소창 오른쪽의 설치 아이콘 또는 브라우저 메뉴의 “앱 설치”를 누르세요",
    );
  };

  return (
    <>
      {" · "}
      <button type="button" className="foot-install" onClick={() => void onClick()}>
        앱 설치
      </button>
      {tip && <span className="install-tip">{tip}</span>}
    </>
  );
}
