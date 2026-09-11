"use client";

/**
 * 앱 설치 프롬프트 공용 저장소.
 * beforeinstallprompt는 페이지당 한 번 오는 이벤트라 모듈 전역에서 잡아 두고,
 * 홈 안내줄과 푸터 링크가 같이 꺼내 쓴다.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const subs = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    subs.forEach((f) => f());
  });
}

/** 설치 프롬프트가 잡히면 알려준다. 반환값은 구독 해제 함수 */
export function onInstallReady(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function installReady(): boolean {
  return deferred !== null;
}

/** 브라우저 설치 다이얼로그를 띄운다. 수락하면 true */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  if (outcome === "accepted") {
    deferred = null;
    subs.forEach((f) => f());
  }
  return outcome === "accepted";
}

/** 이미 앱으로 실행 중인가 */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    return Boolean((navigator as { standalone?: boolean }).standalone);
  } catch {
    return false;
  }
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
