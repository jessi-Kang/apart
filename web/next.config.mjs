/**
 * 옛 경로는 새 경로로 넘긴다.
 *
 * 창구 주소를 한 글자로 줄였다(`/play` → `/o`). 주소창에 게임 속내가 다
 * 적혀 있는 게 싫다는 요청이고, 짧으면 입으로 불러 주기도 쉽다.
 *
 * 다만 옛 주소는 이미 밖에 나가 있다 — 공유한 링크, 설치해 둔 앱의 시작
 * 주소, 브라우저 기록. 그래서 지우지 않고 넘긴다. 308이라 검색엔진도
 * 주소가 바뀐 것으로 읽고, 질의 문자열(`?official=1`)은 그대로 따라간다.
 */
const MOVED = [
  ["/play", "/o"],
  ["/assemble", "/a"],
  ["/findreal", "/f"],
  ["/record", "/me"],
  ["/ranking", "/top"],
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return MOVED.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
