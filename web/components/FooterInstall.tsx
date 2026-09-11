"use client";

import { useEffect, useState } from "react";
import { installReady, isStandalone, platform, promptInstall, waitForInstall, type Platform } from "@/lib/install";

/** 브라우저가 설치 다이얼로그를 안 내줄 때 대신 알려 줄 손길. 기기마다 경로가 다르다 */
const STEPS: Record<Platform, { path: string[]; note: string }> = {
  android: {
    path: ["브라우저 메뉴", "앱 설치"],
    note: "메뉴에 '앱 설치'가 없으면 '홈 화면에 추가'를 누르세요.",
  },
  ios: {
    path: ["공유 버튼", "홈 화면에 추가"],
    note: "사파리에서만 됩니다. 다른 브라우저에는 이 메뉴가 없습니다.",
  },
  desktop: {
    path: ["주소창 오른쪽 설치 아이콘"],
    note: "아이콘이 없으면 브라우저 메뉴의 '앱 설치'를 누르세요.",
  },
};

/**
 * 푸터의 상시 "앱 설치" 링크 — 어느 화면에서든 설치 동선을 연다.
 *
 * 누르면 브라우저 설치 다이얼로그를 띄우는 게 1번이고, 브라우저가 끝내 안 내주면
 * 그때만 손으로 하는 경로를 보여준다. 예전에는 폰에서도 "주소창 오른쪽 설치 아이콘"
 * 이라는 데스크탑 설명이 떠서, 없는 버튼을 찾으라는 안내가 되고 있었다.
 */
export function FooterInstall() {
  // 기본 노출(SSR에도 나가게) — 이미 앱으로 실행 중일 때만 숨긴다
  const [shown, setShown] = useState(true);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<Platform | null>(null);

  useEffect(() => {
    if (isStandalone()) setShown(false);
  }, []);

  if (!shown) return null;

  const onClick = async () => {
    if (busy) return;
    if (help) {
      setHelp(null);
      return;
    }
    setBusy(true);
    try {
      // 누른 행동이 크롬의 판단 근거가 되기도 해서, 바로 포기하지 않고 잠깐 기다린다
      const ready = installReady() || (await waitForInstall());
      if (ready && (await promptInstall())) {
        setShown(false);
        return;
      }
      setHelp(platform());
    } finally {
      setBusy(false);
    }
  };

  const steps = help ? STEPS[help] : null;

  return (
    <>
      {" · "}
      <button type="button" className="foot-install" onClick={() => void onClick()} aria-expanded={Boolean(help)}>
        {busy ? "설치 여는 중" : "앱 설치"}
      </button>
      {steps && (
        <span className="install-tip">
          <b>직접 설치하기</b>
          <span className="it-path">
            {steps.path.map((s, i) => (
              <span key={s}>
                {i > 0 && <i aria-hidden="true">›</i>}
                {s}
              </span>
            ))}
          </span>
          <small>{steps.note}</small>
          <small>이미 설치돼 있으면 이 메뉴가 나오지 않습니다.</small>
        </span>
      )}
    </>
  );
}
