import fs from "node:fs";
import path from "node:path";

/**
 * 익명 집계 스토어 (docs/04 question_stats + daily_score_dist).
 * M1: 단일 인스턴스 전제의 JSON 파일 스토어. 트래픽이 붙으면 Postgres/Turso로 교체
 * 가능하도록 이 모듈의 함수 시그니처만 유지한다.
 */

interface DayStats {
  perQuestion: { answered: number; correct: number }[];
  scoreDist: number[]; // index 0~10
}

type Store = Record<string, DayStats>;

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "stats.json");

let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    cache = {};
  }
  return cache;
}

function persist(store: Store) {
  // 서버리스(읽기 전용 FS)에서는 파일 쓰기가 실패한다. 그 경우 메모리 캐시로만
  // 동작한다(인스턴스 생존 동안 유효). 집계가 유실될 수 있지만 게임 진행을
  // 막지 않는 것이 우선 — 영속 스토어는 M2에서 Postgres로 교체 예정.
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, FILE);
  } catch {
    /* 메모리 폴백 */
  }
}

function dayOf(store: Store, date: string): DayStats {
  if (!store[date]) {
    store[date] = {
      perQuestion: Array.from({ length: 10 }, () => ({ answered: 0, correct: 0 })),
      scoreDist: Array.from({ length: 11 }, () => 0),
    };
  }
  return store[date];
}

export function recordAnswer(date: string, no: number, correct: boolean) {
  const store = load();
  const day = dayOf(store, date);
  const q = day.perQuestion[no - 1];
  if (!q) return;
  q.answered += 1;
  if (correct) q.correct += 1;
  persist(store);
}

/** 문제별 정답률. 표본 미달이면 rate=null (docs/02: 표본 100 미만 비표시) */
export function answerRate(date: string, no: number, minSample = 100): { rate: number | null; sample: number } {
  const day = load()[date];
  const q = day?.perQuestion[no - 1];
  if (!q || q.answered < minSample) return { rate: null, sample: q?.answered ?? 0 };
  return { rate: Math.round((q.correct / q.answered) * 100), sample: q.answered };
}

export function recordFinish(date: string, score: number) {
  if (!Number.isInteger(score) || score < 0 || score > 10) return;
  const store = load();
  dayOf(store, date).scoreDist[score] += 1;
  persist(store);
}

/** 상위 % (같은 점수 포함 이상 비율). 표본 미달 시 null */
export function topPercent(date: string, score: number, minSample = 100): { top: number | null; sample: number } {
  const day = load()[date];
  if (!day) return { top: null, sample: 0 };
  const total = day.scoreDist.reduce((a, b) => a + b, 0);
  if (total < minSample) return { top: null, sample: total };
  const better = day.scoreDist.slice(score + 1).reduce((a, b) => a + b, 0);
  return { top: Math.max(1, Math.round(((better + 1) / total) * 100)), sample: total };
}
