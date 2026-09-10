import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

/**
 * 익명 집계 스토어 (docs/04 question_stats + daily_score_dist).
 * DATABASE_URL이 있으면 Neon Postgres(서버리스 인스턴스 간 공유), 없으면
 * 로컬 개발용 JSON 파일 스토어로 동작한다. DB 오류는 게임 진행을 막지 않도록
 * 전부 삼키고 "집계 중" 상태(null)로 강등한다.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

/* ---------- Postgres 구현 ---------- */

async function pgRecordAnswer(date: string, no: number, correct: boolean) {
  await sql!`
    INSERT INTO question_stats (date, no, answered, correct)
    VALUES (${date}, ${no}, 1, ${correct ? 1 : 0})
    ON CONFLICT (date, no) DO UPDATE
    SET answered = question_stats.answered + 1,
        correct = question_stats.correct + ${correct ? 1 : 0}`;
}

async function pgAnswerRate(date: string, no: number, minSample: number) {
  const rows = (await sql!`
    SELECT answered, correct FROM question_stats WHERE date = ${date} AND no = ${no}`) as {
    answered: number;
    correct: number;
  }[];
  const q = rows[0];
  if (!q || q.answered < minSample) return { rate: null, sample: q?.answered ?? 0 };
  return { rate: Math.round((q.correct / q.answered) * 100), sample: q.answered };
}

async function pgRecordFinish(date: string, score: number) {
  await sql!`
    INSERT INTO score_dist (date, score, cnt) VALUES (${date}, ${score}, 1)
    ON CONFLICT (date, score) DO UPDATE SET cnt = score_dist.cnt + 1`;
}

async function pgTopPercent(date: string, score: number, minSample: number) {
  const rows = (await sql!`
    SELECT COALESCE(SUM(cnt), 0)::int AS total,
           COALESCE(SUM(cnt) FILTER (WHERE score > ${score}), 0)::int AS better
    FROM score_dist WHERE date = ${date}`) as { total: number; better: number }[];
  const { total, better } = rows[0] ?? { total: 0, better: 0 };
  if (total < minSample) return { top: null, sample: total };
  return { top: Math.max(1, Math.round(((better + 1) / total) * 100)), sample: total };
}

/* ---------- 로컬 파일 폴백 (개발용) ---------- */

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
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, FILE);
  } catch {
    /* 읽기 전용 FS: 메모리 캐시로만 동작 */
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

/* ---------- 공개 API ---------- */

export async function recordAnswer(date: string, no: number, correct: boolean): Promise<void> {
  if (sql) {
    try {
      await pgRecordAnswer(date, no, correct);
    } catch {
      /* 집계 실패는 판정을 막지 않는다 */
    }
    return;
  }
  const store = load();
  const q = dayOf(store, date).perQuestion[no - 1];
  if (!q) return;
  q.answered += 1;
  if (correct) q.correct += 1;
  persist(store);
}

/** 문제별 정답률. 표본 미달이면 rate=null (docs/02: 표본 100 미만 비표시) */
export async function answerRate(
  date: string,
  no: number,
  minSample = 100,
): Promise<{ rate: number | null; sample: number }> {
  if (sql) {
    try {
      return await pgAnswerRate(date, no, minSample);
    } catch {
      return { rate: null, sample: 0 };
    }
  }
  const q = load()[date]?.perQuestion[no - 1];
  if (!q || q.answered < minSample) return { rate: null, sample: q?.answered ?? 0 };
  return { rate: Math.round((q.correct / q.answered) * 100), sample: q.answered };
}

/** 하루치 문제별 정답률 일괄 조회 (어제 대장·홈 하이라이트용). 표본 미달은 rate=null */
export async function answerRates(
  date: string,
  minSample = 100,
): Promise<{ no: number; rate: number | null; sample: number }[]> {
  const empty = Array.from({ length: 10 }, (_, i) => ({ no: i + 1, rate: null, sample: 0 }));
  if (sql) {
    try {
      const rows = (await sql`
        SELECT no, answered, correct FROM question_stats WHERE date = ${date}`) as {
        no: number;
        answered: number;
        correct: number;
      }[];
      return empty.map((e) => {
        const q = rows.find((r) => Number(r.no) === e.no);
        if (!q || q.answered < minSample) return { ...e, sample: q?.answered ?? 0 };
        return { no: e.no, rate: Math.round((q.correct / q.answered) * 100), sample: q.answered };
      });
    } catch {
      return empty;
    }
  }
  const day = load()[date];
  if (!day) return empty;
  return empty.map((e) => {
    const q = day.perQuestion[e.no - 1];
    if (!q || q.answered < minSample) return { ...e, sample: q?.answered ?? 0 };
    return { no: e.no, rate: Math.round((q.correct / q.answered) * 100), sample: q.answered };
  });
}

export async function recordFinish(date: string, score: number): Promise<void> {
  if (!Number.isInteger(score) || score < 0 || score > 10) return;
  if (sql) {
    try {
      await pgRecordFinish(date, score);
    } catch {
      /* 위와 동일 */
    }
    return;
  }
  const store = load();
  dayOf(store, date).scoreDist[score] += 1;
  persist(store);
}

/** 상위 % (같은 점수 포함 이상 비율). 표본 미달 시 null */
export async function topPercent(
  date: string,
  score: number,
  minSample = 100,
): Promise<{ top: number | null; sample: number }> {
  if (sql) {
    try {
      return await pgTopPercent(date, score, minSample);
    } catch {
      return { top: null, sample: 0 };
    }
  }
  const day = load()[date];
  if (!day) return { top: null, sample: 0 };
  const total = day.scoreDist.reduce((a, b) => a + b, 0);
  if (total < minSample) return { top: null, sample: total };
  const better = day.scoreDist.slice(score + 1).reduce((a, b) => a + b, 0);
  return { top: Math.max(1, Math.round(((better + 1) / total) * 100)), sample: total };
}
