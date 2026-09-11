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
  // 헤드의 선점 스크립트가 번들 로드 전에 잡아둔 이벤트를 회수한다
  const stashed = (window as { __aptgamBIP?: BeforeInstallPromptEvent }).__aptgamBIP;
  if (stashed) deferred = stashed;
  window.addEventListener("aptgam:bip", () => {
    deferred = (window as { __aptgamBIP?: BeforeInstallPromptEvent }).__aptgamBIP ?? deferred;
    subs.forEach((f) => f());
  });
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

/**
 * 프롬프트가 올 때까지 잠깐 기다린다.
 * 크롬은 설치 조건이 다 맞아도 "이 사람이 이 사이트를 쓸 사람인가"를 자기 기준으로
 * 판단한 뒤에야 beforeinstallprompt를 준다. 설치 버튼을 누르는 행동 자체가 그 신호라
 * 누른 직후에 이벤트가 도착하는 경우가 있다. 바로 포기하지 않고 잠깐 기다린다.
 */
export function waitForInstall(ms = 2500): Promise<boolean> {
  if (deferred) return Promise.resolve(true);
  return new Promise((resolve) => {
    const off = onInstallReady(() => {
      if (!deferred) return;
      clearTimeout(timer);
      off();
      resolve(true);
    });
    const timer = setTimeout(() => {
      off();
      resolve(deferred !== null);
    }, ms);
  });
}

export type Platform = "ios" | "android" | "desktop";

/** 설치 경로가 기기마다 달라서, 안내는 이 값으로 갈라 쓴다 */
export function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
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
