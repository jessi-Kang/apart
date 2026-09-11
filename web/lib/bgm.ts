"use client";

/**
 * 배경음 (접수 창구 앰비언스)
 * - mp3를 Web Audio로 디코드해 이어 붙인다. <audio loop>는 mp3 인코더 패딩 때문에
 *   한 바퀴마다 미세한 공백이 생겨서, 루프가 끊기면 배경음의 의미가 없다.
 * - 브라우저 정책상 소리는 첫 사용자 제스처 이후에만 난다. 그래서 한 번만 걸리는
 *   전역 리스너로 시작하고, 그 뒤로는 탭이 숨으면 멈추고 돌아오면 다시 켠다.
 * - 볼륨은 효과음에 묻힐 만큼 낮게. 페이드로 들고 난다.
 */

const SRC = "/bgm/office-loop.mp3";
const KEY = "aptgam:bgm";
const VOLUME = 0.14;
const FADE = 0.8; // 초

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<AudioBuffer | null> | null = null;
let started = false;
const subs = new Set<() => void>();

export function bgmEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off"; // 기본 켜짐
  } catch {
    return true;
  }
}

function notify() {
  subs.forEach((f) => f());
}

export function onBgmChange(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

async function load(): Promise<AudioBuffer | null> {
  if (buffer) return buffer;
  loading ??= (async () => {
    try {
      const res = await fetch(SRC);
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      buffer = await ctx!.decodeAudioData(bytes);
      return buffer;
    } catch {
      return null; // 배경음 실패는 게임을 막지 않는다
    }
  })();
  return loading;
}

function ensureContext(): boolean {
  if (typeof window === "undefined") return false;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    gain ??= (() => {
      const g = ctx!.createGain();
      g.gain.value = 0;
      g.connect(ctx!.destination);
      return g;
    })();
    return true;
  } catch {
    return false;
  }
}

/** 재생 시작 (이미 돌고 있으면 볼륨만 올린다) */
export async function startBgm() {
  if (!bgmEnabled() || !ensureContext()) return;
  const buf = await load();
  if (!buf || !ctx || !gain) return;
  if (!source) {
    source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    source.connect(gain);
    source.start(0);
    started = true;
  }
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + FADE);
}

/** 볼륨만 내린다 (소스는 계속 돌려 둔다 — 다시 켤 때 즉시 이어지도록) */
function fadeOut() {
  if (!ctx || !gain) return;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE * 0.5);
}

export function setBgmEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* 저장 실패는 이번 세션에만 적용 */
  }
  if (on) void startBgm();
  else fadeOut();
  notify();
}

/** 첫 제스처에서 시작하도록 걸어 둔다. 탭이 숨으면 멈춘다 */
export function armBgm() {
  if (typeof window === "undefined" || started) return;
  const kick = () => {
    void startBgm();
    window.removeEventListener("pointerdown", kick);
    window.removeEventListener("keydown", kick);
  };
  window.addEventListener("pointerdown", kick, { once: false });
  window.addEventListener("keydown", kick, { once: false });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) fadeOut();
    else if (bgmEnabled()) void startBgm();
  });
}
