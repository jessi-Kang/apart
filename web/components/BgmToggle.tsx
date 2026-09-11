"use client";

import { useEffect, useState } from "react";
import { armBgm, bgmEnabled, onBgmChange, setBgmEnabled } from "@/lib/bgm";

/**
 * 푸터의 배경음 스위치. 기본은 켜짐이고, 소리는 브라우저 정책상
 * 첫 터치 이후에 난다. 끈 선택은 기기에 남는다.
 */
export function BgmToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(bgmEnabled());
    armBgm();
    return onBgmChange(() => setOn(bgmEnabled()));
  }, []);

  return (
    <>
      {" · "}
      <button
        type="button"
        className="foot-install"
        aria-pressed={on}
        onClick={() => setBgmEnabled(!on)}
      >
        배경음 {on ? "끄기" : "켜기"}
      </button>
    </>
  );
}
