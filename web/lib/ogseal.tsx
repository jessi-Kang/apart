import { sealDataUri } from "./sealsvg";

/**
 * 링크 미리보기 카드(ImageResponse)에 찍는 관인.
 *
 * 왜 따로 만드나: 도장 SVG 안에 링 글자를 넣어 `<img>`로 넘기면 그 SVG를
 * 그리는 쪽(resvg)에 한글 폰트가 없어서 글자가 네모로 나온다. 그래서
 * 오래 textless 도장을 써 왔는데, 글자 없는 관인은 그냥 흐린 동그라미라
 * 도장으로 읽히지 않았다.
 *
 * 해결: 도형만 `<img>`로 깔고, 링 글자는 카드가 이미 받아 둔 한글 폰트로
 * Satori가 직접 그린다. 글자 배치는 화면 Seal 컴포넌트와 같은 계산이다 —
 * 글자별 고정 각도(폰트 메트릭에 기대지 않는다).
 */

const STAMP = "#c73a2f";
const RING_R = 68 / 200; // 도장 지름 대비 텍스트 밴드 중심 반지름
const STEP = 21; // 글자 간 각도(도)

function ring(text: string, top: boolean, size: number, fontSize: number) {
  const chars = [...text.replace(/\s/g, "")];
  const total = STEP * (chars.length - 1);
  const r = RING_R * size;
  return chars.map((ch, i) => (
    <div
      key={`${top ? "t" : "b"}${i}`}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `rotate(${top ? -total / 2 + STEP * i : total / 2 - STEP * i}deg)`,
      }}
    >
      <div
        style={{
          display: "flex",
          transform: `translateY(${top ? -r : r}px)`,
          fontSize,
          lineHeight: 1,
          fontWeight: 700,
          color: STAMP,
        }}
      >
        {ch}
      </div>
    </div>
  ));
}

/** 관인에 들어가는 글자 — 카드가 받아올 폰트 서브셋에 이 글자가 있어야 한다 */
export const SEAL_TEXT = "아파트감별사감별민원접수처";

export function OgSeal({ size, opacity = 1 }: { size: number; opacity?: number }) {
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size, opacity }}>
      <img src={sealDataUri()} width={size} height={size} style={{ position: "absolute", left: 0, top: 0 }} />
      {ring("아파트 감별사", true, size, (16 / 200) * size)}
      {ring("감별민원 접수처", false, size, (14 / 200) * size)}
    </div>
  );
}
