"use client";

import { useState } from "react";
import { shareLink, shareText, type ShareCardData } from "@/lib/sharecard";
import { sfxTap } from "@/lib/sound";

/**
 * 링크 공유 — 통지서(그림)를 뽑지 않고 글만 한 번에 넘기는 길.
 *
 * 처음에는 버튼 묶음 옆에 작은 칩으로 뒀는데, 아무 데도 안 붙은 조각이
 * 떠 있는 꼴이라 무엇에 딸린 것인지 알 수 없었다. 지금은 통지서 공유와
 * 같은 크기로 나란히 선다 — 둘 다 "이 결과를 남에게 보내는" 일이고,
 * 그림을 만들 만큼 마음먹지 않은 사람이 고르는 쪽이 이것일 뿐이다.
 * 판을 끝낸 뒤 할 일(다시 도전·창구로 돌아가기)은 그 아래 줄로 내려갔다.
 */
export function ShareLink({ data }: { data: ShareCardData }) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "failed">("idle");
  const label =
    state === "shared" ? "공유 완료" : state === "copied" ? "링크 복사됨" : state === "failed" ? "복사 실패" : "링크 공유";
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={async () => {
        sfxTap();
        setState(await shareLink(shareText(data)));
      }}
    >
      {label}
    </button>
  );
}
