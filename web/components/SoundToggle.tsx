"use client";

import { useEffect, useState } from "react";
import { armBgm, bgmEnabled, onBgmChange, setBgmEnabled } from "@/lib/bgm";

/**
 * 게임 헤더의 배경음 스위치. 창구에 들어와 있는 동안만 배경음이 흐르고,
 * 이 버튼으로 끌 수 있다. 끈 선택은 기기에 남는다.
 * 효과음은 이 버튼과 무관하게 그대로 난다 (판정은 들려야 한다).
 */
export function SoundToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(bgmEnabled());
    const disarm = armBgm();
    const off = onBgmChange(() => setOn(bgmEnabled()));
    return () => {
      off();
      disarm();
    };
  }, []);

  const label = on ? "배경음 끄기" : "배경음 켜기";
  return (
    <button
      type="button"
      className="sound-btn"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => setBgmEnabled(!on)}
    >
      <svg width="21" height="21" viewBox="0 0 15 15" aria-hidden="true">
        <path d="M3 5.6h2.2L8 3.2v8.6L5.2 9.4H3z" fill="currentColor" />
        {on ? (
          <>
            <path d="M10 5.4a3.2 3.2 0 0 1 0 4.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M11.7 3.9a5.6 5.6 0 0 1 0 7.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </>
        ) : (
          <path d="M10.2 5.8l3.4 3.4M13.6 5.8l-3.4 3.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
