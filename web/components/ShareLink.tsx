"use client";

import { useState } from "react";
import { shareLink, shareText, type ShareCardData } from "@/lib/sharecard";
import { sfxTap } from "@/lib/sound";

/**
 * 가벼운 공유 한 줄.
 *
 * 통지서(이미지)를 뽑는 건 마음먹어야 하는 일이라, 그냥 지나치는 사람이 훨씬 많다.
 * 그림을 만들 것도 없이 한 번에 퍼뜨릴 수 있는 길을 옆에 작게 둔다 —
 * 여기서 나가는 글에는 항상 주소가 붙으므로, 본 사람이 찾아올 길이 생긴다.
 */
export function ShareLink({ data }: { data: ShareCardData }) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "failed">("idle");
  const label =
    state === "shared" ? "공유 완료" : state === "copied" ? "링크 복사됨" : state === "failed" ? "복사 실패" : "링크 공유";
  return (
    <button
      type="button"
      className="share-link"
      onClick={async () => {
        sfxTap();
        setState(await shareLink(shareText(data)));
      }}
    >
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M5.6 8.4a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.7.7M8.4 5.6a2.6 2.6 0 0 0-3.7 0L2.6 7.7a2.6 2.6 0 0 0 3.7 3.7l.7-.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </button>
  );
}
