"use client";

/**
 * 공유 이미지 생성 (감별 결과 통지서, 1080×1350 캔버스 → PNG)
 * 구성은 듀오링고식(히어로 → 큰 타이포 → 스탯 카드 → 링크),
 * 비주얼은 확정 시안 A의 접수 서류 물성(종이·잉크·도장 빨강)을 따른다.
 * 런타임 의존성 0: Canvas 2D로 직접 그린다.
 */

export interface ShareStat {
  value: string;
  label: string;
  accent?: boolean;
}

export interface ShareCardData {
  episode: number;
  date: string; // YYYY-MM-DD
  subtitle: string; // "감별 결과 통지서" 등 모드별 서류명
  score: number;
  total: number;
  marks: boolean[];
  gradeName: string;
  stats: ShareStat[]; // 2장 또는 4장 (2장 단위 행)
}

const PAPER = "#f6f6f3";
const SHEET = "#fdfdfb";
const INK = "#1b1b1e";
const INK_SOFT = "#5c5c62";
const LINE = "#d9d9d3";
const STAMP = "#c73a2f";

const W = 1080;
const H = 1350;

const SANS = '"IBM Plex Sans KR", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", monospace';

function font(weight: number, size: number, family = SANS) {
  return `${weight} ${size}px ${family}`;
}

/** SVG 문자열을 이미지로 래스터 (feTurbulence 등 SVG 필터가 그대로 적용된다) */
function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("svg_load_failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

/** 관인: 도형부는 웹 Seal 컴포넌트와 동일한 SVG(feTurbulence 포함)를 래스터해
 * 질감까지 똑같이 가져오고, 링 텍스트만 페이지 폰트로 캔버스에 그린다 */
const SEAL_SHAPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <filter id="sr" x="-8%" y="-8%" width="116%" height="116%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/>
  </filter>
  <g filter="url(#sr)">
    <g fill="none" stroke="${STAMP}">
      <circle cx="100" cy="100" r="92" stroke-width="5"/>
      <circle cx="100" cy="100" r="84" stroke-width="1.6"/>
      <circle cx="100" cy="100" r="52" stroke-width="1.6"/>
    </g>
    <g fill="${STAMP}">
      <circle cx="28" cy="100" r="3"/>
      <circle cx="172" cy="100" r="3"/>
      <rect x="84" y="72" width="32" height="52" rx="2"/>
      <rect x="92" y="65" width="16" height="7" rx="1.5"/>
    </g>
    <g fill="${SHEET}">
      <rect x="89" y="79" width="8" height="7" rx="1"/>
      <rect x="103" y="79" width="8" height="7" rx="1"/>
      <rect x="89" y="91" width="8" height="7" rx="1"/>
      <rect x="103" y="91" width="8" height="7" rx="1"/>
      <rect x="89" y="103" width="8" height="7" rx="1"/>
      <rect x="103" y="103" width="8" height="7" rx="1"/>
      <rect x="96" y="114" width="8" height="10" rx="1"/>
    </g>
  </g>
</svg>`;

async function drawSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = alpha;
  try {
    const img = await svgImage(SEAL_SHAPE_SVG);
    ctx.drawImage(img, -r, -r, r * 2, r * 2);
  } catch {
    // SVG 래스터 실패 시 민무늬 원으로 폴백
    ctx.strokeStyle = STAMP;
    ctx.lineWidth = r * 0.055;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 링 텍스트: 밴드 중앙(0.68r)에 글자 중심 정렬 — 웹 Seal의 central 정렬과 동일
  ctx.fillStyle = STAMP;
  const ringText = (text: string, radius: number, size: number, top: boolean) => {
    ctx.font = font(700, size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const chars = [...text.replace(/\s/g, "")];
    const step = (21 * Math.PI) / 180; // 글자당 21° — 웹과 동일
    const total = step * (chars.length - 1);
    for (let i = 0; i < chars.length; i++) {
      const a = top ? -total / 2 + step * i : total / 2 - step * i;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, top ? -radius : radius);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
    }
  };
  ringText("아파트 감별사", r * 0.68, r * 0.16, true);
  ringText("감별민원 접수처", r * 0.68, r * 0.14, false);
  ctx.restore();
}

/** 판정 그리드 타일 (GridTile 조형) */
function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ok: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, s * 0.08);
  if (ok) {
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.strokeStyle = SHEET;
    ctx.lineWidth = s * 0.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s * 0.27, s * 0.52);
    ctx.lineTo(s * 0.42, s * 0.67);
    ctx.lineTo(s * 0.73, s * 0.33);
    ctx.stroke();
  } else {
    ctx.fillStyle = SHEET;
    ctx.fill();
    ctx.strokeStyle = STAMP;
    ctx.lineWidth = s * 0.06;
    ctx.stroke();
    ctx.lineWidth = s * 0.085;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s * 0.33, s * 0.33);
    ctx.lineTo(s * 0.67, s * 0.67);
    ctx.moveTo(s * 0.67, s * 0.33);
    ctx.lineTo(s * 0.33, s * 0.67);
    ctx.stroke();
  }
  ctx.restore();
}

/** 등급 도장: 결과 페이지 Stamp 컴포넌트의 SVG 프레임을 그대로 래스터.
 * viewBox 240×72를 목표 크기로 늘리는 것까지 웹(preserveAspectRatio:none)과 동일 */
function stampFrameSvg(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 240 72" preserveAspectRatio="none">
  <filter id="fr" x="-10%" y="-18%" width="120%" height="136%">
    <feTurbulence type="fractalNoise" baseFrequency="0.08 0.12" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3"/>
  </filter>
  <g filter="url(#fr)">
    <rect x="4" y="4" width="232" height="64" fill="none" stroke="${STAMP}" stroke-width="4.5"/>
    <rect x="11" y="11" width="218" height="50" fill="none" stroke="${STAMP}" stroke-width="1.4"/>
  </g>
</svg>`;
}

async function drawGradeStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-2.5 * Math.PI) / 180);
  ctx.font = font(700, 58);
  const tw = ctx.measureText(text).width;
  const w = tw + 110;
  const h = 128;
  try {
    const img = await svgImage(stampFrameSvg(w, h));
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } catch {
    // 폴백: 민무늬 이중 테두리
    ctx.strokeStyle = STAMP;
    ctx.lineWidth = 7;
    ctx.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
  }
  ctx.fillStyle = STAMP;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 3);
  ctx.restore();
}

function drawStatCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  label: string,
  accent = false,
) {
  ctx.save();
  ctx.fillStyle = SHEET;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = accent ? STAMP : INK;
  ctx.font = font(700, 46);
  ctx.fillText(value, x + 34, y + h / 2 + 0);
  ctx.fillStyle = INK_SOFT;
  ctx.font = font(500, 23);
  ctx.fillText(label, x + 34, y + h / 2 + 42);
  ctx.restore();
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  // 캔버스는 document.fonts에 로드된 페이지 폰트를 그대로 쓴다 — 먼저 로드 보장
  try {
    await Promise.all([
      document.fonts.load(`700 90px ${SANS}`),
      document.fonts.load(`500 30px ${SANS}`),
      document.fonts.load(`400 28px ${MONO}`),
    ]);
  } catch {
    /* 폰트 로드 실패 시 시스템 폰트로 진행 */
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 종이 바탕 + 시트
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const M = 56; // 시트 여백
  ctx.fillStyle = SHEET;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(M, M, W - M * 2, H - M * 2, 4);
  ctx.fill();
  ctx.stroke();

  const left = M + 56;
  const right = W - M - 56;

  // 헤더 + 공문서 이중 괘선
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.font = font(700, 40);
  ctx.fillText("아파트 감별사", left, M + 92);
  ctx.fillStyle = INK_SOFT;
  ctx.font = font(400, 27);
  ctx.fillText(data.subtitle, left, M + 136);
  ctx.textAlign = "right";
  ctx.font = font(400, 28, MONO);
  const [, mm, dd] = data.date.split("-");
  ctx.fillText(`#${data.episode} · ${mm}.${dd}`, right, M + 100);
  ctx.fillStyle = INK;
  ctx.fillRect(M, M + 172, W - M * 2, 5);
  ctx.fillRect(M, M + 183, W - M * 2, 2);

  // 히어로: 큰 점수 + 등급 도장 + 관인
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = font(700, 230);
  ctx.fillText(String(data.score), W / 2 - 60, 512);
  ctx.fillStyle = INK_SOFT;
  ctx.font = font(700, 72);
  ctx.fillText(`/ ${data.total}`, W / 2 + 128, 500);
  await drawSeal(ctx, right - 100, 330, 128, 0.85);
  await drawGradeStamp(ctx, W / 2, 640, data.gradeName);

  // 판정부/기록부 절취선 (웹 결과 화면과 동일한 구분)
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(left, 756);
  ctx.lineTo(right, 756);
  ctx.stroke();
  ctx.setLineDash([]);

  // 판정 그리드 (한 줄)
  const ts = 66;
  const gap = 14;
  const gw = ts * data.marks.length + gap * (data.marks.length - 1);
  let gx = (W - gw) / 2;
  for (const m of data.marks) {
    drawTile(ctx, gx, 794, ts, m);
    gx += ts + gap;
  }

  // 스탯 카드 (2장 단위 행 — 푸터 점선과 겹치지 않게 배치)
  const cw = (right - left - 24) / 2;
  const ch = 124;
  const rows = Math.ceil(data.stats.length / 2);
  const cy = rows === 1 ? 972 : 902;
  data.stats.forEach((st, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawStatCard(ctx, left + col * (cw + 24), cy + row * (ch + 20), cw, ch, st.value, st.label, st.accent ?? false);
  });

  // 푸터
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(left, H - M - 108);
  ctx.lineTo(right, H - M - 108);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = "left";
  ctx.fillStyle = INK_SOFT;
  ctx.font = font(400, 26);
  ctx.fillText("진짜 아파트냐, AI가 지은 이름이냐", left, H - M - 62);
  ctx.textAlign = "right";
  ctx.fillStyle = STAMP;
  ctx.font = font(700, 28, MONO);
  ctx.fillText("apt-gam.vercel.app", right, H - M - 62);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob 실패"))), "image/png");
  });
}

/** 모바일이면 시스템 공유 시트, 아니면 파일 다운로드 */
export async function shareCardImage(data: ShareCardData): Promise<"shared" | "downloaded"> {
  const blob = await renderShareCard(data);
  const file = new File([blob], `아파트감별사-${data.date}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch {
      /* 사용자가 시트를 닫음 → 다운로드 폴백 */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
