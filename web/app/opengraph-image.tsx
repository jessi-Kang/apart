import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "아파트 감별사 · 진짜 아파트와 AI가 지은 이름 가려내기";

/**
 * 링크를 붙였을 때 뜨는 미리보기 카드 (홈·그 밖의 모든 화면).
 * 지금까지는 결과 페이지에만 있어서, 정작 사람들이 제일 많이 붙이는
 * 주소(apt-game.app)에는 이미지도 설명도 안 붙었다.
 *
 * 결과 카드와 같은 서류 세계관으로 그린다 — 괘선 틀, 인주색 도장, 관인.
 * 한글 폰트는 이 카드에 쓰는 글자만 서브셋으로 받아온다.
 */
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@700&text=${encodeURIComponent(text)}`;
    // 구형 UA로 요청하면 woff2 대신 ImageResponse가 지원하는 TTF/WOFF가 내려온다
    const css = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
    }).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OgImage() {
  const title = "아파트 감별사";
  const sub = "진짜 아파트와 AI가 지은 이름 가려내기";
  const stamp = "감별 민원 접수처";
  const font = await loadFont(`${title}${sub}${stamp}aptgame.`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f6f6f3",
          padding: 40,
          fontFamily: "plex, sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#fdfdfb",
            border: "3px solid #d9d9d3",
            gap: 26,
          }}
        >
          <div style={{ display: "flex", fontSize: 26, color: "#5c5c62", letterSpacing: 8 }}>{stamp}</div>
          <div style={{ display: "flex", fontSize: 96, color: "#1b1b1e", fontWeight: 700, lineHeight: 1 }}>
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              color: "#c73a2f",
              fontWeight: 700,
              border: "5px solid #c73a2f",
              padding: "12px 26px",
              transform: "rotate(-2.5deg)",
            }}
          >
            {sub}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#5c5c62", marginTop: 8 }}>apt-game.app</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "plex", data: font, weight: 700 as const, style: "normal" as const }] : undefined,
    },
  );
}
