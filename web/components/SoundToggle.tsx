"use client";

import { useEffect, useState } from "react";
import { isMuted, setMuted } from "@/lib/sound";

/** 효과음 켬/끔 토글 (게임 화면 푸터). 아이콘은 SVG — 이모지 금지 규칙. */
export function SoundToggle() {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  return (
    <button
      type="button"
      className="sound-toggle"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? "효과음 켜기" : "효과음 끄기"}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 6h2.6L8 3.2v9.6L4.6 10H2z" fill="currentColor" />
        {muted ? (
          <path d="M10.4 6.2l3.6 3.6M14 6.2l-3.6 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M10.5 5.6a3.4 3.4 0 010 4.8M12.4 4a6 6 0 010 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        )}
      </svg>
      <span>{muted ? "효과음 꺼짐" : "효과음 켜짐"}</span>
    </button>
  );
}
