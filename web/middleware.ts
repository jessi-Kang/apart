import { NextResponse, type NextRequest } from "next/server";

/**
 * 주소를 하나로 모은다.
 *
 * 도메인을 apt-game.app으로 옮긴 뒤에도 베르셀이 만들어 주는 옛 주소
 * (apt-gam-jessikang.vercel.app)가 그대로 앱을 서빙하고 있었다.
 * 도메인 이전 전에 설치한 PWA는 그 옛 주소에 붙어 있어서, 앱 안에서 로그인을
 * 누르면 redirect_uri가 옛 주소로 만들어지고 구글이 redirect_uri_mismatch로
 * 튕겼다(구글 오류 화면의 '요청 세부정보'에 옛 주소가 그대로 찍혀 있었다).
 *
 * 콘솔에 옛 주소를 하나 더 등록하는 건 임시방편이다. 주소가 둘이면 세션 쿠키와
 * 로컬 기록도 둘로 갈라져서, 같은 사람이 같은 앱을 쓰는데 기록이 따로 논다.
 * 그래서 프로덕션 배포에서는 정식 도메인이 아닌 요청을 전부 이쪽으로 넘긴다.
 *
 * 미리보기 배포(VERCEL_ENV=preview)와 로컬은 건드리지 않는다. 확인할 주소가
 * 사라지면 배포 전에 검증할 곳이 없어진다.
 */

const CANONICAL_HOST = "apt-game.app";

export function middleware(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") return NextResponse.next();

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (!host || host === CANONICAL_HOST) return NextResponse.next();

  const url = new URL(req.url);
  url.protocol = "https:";
  url.host = CANONICAL_HOST;
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export const config = {
  // 정적 자산까지 미들웨어를 태울 이유는 없다
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
