import { ImageResponse } from "next/og";
import { episodeNumber } from "@/lib/daily";
import { gradeFor } from "@/lib/grades";
import { parseSlug } from "@/lib/slug";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 링크 미리보기 카드 (docs/02 §4-2). 한글 폰트는 요청 텍스트만 서브셋으로 받아온다. */
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

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = parseSlug(slug);
  const score = r?.score ?? 0;
  const grade = r ? gradeFor(r.score) : gradeFor(0);
  const ep = r ? episodeNumber(r.date) : 1;
  const marks = r?.marks ?? Array(10).fill(false);

  const text = `아파트 감별사 제회 결과 / 0123456789#${grade.name}`;
  const font = await loadFont(text);

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
            gap: 18,
          }}
        >
          <div style={{ fontSize: 40, color: "#1b1b1e", fontWeight: 700 }}>{`아파트 감별사 #${ep}`}</div>
          <div style={{ fontSize: 120, color: "#1b1b1e", fontWeight: 700, lineHeight: 1 }}>{`${score} / 10`}</div>
          <div
            style={{
              fontSize: 44,
              color: "#c73a2f",
              fontWeight: 700,
              border: "5px solid #c73a2f",
              padding: "14px 30px",
              transform: "rotate(-2.5deg)",
            }}
          >
            {grade.name}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            {marks.map((m, i) => (
              <div
                key={i}
                style={{
                  width: 34,
                  height: 34,
                  background: m ? "#1b1b1e" : "#fdfdfb",
                  border: m ? "none" : "3px solid #c73a2f",
                  borderRadius: 4,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "plex", data: font, weight: 700 as const, style: "normal" as const }] : undefined,
    },
  );
}
