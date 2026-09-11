"use client";

/**
 * 게임 배경음 (창구 안에서만 흐른다)
 * - mp3를 Web Audio로 디코드해 이어 붙인다. <audio loop>는 mp3 인코더 패딩 때문에
 *   한 바퀴마다 미세한 공백이 생겨서, 루프가 끊기면 배경음의 의미가 없다.
 * - 효과음이 울릴 때는 잠깐 몸을 낮춘다(더킹). 게임 중에는 도장 소리가
 *   배경음보다 잘 들려야 한다.
 * - 브라우저 정책상 소리는 첫 사용자 제스처 이후에만 난다.
 */

const SRC = "/bgm/game-loop.mp3";
const KEY = "aptgam:bgm";
const VOLUME = 0.12;
const DUCKED = 0.035; // 효과음이 울리는 동안 낮추는 높이
const FADE = 0.9; // 초

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<AudioBuffer | null> | null = null;
let armed = false;
let wanted = false; // 이 화면이 배경음을 원하는가 (게임 화면만 true)
const subs = new Set<() => void>();

export function bgmEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off"; // 기본 켜짐
  } catch {
    return true;
  }
}

export function onBgmChange(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
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

async function load(): Promise<AudioBuffer | null> {
  if (buffer) return buffer;
  loading ??= (async () => {
    try {
      const res = await fetch(SRC);
      if (!res.ok) return null;
      buffer = await ctx!.decodeAudioData(await res.arrayBuffer());
      return buffer;
    } catch {
      return null; // 배경음 실패는 게임을 막지 않는다
    }
  })();
  return loading;
}

function rampTo(target: number, seconds: number) {
  if (!ctx || !gain) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + seconds);
}

async function play() {
  if (!wanted || !bgmEnabled() || !ensureContext()) return;
  const buf = await load();
  if (!buf || !ctx || !gain) return;
  if (!source) {
    source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    source.connect(gain);
    source.start(0);
  }
  rampTo(VOLUME, FADE);
}

function stop() {
  rampTo(0, FADE * 0.5);
}

/** 효과음이 울리는 순간 배경음을 잠깐 낮춘다 */
export function duckBgm(ms = 420) {
  if (!ctx || !gain || !wanted || !bgmEnabled()) return;
  if (gain.gain.value <= DUCKED) return;
  rampTo(DUCKED, 0.05);
  window.setTimeout(() => {
    if (wanted && bgmEnabled()) rampTo(VOLUME, 0.45);
  }, ms);
}

export function setBgmEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* 저장 실패는 이번 판에만 적용 */
  }
  if (on) void play();
  else stop();
  subs.forEach((f) => f());
}

/**
 * 이 화면에서 배경음을 켠다. 첫 제스처 전에는 파일도 받지 않는다.
 * 반환값은 해제 함수 — 화면을 떠나면 소리를 멈춘다.
 */
export function armBgm(): () => void {
  wanted = true;
  if (typeof window !== "undefined" && !armed) {
    armed = true;
    const kick = () => void play();
    window.addEventListener("pointerdown", kick);
    window.addEventListener("keydown", kick);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else void play();
    });
  }
  void play();
  return () => {
    wanted = false;
    stop();
  };
}
