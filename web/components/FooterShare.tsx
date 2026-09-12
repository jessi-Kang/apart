"use client";

import { useState } from "react";
import { shareLink, siteShareText } from "@/lib/sharecard";
import { sfxTap } from "@/lib/sound";

/**
 * 푸터 오른쪽의 사이트 공유 단추.
 *
 * 지금까지 공유로 나가는 길은 결과 화면에만 있었다. 게임을 끝까지 안 한
 * 사람, 남의 결과를 보고 들어온 사람에게는 권할 방법이 없었다. 어느 화면에
 * 있든 이 단추 하나로 홈 주소를 넘길 수 있게 둔다.
 *
 * 글자 없이 아이콘만 둔다 — 푸터는 표기를 적는 자리라 글이 하나 더 붙으면
 * 줄이 길어져 읽는 순서가 흐트러진다. 대신 aria-label로 이름을 준다.
 */
export function FooterShare() {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "failed">("idle");
  const label =
    state === "copied" ? "링크 복사됨" : state === "failed" ? "복사 실패" : state === "shared" ? "공유 완료" : "";
  return (
    <span className="foot-share-wrap">
      {label && <small className="foot-share-said">{label}</small>}
      <button
        type="button"
        className="foot-share"
        aria-label="이 사이트 공유하기"
        onClick={async () => {
          sfxTap();
          setState(await shareLink(siteShareText()));
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1.8v8.4" />
            <path d="M4.9 4.9 8 1.8l3.1 3.1" />
            <path d="M3.2 9v4.4a.8.8 0 0 0 .8.8h8a.8.8 0 0 0 .8-.8V9" />
          </g>
        </svg>
      </button>
    </span>
  );
}
