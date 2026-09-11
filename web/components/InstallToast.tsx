"use client";

import { useEffect, useState } from "react";
import { installReady, isIos, isStandalone, onInstallReady, promptInstall } from "@/lib/install";

const SNOOZE_KEY = "aptgam:install-snooze"; // 마지막으로 미룬 시각
const COUNT_KEY = "aptgam:install-snooze-n"; // 미룬 횟수
const SNOOZE_DAYS = 7;

function readNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}

/** 아직 참아 줄 기간인가 (영구 거절이면 -1로 저장돼 항상 참는다) */
function snoozed(): boolean {
  const at = readNum(SNOOZE_KEY);
  if (at < 0) return true; // 다시 보지 않기
  return at > 0 && Date.now() - at < SNOOZE_DAYS * 86_400_000;
}

/**
 * 설치 안내 토스트 — 브라우저 배너는 노출 자체가 브라우저 재량이라,
 * 설치 가능 상태를 잡으면 우리가 직접 띄운다.
 * 한 번 미룬 사람에게는 두 번째부터 "다시 보지 않기"를 준다.
 * 완전히 꺼도 푸터의 상시 설치 링크는 남는다.
 */
export function InstallToast() {
  const [shown, setShown] = useState(false);
  const [ios, setIos] = useState(false);
  const [again, setAgain] = useState(false); // 이미 한 번 미룬 사람인가

  useEffect(() => {
    if (isStandalone() || snoozed()) return;
    const iphone = isIos();
    setIos(iphone);
    setAgain(readNum(COUNT_KEY) >= 1);
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
      if (again) {
        localStorage.setItem(SNOOZE_KEY, "-1"); // 영구
      } else {
        localStorage.setItem(SNOOZE_KEY, String(Date.now()));
        localStorage.setItem(COUNT_KEY, "1");
      }
    } catch {
      /* 저장 실패는 이번 세션에만 적용 */
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
          {ios ? "Safari 공유 버튼에서 “홈 화면에 추가”를 누르세요" : "홈 화면에서 바로 창구를 엽니다"}
        </span>
      </div>
      <div className="it-actions">
        {!ios && (
          <button type="button" className="btn btn-next it-go" onClick={() => void install()}>
            설치
          </button>
        )}
        <button type="button" className="it-close" onClick={close}>
          {again ? "다시 보지 않기" : "나중에"}
        </button>
      </div>
    </div>
  );
}
