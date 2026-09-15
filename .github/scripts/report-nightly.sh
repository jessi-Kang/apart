#!/usr/bin/env bash
# 야간 작업 결과를 이슈 한 곳에 남긴다.
#
# 왜 이슈인가: 액션 실행 화면은 들어가 봐야 보인다. 매일 밤 도는 작업은
# 안 들어가 보게 되고, 그러면 며칠 헛돌아도 모른다. 이슈에 댓글로 쌓으면
# 저장소 주인에게 메일이 가고, 한 줄기로 모여 어제와 비교가 된다.
#
# 왜 성공일 때도 남기나: "오늘은 아무 일도 없었다"도 결과다. 실패할 때만
# 알리면, 작업이 아예 안 도는 상태(시크릿이 빠졌다거나)와 조용한 성공이
# 똑같아 보인다.
#
# 쓰는 곳: collect-kapt.yml, publish-coined.yml 의 마지막 단계.
#   bash .github/scripts/report-nightly.sh "<작업 이름>"
#
# 넘겨받는 환경변수
#   JOB      job.status (success / failure / cancelled)
#   SKIP     1이면 시크릿이 없어 건너뛴 것
#   CHANGED  1이면 커밋·배포까지 갔다
#   RUN_URL  실행 화면 주소
#   GH_TOKEN 이슈를 쓸 권한
set -uo pipefail

TASK="${1:?작업 이름을 넘겨 주세요}"
TITLE="야간 작업 일지"
OUT=$(mktemp)

# 제목 줄 — 한눈에 상태가 보이게
if [ "${SKIP:-0}" = "1" ]; then
  echo "### ${TASK} · 건너뜀" >> "$OUT"
  echo "" >> "$OUT"
  echo "시크릿이 없어 아무것도 하지 않았습니다. Settings → Secrets → Actions를 확인해 주세요." >> "$OUT"
elif [ "${JOB:-}" = "failure" ]; then
  echo "### ${TASK} · 실패" >> "$OUT"
elif [ "${CHANGED:-0}" = "1" ]; then
  echo "### ${TASK} · 새로 나갔습니다" >> "$OUT"
else
  echo "### ${TASK} · 변화 없음" >> "$OUT"
fi
echo "" >> "$OUT"

# 각 단계가 남긴 기록을 그대로 붙인다. 요약하지 않는다 — 요약하다 빠뜨린
# 한 줄이 대개 원인이다
for pair in "수집:/tmp/collect.log" "승격:/tmp/promote.log" "내보내기:/tmp/export.log"; do
  label="${pair%%:*}"
  file="${pair#*:}"
  [ -s "$file" ] || continue
  echo "**${label}**" >> "$OUT"
  echo '```' >> "$OUT"
  tail -25 "$file" >> "$OUT"
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
done

if [ "${CHANGED:-0}" = "1" ]; then
  echo "커밋하고 배포 훅까지 보냈습니다. 몇 분 뒤 https://apt-game.app 에 반영됩니다." >> "$OUT"
  echo "" >> "$OUT"
fi
echo "[실행 기록 보기](${RUN_URL:-})" >> "$OUT"

# 일지 이슈를 찾고, 없으면 만든다
num=$(gh issue list --state open --limit 50 --json number,title \
  --jq ".[] | select(.title==\"${TITLE}\") | .number" | head -1)
if [ -z "$num" ]; then
  num=$(gh issue create --title "$TITLE" \
    --body "매일 밤 도는 작업들이 결과를 여기에 남깁니다. 닫으면 다음 실행 때 새로 만들어집니다." \
    | grep -oE '[0-9]+$')
fi

if [ -z "$num" ]; then
  echo "::warning::일지 이슈를 찾지도 만들지도 못했습니다. 결과는 실행 기록에만 남습니다."
  cat "$OUT"
  exit 0
fi

gh issue comment "$num" --body-file "$OUT" && echo "::notice::결과를 이슈 #${num}에 남겼습니다."
