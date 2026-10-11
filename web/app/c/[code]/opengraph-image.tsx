import { ImageResponse } from "next/og";
import { getChallenge } from "@/lib/challenge";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 한글 폰트는 요청 텍스트만 서브셋으로 받아온다 (r/[slug]와 같은 방식) */
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@700&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" } }).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

/** 메신저에 붙는 도전장 카드. 기록과 "깰 수 있는가"만 싣는다 — 문제와 정답은 없다 */
export default async function OgImage({ params }: { params: Promise<{ code: string }> }) {
  const ch = await getChallenge((await params).code);
  const target = ch?.target ?? 0;
  const head = `${target}문제 연속 정답`;
  const sub = "같은 문제로 이 기록을 넘을 수 있습니까?";
  const from = ch?.label ? `${ch.label} 님의 도전장` : "누군가 보낸 도전장";
  const font = await loadFont(`도전장아파트감별사${head}${sub}${from}`);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f6f3", padding: 40, fontFamily: "plex, sans-serif" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#fdfdfb",
            border: "3px solid #1b1b1e",
            gap: 26,
          }}
        >
          <div style={{ fontSize: 34, color: "#5d5d63", letterSpacing: 18 }}>도전장</div>
          <div style={{ fontSize: 96, color: "#1b1b1e", fontWeight: 700, lineHeight: 1 }}>{head}</div>
          <div style={{ fontSize: 34, color: "#5d5d63" }}>{sub}</div>
          <div
            style={{
              marginTop: 12,
              fontSize: 40,
              color: "#c73a2f",
              fontWeight: 700,
              border: "5px solid #c73a2f",
              padding: "12px 28px",
              transform: "rotate(-2.5deg)",
            }}
          >
            {from}
          </div>
          <div style={{ fontSize: 28, color: "#5d5d63", marginTop: 8 }}>아파트 감별사</div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "plex", data: font, weight: 700 as const, style: "normal" as const }] : undefined },
  );
}
