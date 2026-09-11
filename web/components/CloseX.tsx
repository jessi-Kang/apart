"use client";

import { useRouter } from "next/navigation";

/** 게임 화면 닫기 (창구로 복귀). 진행 중이면 접수 취소 확인을 한 번 묻는다.
 * onClose가 있으면 나가는 대신 그걸 실행한다 — 무한 모드에서 X는
 * 그냥 끝나지 않고 세션 결과로 이어진다. */
export function CloseX({ inProgress, onClose }: { inProgress: boolean; onClose?: () => void }) {
  const router = useRouter();

  function close() {
    if (onClose) {
      onClose();
      return;
    }
    if (inProgress && !window.confirm("진행 중인 감별을 중단할까요?\n오늘 다시 시작할 수 있습니다.")) return;
    router.push("/");
  }

  // 무한 세션에서는 닫기가 곧 "여기까지" — 결과로 이어진다는 걸 라벨이 말해 준다
  const label = onClose ? "세션 끝내고 결과 보기" : "게임 닫고 창구로 돌아가기";

  return (
    <button type="button" className="close-x" onClick={close} aria-label={label} title={label}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
