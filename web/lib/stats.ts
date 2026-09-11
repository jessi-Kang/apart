import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

/**
 * 익명 집계 스토어 (docs/04 question_stats + daily_score_dist).
 *
 * 집계 단위는 **(날짜, 구역, 게임)**이다.
 * - 구역별 공식전은 문제가 서로 다르므로 순위도 같은 구역 참가자끼리만 비교한다. 전국은 area = "".
 * - 게임(감별 O/X·이름 조립·진짜 찾기)도 문제가 완전히 다르다. 예전에는 세 게임이 한 칸을 써서
 *   조립 1번과 감별 1번의 정답률이 한 행에 합산되고 있었다 (조립·찾기는 아예 기록도 안 했다).
 * DATABASE_URL이 있으면 Neon Postgres(서버리스 인스턴스 간 공유), 없으면
 * 로컬 개발용 JSON 파일 스토어로 동작한다. DB 오류는 게임 진행을 막지 않도록
 * 전부 삼키고 "집계 중" 상태(null)로 강등한다.
 */

/** 공식전이 있는 세 창구 */
export type Mode = "ox" | "assemble" | "findreal";
export const MODES: Mode[] = ["ox", "assemble", "findreal"];
export const isMode = (x: unknown): x is Mode => MODES.includes(x as Mode);

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

/* ---------- Postgres 구현 ---------- */

async function pgRecordAnswer(date: string, area: string, mode: string, no: number, correct: boolean) {
  await sql!`
    INSERT INTO question_stats (date, area, mode, no, answered, correct)
    VALUES (${date}, ${area}, ${mode}, ${no}, 1, ${correct ? 1 : 0})
    ON CONFLICT (date, area, mode, no) DO UPDATE
    SET answered = question_stats.answered + 1,
        correct = question_stats.correct + ${correct ? 1 : 0}`;
}

async function pgAnswerRate(date: string, area: string, mode: string, no: number, minSample: number) {
  const rows = (await sql!`
    SELECT answered, correct FROM question_stats
    WHERE date = ${date} AND area = ${area} AND mode = ${mode} AND no = ${no}`) as {
    answered: number;
    correct: number;
  }[];
  const q = rows[0];
  if (!q || q.answered < minSample) return { rate: null, sample: q?.answered ?? 0 };
  return { rate: Math.round((q.correct / q.answered) * 100), sample: q.answered };
}

async function pgRecordFinish(date: string, area: string, mode: string, score: number) {
  await sql!`
    INSERT INTO score_dist (date, area, mode, score, cnt) VALUES (${date}, ${area}, ${mode}, ${score}, 1)
    ON CONFLICT (date, area, mode, score) DO UPDATE SET cnt = score_dist.cnt + 1`;
}

async function pgTopPercent(date: string, area: string, mode: string, score: number, minSample: number) {
  const rows = (await sql!`
    SELECT COALESCE(SUM(cnt), 0)::int AS total,
           COALESCE(SUM(cnt) FILTER (WHERE score > ${score}), 0)::int AS better
    FROM score_dist WHERE date = ${date} AND area = ${area} AND mode = ${mode}`) as { total: number; better: number }[];
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

/** 파일 스토어 키 — 구역·게임별로 칸을 나눈다 (전국 감별은 날짜만, 옛 파일과 호환) */
const keyOf = (date: string, area: string, mode: string) =>
  !area && mode === "ox" ? date : `${date}@${area}#${mode}`;

function dayOf(store: Store, date: string, area: string, mode: string): DayStats {
  const key = keyOf(date, area, mode);
  if (!store[key]) {
    store[key] = {
      perQuestion: Array.from({ length: 10 }, () => ({ answered: 0, correct: 0 })),
      scoreDist: Array.from({ length: 11 }, () => 0),
    };
  }
  return store[key];
}

/* ---------- 공개 API ---------- */

export async function recordAnswer(date: string, no: number, correct: boolean, area = "", mode: Mode = "ox"): Promise<void> {
  if (sql) {
    try {
      await pgRecordAnswer(date, area, mode, no, correct);
    } catch {
      /* 집계 실패는 판정을 막지 않는다 */
    }
    return;
  }
  const store = load();
  const q = dayOf(store, date, area, mode).perQuestion[no - 1];
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
  area = "",
  mode: Mode = "ox",
): Promise<{ rate: number | null; sample: number }> {
  if (sql) {
    try {
      return await pgAnswerRate(date, area, mode, no, minSample);
    } catch {
      return { rate: null, sample: 0 };
    }
  }
  const q = load()[keyOf(date, area, mode)]?.perQuestion[no - 1];
  if (!q || q.answered < minSample) return { rate: null, sample: q?.answered ?? 0 };
  return { rate: Math.round((q.correct / q.answered) * 100), sample: q.answered };
}

/** 하루치 문제별 정답률 일괄 조회 (어제 대장·홈 하이라이트용). 표본 미달은 rate=null */
export async function answerRates(
  date: string,
  minSample = 100,
  area = "",
  mode: Mode = "ox",
): Promise<{ no: number; rate: number | null; sample: number }[]> {
  const empty = Array.from({ length: 10 }, (_, i) => ({ no: i + 1, rate: null, sample: 0 }));
  if (sql) {
    try {
      const rows = (await sql`
        SELECT no, answered, correct FROM question_stats
        WHERE date = ${date} AND area = ${area} AND mode = ${mode}`) as {
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
  const day = load()[keyOf(date, area, mode)];
  if (!day) return empty;
  return empty.map((e) => {
    const q = day.perQuestion[e.no - 1];
    if (!q || q.answered < minSample) return { ...e, sample: q?.answered ?? 0 };
    return { no: e.no, rate: Math.round((q.correct / q.answered) * 100), sample: q.answered };
  });
}

export async function recordFinish(date: string, score: number, area = "", mode: Mode = "ox"): Promise<void> {
  if (!Number.isInteger(score) || score < 0 || score > 10) return;
  if (sql) {
    try {
      await pgRecordFinish(date, area, mode, score);
    } catch {
      /* 위와 동일 */
    }
    return;
  }
  const store = load();
  dayOf(store, date, area, mode).scoreDist[score] += 1;
  persist(store);
}

/** 상위 % (같은 점수 포함 이상 비율). 표본 미달 시 null */
export async function topPercent(
  date: string,
  score: number,
  minSample = 100,
  area = "",
  mode: Mode = "ox",
): Promise<{ top: number | null; sample: number }> {
  if (sql) {
    try {
      return await pgTopPercent(date, area, mode, score, minSample);
    } catch {
      return { top: null, sample: 0 };
    }
  }
  const day = load()[keyOf(date, area, mode)];
  if (!day) return { top: null, sample: 0 };
  const total = day.scoreDist.reduce((a, b) => a + b, 0);
  if (total < minSample) return { top: null, sample: total };
  const better = day.scoreDist.slice(score + 1).reduce((a, b) => a + b, 0);
  return { top: Math.max(1, Math.round(((better + 1) / total) * 100)), sample: total };
}
