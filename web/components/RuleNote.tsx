"use client";

import { useEffect, useState } from "react";
import { rulesFor } from "@/lib/rules";
import type { GameKey } from "@/lib/scoring";

/**
 * 창구 이용 안내.
 *
 * 왜 화면에 얹지 않고 덮는가: 처음에는 문제 위에 접이식으로 끼워 넣었는데,
 * 펼쳐진 동안 진짜 할 일(진짜/가짜 단추, 조각, 보기 넷)이 화면 밖으로
 * 밀려났다. 320x568에서 재 보니 감별 7px · 조립 145px · 찾기 347px가
 * 잘렸다. 설명을 넣겠다고 게임을 밀어낸 셈이다.
 *
 * 그래서 안내는 제 자리를 따로 갖는다. 처음 온 사람에게는 문제 위를 덮고
 * 나타나 읽고 시작하게 하고(그동안 제한 시간은 멈춘다), 그 뒤로는 머리글의
 * 작은 "안내"로만 남는다. 덮개가 닫혀 있는 동안 화면 구조는 손대지 않으므로
 * 안내를 넣기 전과 정확히 같은 화면이다.
 */

/**
 * 안내를 열지 말지. 창구별로 이 기기에 한 번만 저절로 열린다.
 * `auto`는 "저절로 열린 그 판인가". 그때만 닫는 단추가 "시작하기"다.
 *
 * 표시는 이 안내 전용 열쇠를 쓴다. 처음에는 이미 있던 firstVisit
 * (`aptgam:seen:*`)을 재사용했는데, 그 열쇠는 예전 한 줄 힌트가 이미
 * 써 버린 뒤였다. 그래서 전에 한 번이라도 친 사람에게는 안내가 영영
 * 안 떴다(라이브에서 확인). 뜻이 달라진 표시는 새로 판다.
 */
const KEY = (game: GameKey) => `aptgam:guide:${game}`;

export function useGuide(game: GameKey): { open: boolean; auto: boolean; setOpen: (v: boolean) => void } {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY(game))) return;
      localStorage.setItem(KEY(game), "1");
    } catch {
      return; // storage를 못 쓰면 저절로 열지 않는다. 머리글 단추는 그대로 있다
    }
    setOpen(true);
    setAuto(true);
  }, [game]);
  return {
    open,
    auto,
    setOpen: (v: boolean) => {
      setOpen(v);
      if (v) setAuto(false); // 손으로 연 것은 첫 안내가 아니다
    },
  };
}

/**
 * 머리글의 안내 단추 (배경음 토글 옆).
 *
 * 처음에는 물음표 아이콘만 뒀는데, 덮개를 한 번 닫고 나면 다시 여는 길을
 * 아무도 못 찾았다. 아이콘 하나로는 "안내"라고 읽히지 않는다. 글자를 쓴다.
 */
export function RuleButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="rule-btn" onClick={onOpen}>
      안내
    </button>
  );
}

export function RuleOverlay({
  game,
  official,
  first,
  onClose,
}: {
  game: GameKey;
  official: boolean;
  /** 처음 온 사람인가 — 닫는 단추의 말이 달라진다 */
  first: boolean;
  onClose: () => void;
}) {
  return (
    <div className="rule-veil" role="dialog" aria-modal="true" aria-label="이용 안내">
      <div className="rule-card">
        <p className="doc-title">
          이용안내
          <b>{official ? "공식전 치르는 법" : "이 창구 이용법"}</b>
        </p>
        <ul className="rule-list">
          {rulesFor(game, official).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="result-actions">
          <button className="btn btn-next" onClick={onClose}>
            {first ? "시작하기" : "닫기"}
          </button>
        </div>
      </div>
    </div>
  );
}
