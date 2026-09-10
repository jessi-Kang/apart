/** 정답 그리드 타일. 이모지 대신 그래픽(SVG)으로 렌더 (CLAUDE.md 규칙) */
export function GridTile({ ok }: { ok: boolean }) {
  return ok ? (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect x="1" y="1" width="24" height="24" rx="2" fill="#1b1b1e" />
      <path
        d="M7 13.5l4 4 8-8.5"
        stroke="#fdfdfb"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect x="1.75" y="1.75" width="22.5" height="22.5" rx="2" fill="none" stroke="#c73a2f" strokeWidth="1.5" />
      <path d="M8.5 8.5l9 9M17.5 8.5l-9 9" stroke="#c73a2f" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
