"use client";

import { useEffect, useState } from "react";
import { installReady, isIos, isStandalone, onInstallReady, promptInstall } from "@/lib/install";

const SNOOZE_KEY = "aptgam:install-snooze";
const SNOOZE_DAYS = 7;

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY) ?? "0");
    return Date.now() - at < SNOOZE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * 설치 안내 토스트 — 브라우저 배너는 노출 자체가 브라우저 재량이라,
 * 설치 가능 상태를 잡으면 우리가 직접 띄운다.
 * 닫으면 일주일간 다시 뜨지 않고, 푸터의 상시 링크는 그대로 남는다.
 */
export function InstallToast() {
  const [shown, setShown] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;
    const iphone = isIos();
    setIos(iphone);
    // 프롬프트를 잡았거나(안드로이드·데스크탑 크롬) 수동 설치만 되는 iOS
    const reveal = () => setShown(installReady() || iphone);
    const t = setTimeout(reveal, 2500); // 들어오자마자 들이밀지 않는다
    const off = onInstallReady(() => setTimeout(reveal, 600));
    return () => {
      clearTimeout(t);
      off();
    };
  }, []);

  if (!shown) return null;

  const close = () => {
    setShown(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      /* 저장 실패는 무시 — 이번 세션만 닫힌다 */
    }
  };

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) setShown(false);
  };

  return (
    <div className="install-toast" role="dialog" aria-label="앱 설치 안내">
      <div className="it-body">
        <b>앱으로 설치</b>
        <span>
          {ios
            ? "Safari 공유 버튼에서 “홈 화면에 추가”를 누르세요"
            : "홈 화면에서 바로 창구를 엽니다"}
        </span>
      </div>
      <div className="it-actions">
        {!ios && (
          <button type="button" className="btn btn-next it-go" onClick={() => void install()}>
            설치
          </button>
        )}
        <button type="button" className="it-close" onClick={close} aria-label="설치 안내 닫기">
          나중에
        </button>
      </div>
    </div>
  );
}
