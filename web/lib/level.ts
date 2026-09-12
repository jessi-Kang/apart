"use client";

/**
 * 감별사 레벨 (누적 성장 시스템)
 * - 데일리 등급 도장이 "오늘의 판정"이라면, 레벨은 날짜를 넘어 쌓이는
 *   장기 성장축이다. 모든 게임의 정답이 점수(XP)가 된다.
 * - 직급은 접수처 세계관의 공무원 콘셉트. 레벨은 상한 없이 계속 오른다.
 * - 저장은 localStorage(게스트 기준). 계정 도입(M2) 시 서버로 승격한다.
 */

import { schedulePush } from "./cloud";

const KEY = "aptgam:xp";
/**
 * 구역별 누적 점수.
 * 구역은 사용자가 딸린 값이 아니라 그때그때 고르는 출제 범위다.
 * 서울에서도 치고 부산에서도 쳤다면 두 명부 모두에 이름이 올라야 하므로,
 * 점수도 구역마다 따로 쌓는다. 빈 구역(전국)도 제 칸을 갖는다.
 */
const AREA_XP_KEY = "aptgam:xp-area";

function readAreaXp(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(AREA_XP_KEY) ?? "{}") as Record<string, number>;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** 그 구역에 쌓인 점수 (명부 순위의 기준) */
export function areaXp(area: string): number {
  return Math.max(0, Math.round(readAreaXp()[area] ?? 0));
}

/** 기록이 있는 구역 목록 */
export function playedAreas(): string[] {
  return Object.entries(readAreaXp())
    .filter(([, v]) => v > 0)
    .map(([k]) => k);
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number; // 누적 총점
  into: number; // 현재 레벨에서 쌓은 점수
  need: number; // 현재 레벨을 마치는 데 필요한 점수
}

export interface XpResult {
  gained: number;
  before: LevelInfo;
  after: LevelInfo;
  leveledUp: boolean;
}

const TITLES: [number, string][] = [
  [1, "견습 감별사"],
  [3, "감별 주무관"],
  [5, "감별 주임"],
  [8, "감별 계장"],
  [11, "감별 과장"],
  [15, "감별 국장"],
  [20, "수석 감별관"],
  [26, "감별 명장"],
];

export function titleFor(level: number): string {
  let t = TITLES[0][1];
  for (const [min, name] of TITLES) if (level >= min) t = name;
  return t;
}

/** 레벨 n을 마치는 데 필요한 점수 — 완만하게 오르는 커브 */
const needFor = (level: number) => 100 + (level - 1) * 40;

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= needFor(level)) {
    rest -= needFor(level);
    level += 1;
  }
  return { level, title: titleFor(level), xp: Math.max(0, xp), into: rest, need: needFor(level) };
}

function readXp(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function currentLevel(): LevelInfo {
  return levelFromXp(readXp());
}

/**
 * 점수를 더한다.
 * @param area 이 점수를 쌓은 담당 구역. 직급(전체 누적)과 구역별 점수에 함께 들어간다.
 *   직급은 어디서 쳤든 하나로 쌓이고, 명부 순위는 구역마다 따로 센다.
 */
export function addXp(points: number, area = ""): XpResult {
  const before = levelFromXp(readXp());
  const add = Math.max(0, Math.round(points));
  const xp = before.xp + add;
  try {
    localStorage.setItem(KEY, String(xp));
    const byArea = readAreaXp();
    byArea[area] = (byArea[area] ?? 0) + add;
    localStorage.setItem(AREA_XP_KEY, JSON.stringify(byArea));
  } catch {
    /* 무시 */
  }
  schedulePush();
  const after = levelFromXp(xp);
  return { gained: xp - before.xp, before, after, leveledUp: after.level > before.level };
}
