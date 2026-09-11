"use client";

import { useEffect, useState } from "react";
import { SYNC_EVENT } from "@/lib/cloud";
import { currentLevel, type LevelInfo, type XpResult } from "@/lib/level";
import { sfxLevelUp } from "@/lib/sound";

/** 감별사 레벨 표시. result가 있으면 이번 게임 획득 점수·레벨 업을 함께 보여준다 */
export function LevelBar({ result }: { result?: XpResult | null }) {
  const [info, setInfo] = useState<LevelInfo | null>(result?.after ?? null);

  useEffect(() => {
    if (result) {
      setInfo(result.after);
      if (result.leveledUp) sfxLevelUp();
      return;
    }
    setInfo(currentLevel());
  }, [result]);

  if (!info) return null;
  return (
    <div className="levelbar">
      <p className="lv-head">
        <b className="mono">Lv.{info.level}</b> {info.title}
        {result && result.gained > 0 && <span className="lv-gain">+{result.gained}점</span>}
        {result?.leveledUp && <span className="lv-up">레벨 업</span>}
      </p>
      <div className="gauge">
        <i style={{ transform: `scaleX(${Math.min(1, info.into / info.need)})` }} />
      </div>
    </div>
  );
}

/** 홈 카드용 한 줄 요약 */
export function LevelChip() {
  const [info, setInfo] = useState<LevelInfo | null>(null);
  useEffect(() => {
    const refresh = () => setInfo(currentLevel());
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => window.removeEventListener(SYNC_EVENT, refresh);
  }, []);
  if (!info) return null;
  return (
    <span className="status-chip">
      <b>Lv.{info.level}</b> {info.title} · 다음 레벨까지 {info.need - info.into}점
    </span>
  );
}
