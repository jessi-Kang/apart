"use client";

import { useEffect, useRef, useState } from "react";
import { sfxTimeout, sfxUrgent } from "@/lib/sound";

/** 문제 제한시간 바. active 동안 줄어들고 0이 되면 onExpire를 정확히 한 번 호출한다. */
export function TimerBar({
  seconds,
  active,
  resetKey,
  onExpire,
}: {
  seconds: number;
  active: boolean;
  resetKey: string | number;
  onExpire: () => void;
}) {
  const [remain, setRemain] = useState(seconds);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!active) return;
    setRemain(seconds);
    const t0 = Date.now();
    let fired = false;
    let ticked = Infinity; // 마지막으로 초침을 울린 초
    const iv = setInterval(() => {
      const left = seconds - (Date.now() - t0) / 1000;
      if (left <= 0) {
        setRemain(0);
        clearInterval(iv);
        if (!fired) {
          fired = true;
          sfxTimeout();
          expireRef.current();
        }
      } else {
        setRemain(left);
        // 마지막 3초는 초마다 한 번씩 초침이 울린다
        const sec = Math.ceil(left);
        if (sec <= 3 && sec < ticked) {
          ticked = sec;
          sfxUrgent();
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [active, resetKey, seconds]);

  const pct = Math.max(0, remain / seconds) * 100;
  return (
    <div className={`timerbar ${remain <= 3 ? "low" : ""}`} role="timer" aria-label={`남은 시간 ${Math.ceil(remain)}초`}>
      <div className="track">
        <i style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <span className="mono">{Math.ceil(remain)}</span>
    </div>
  );
}
