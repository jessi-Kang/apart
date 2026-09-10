"use client";

/**
 * 효과음 (Web Audio 합성, 오디오 파일·의존성 0)
 * 접수처 세계관의 물성음: 도장 쾅, 종이 탁, 콤보 딩.
 * - AudioContext는 첫 사용자 제스처(클릭 핸들러 안 호출)에서 lazy 생성
 * - 음소거는 localStorage에 저장, 기본은 켬
 */

const MUTE_KEY = "aptgam:muted";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* 무시 */
  }
}

/** 짧은 화이트노이즈 버퍼 (종이·타격 질감) */
function noiseBurst(ac: AudioContext, t0: number, dur: number, gain: number, filterHz: number) {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filterHz;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t0);
}

function tone(
  ac: AudioContext,
  t0: number,
  freq: number,
  freqEnd: number,
  dur: number,
  gain: number,
  type: OscillatorType = "sine",
) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function withAudio(fn: (ac: AudioContext, t0: number) => void) {
  if (isMuted()) return;
  const ac = audio();
  if (!ac) return;
  try {
    fn(ac, ac.currentTime);
  } catch {
    /* 사운드 실패는 게임을 막지 않는다 */
  }
}

/** 조각·선택지 탭: 종이 위 손끝 */
export function sfxTap() {
  withAudio((ac, t) => {
    noiseBurst(ac, t, 0.04, 0.12, 2600);
    tone(ac, t, 880, 660, 0.05, 0.05, "triangle");
  });
}

/** 정답 도장: 묵직한 쾅 + 종이 스냅 */
export function sfxStampRight() {
  withAudio((ac, t) => {
    tone(ac, t, 150, 55, 0.16, 0.5);
    noiseBurst(ac, t, 0.07, 0.3, 1800);
    tone(ac, t + 0.09, 660, 990, 0.09, 0.08, "triangle"); // 살짝 밝은 여운
  });
}

/** 오답 도장: 더 낮고 둔한 이중 노크 */
export function sfxStampWrong() {
  withAudio((ac, t) => {
    tone(ac, t, 110, 45, 0.15, 0.5);
    noiseBurst(ac, t, 0.06, 0.25, 1000);
    tone(ac, t + 0.12, 92, 40, 0.16, 0.4);
  });
}

/** 콤보 상승: 가벼운 2음 딩 */
export function sfxCombo() {
  withAudio((ac, t) => {
    tone(ac, t, 660, 660, 0.07, 0.09, "triangle");
    tone(ac, t + 0.08, 880, 880, 0.11, 0.09, "triangle");
  });
}

/** 결과 등급 도장: 쾅 + 상승 3음 */
export function sfxResult() {
  withAudio((ac, t) => {
    tone(ac, t, 140, 50, 0.18, 0.5);
    noiseBurst(ac, t, 0.08, 0.3, 1600);
    tone(ac, t + 0.16, 523, 523, 0.09, 0.08, "triangle");
    tone(ac, t + 0.26, 659, 659, 0.09, 0.08, "triangle");
    tone(ac, t + 0.36, 784, 784, 0.16, 0.09, "triangle");
  });
}
