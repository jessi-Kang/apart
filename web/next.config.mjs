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

/**
 * 보안 헤더.
 *
 * 하나도 없었다. 그 상태에서는 남의 사이트가 이 게임을 iframe으로 감싸 투명하게
 * 덮어 놓고 클릭을 가로챌 수 있었다(로그아웃·작명 접수가 다 단추 하나다).
 *
 * CSP는 스크립트에 'unsafe-inline'을 남긴다. Next가 페이지마다 인라인 스크립트를
 * 심고, 설치 안내용 선점 스크립트도 head에 인라인으로 있어서다. 그래서 이 CSP가
 * 막는 것은 XSS 전체가 아니라 **바깥 출처**다 — 스크립트·연결·폼 전송이 이 사이트와
 * 구글(로그인·글꼴) 밖으로 나가지 못한다. 출처를 늘릴 때는 여기에 적는다.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return MOVED.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
