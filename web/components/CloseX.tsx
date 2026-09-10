"use client";

import { useRouter } from "next/navigation";

/** 게임 화면 닫기 (창구로 복귀). 진행 중이면 접수 취소 확인을 한 번 묻는다. */
export function CloseX({ inProgress }: { inProgress: boolean }) {
  const router = useRouter();

  function close() {
    if (inProgress && !window.confirm("진행 중인 감별을 중단할까요?\n오늘 다시 시작할 수 있습니다.")) return;
    router.push("/");
  }

  return (
    <button type="button" className="close-x" onClick={close} aria-label="게임 닫고 창구로 돌아가기">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
