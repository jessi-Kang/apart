"use client";

/**
 * 공유 이미지 생성 (확정 시안 S2 "접수증", 1080×1350 캔버스 → PNG)
 * 창구에서 뽑아준 영수증 한 장이 콘셉트다. 절취 지그재그 종이 위에
 * 괘선과 열거식 항목, 맨 아래 등급 도장과 바코드.
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
  headerRight?: string; // 지정 시 "제N호 · 날짜" 대신 이 문구 (무한 모드용)
  score: number;
  total: number;
  totalText?: string; // 지정 시 "/ total" 대신 이 단위 표기 (예: "연속")
  marks: boolean[];
  gradeName: string;
  stats: ShareStat[];
}

const PAPER = "#f6f6f3";
const SHEET = "#fdfdfb";
const INK = "#1b1b1e";
const INK_SOFT = "#5c5c62";
const STAMP = "#c73a2f";

const W = 1080;
const H = 1350;

const SANS = '"IBM Plex Sans KR", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", monospace';

function font(weight: number, size: number, family = SANS) {
  return `${weight} ${size}px ${family}`;
}

/** 숫자·기호만 있는 값은 모노로 — 영수증의 금액 열처럼 자리가 맞는다 */
function isNumeric(text: string) {
  return /^[\x20-\x7E·]+$/.test(text);
}

/**
 * 자간을 준 텍스트. ctx.letterSpacing은 브라우저 지원이 갈려
 * 글자 단위로 직접 배치한다 (영수증 서식의 정체성이 자간이라 포기할 수 없다).
 */
function fillTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "center" | "right" = "left",
) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  let cx = align === "left" ? x : align === "center" ? x - total / 2 : x - total;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + tracking;
  });
  ctx.textAlign = prevAlign;
  return total;
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

/** 관인: 도형부는 웹 Seal 컴포넌트와 같은 SVG(feTurbulence 포함)를 래스터해
 * 질감까지 가져오고, 링 텍스트는 페이지 폰트로 캔버스에 그린다 */
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

/**
 * 접수 관인. 서류 위에 눌러 찍는 도장이라 내용 위에 올라가고,
 * 잉크가 겹치듯 multiply로 합성해 아래 글자가 비쳐 보인다.
 */
async function drawSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-12 * Math.PI) / 180); // 손으로 찍은 도장은 반듯할 수 없다
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.62;
  try {
    const img = await svgImage(SEAL_SHAPE_SVG);
    ctx.drawImage(img, -r, -r, r * 2, r * 2);
  } catch {
    ctx.strokeStyle = STAMP;
    ctx.lineWidth = r * 0.055;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 링 텍스트: 밴드 중앙(0.68r)에 글자 중심 정렬 — 웹 Seal과 같은 규칙
  ctx.fillStyle = STAMP;
  const ringText = (text: string, size: number, top: boolean) => {
    ctx.font = font(700, size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const chars = [...text.replace(/\s/g, "")];
    const step = (21 * Math.PI) / 180; // 글자당 21°
    const total = step * (chars.length - 1);
    chars.forEach((ch, i) => {
      const a = top ? -total / 2 + step * i : total / 2 - step * i;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, top ? -r * 0.68 : r * 0.68);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  };
  ringText("아파트 감별사", r * 0.17, true);
  ringText("감별민원 접수처", r * 0.15, false);
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

/** 등급 도장 프레임: 결과 화면 Stamp 컴포넌트의 SVG를 그대로 래스터 */
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

/** 절취선 지그재그를 위아래에 문 영수증 외곽 경로 */
function tapePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const tooth = 40; // 톱니 하나의 폭
  const depth = 18; // 톱니 깊이
  const n = Math.max(2, Math.round(w / tooth));
  const step = w / n;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < n; i++) {
    ctx.lineTo(x + step * (i + 0.5), y - depth);
    ctx.lineTo(x + step * (i + 1), y);
  }
  ctx.lineTo(x + w, y + h);
  for (let i = n; i > 0; i--) {
    ctx.lineTo(x + step * (i - 0.5), y + h + depth);
    ctx.lineTo(x + step * (i - 1), y + h);
  }
  ctx.closePath();
}

/** 바코드: 날짜·점수에서 뽑은 시드로 굵기를 흩는다 (매번 같은 판은 같은 무늬) */
function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seedKey: string) {
  let seed = 2166136261;
  for (const ch of seedKey) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  ctx.save();
  ctx.fillStyle = INK;
  let cx = x;
  while (cx < x + w) {
    const bar = 3 + Math.floor(rand() * 7);
    const gap = 4 + Math.floor(rand() * 7);
    ctx.fillRect(cx, y, Math.min(bar, x + w - cx), h);
    cx += bar + gap;
  }
  ctx.restore();
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  // 캔버스는 document.fonts에 로드된 페이지 폰트를 그대로 쓴다 — 먼저 로드 보장
  try {
    await Promise.all([
      document.fonts.load(`700 34px ${SANS}`),
      document.fonts.load(`500 24px ${SANS}`),
      document.fonts.load(`500 24px ${MONO}`),
      document.fonts.load(`700 30px ${MONO}`),
    ]);
  } catch {
    /* 폰트 로드 실패 시 시스템 폰트로 진행 */
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const [yyyy, mm, dd] = data.date.split("-");
  const modeName = data.subtitle.replace(/\s*(통지서|접수증|신청서)$/, "");
  const issued = data.headerRight ?? `제${data.episode}호 · ${yyyy}.${mm}.${dd}`;
  // 본편은 "적중 7 / 10", 무한은 "최고 연속 12" — 판의 성적표 한 줄
  const hitLabel = data.totalText ? `최고 ${data.totalText}` : "적중";
  const hitValue = data.totalText ? String(data.score) : `${data.score} / ${data.total}`;

  const TAPE_W = 692;
  const TAPE_X = (W - TAPE_W) / 2;
  const PAD_X = 46;
  const inX = TAPE_X + PAD_X;
  const inW = TAPE_W - PAD_X * 2;

  // 등급 도장 크기는 글자 폭에 맞춘다 — 먼저 재고 나서 레이아웃을 짠다
  ctx.font = font(700, 31);
  const stampW = Math.min(inW, ctx.measureText(data.gradeName).width + 78);
  const stampH = 104;
  const stampImg = await svgImage(stampFrameSvg(stampW, stampH)).catch(() => null);

  // 블록을 먼저 쌓아 전체 높이를 구한 뒤, 종이를 그 높이로 그린다
  type Block = { h: number; draw: (y: number) => void };
  const blocks: Block[] = [];
  const space = (h: number) => blocks.push({ h, draw: () => undefined });

  const rule = () => {
    space(22);
    blocks.push({
      h: 3,
      draw: (y) => {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 9]);
        ctx.beginPath();
        ctx.moveTo(inX, y + 1.5);
        ctx.lineTo(inX + inW, y + 1.5);
        ctx.stroke();
        ctx.restore();
      },
    });
    space(22);
  };

  const row = (label: string, value: string, opts: { bold?: boolean; accent?: boolean } = {}) => {
    const size = opts.bold ? 28 : 24;
    blocks.push({
      h: opts.bold ? 52 : 46,
      draw: (y) => {
        const base = y + (opts.bold ? 36 : 32);
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.fillStyle = opts.bold ? INK : INK_SOFT;
        ctx.font = font(opts.bold ? 700 : 500, size);
        ctx.fillText(label, inX, base);
        ctx.textAlign = "right";
        ctx.fillStyle = opts.accent ? STAMP : INK;
        ctx.font = font(opts.bold ? 700 : 500, size, isNumeric(value) ? MONO : SANS);
        ctx.fillText(value, inX + inW, base);
      },
    });
  };

  space(54);
  blocks.push({
    h: 44,
    draw: (y) => {
      ctx.fillStyle = INK;
      ctx.font = font(700, 34);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      fillTracked(ctx, "아파트 감별사", TAPE_X + TAPE_W / 2, y + 34, 4.2, "center");
    },
  });
  space(10);
  blocks.push({
    h: 28,
    draw: (y) => {
      ctx.fillStyle = INK_SOFT;
      ctx.font = font(400, 21);
      fillTracked(ctx, `감별 민원 통지서 · ${issued}`, TAPE_X + TAPE_W / 2, y + 21, 1.3, "center");
    },
  });
  rule();
  row(modeName, `${data.total}문제`);

  // 판정 타일 한 줄
  const ts = Math.min(46, Math.floor((inW - 9 * 8) / Math.max(1, data.marks.length)));
  blocks.push({
    h: ts + 26,
    draw: (y) => {
      const gap = 8;
      const gw = ts * data.marks.length + gap * Math.max(0, data.marks.length - 1);
      let gx = TAPE_X + (TAPE_W - gw) / 2;
      for (const m of data.marks) {
        drawTile(ctx, gx, y + 16, ts, m);
        gx += ts + gap;
      }
    },
  });
  rule();
  row(hitLabel, hitValue, { bold: true });
  for (const st of data.stats) row(st.label, st.value, { accent: st.accent });

  space(30);
  blocks.push({
    h: stampH,
    draw: (y) => {
      ctx.save();
      ctx.translate(TAPE_X + TAPE_W / 2, y + stampH / 2);
      ctx.rotate((-4 * Math.PI) / 180);
      ctx.globalAlpha = 0.92;
      if (stampImg) ctx.drawImage(stampImg, -stampW / 2, -stampH / 2, stampW, stampH);
      ctx.fillStyle = STAMP;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = font(700, 31);
      ctx.fillText(data.gradeName, 0, -10);
      ctx.font = font(700, 15, MONO);
      fillTracked(ctx, "APPROVED", 0, 26, 6, "center");
      ctx.restore();
    },
  });
  space(12);
  rule();
  space(6);
  // 바코드는 왼쪽으로 물리고 오른쪽은 비워 둔다 — 그 자리가 관인 찍는 칸이다
  let barcodeY = 0;
  blocks.push({
    h: 62,
    draw: (y) => {
      barcodeY = y;
      drawBarcode(ctx, inX, y, Math.round(inW * 0.56), 62, `${data.date}#${data.score}#${data.total}`);
    },
  });
  space(18);
  blocks.push({
    h: 30,
    draw: (y) => {
      ctx.fillStyle = STAMP;
      ctx.font = font(700, 22, MONO);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      fillTracked(ctx, "apt-game.app", TAPE_X + TAPE_W / 2, y + 22, 1.8, "center");
    },
  });
  space(44);

  const tapeH = blocks.reduce((a, b) => a + b.h, 0);
  // 항목이 많아 종이가 캔버스를 넘치면 통째로 줄인다 (잘리는 것보다 낫다)
  const maxH = H - 120;
  const scale = tapeH > maxH ? maxH / tapeH : 1;
  const tapeY = (H - tapeH * scale) / 2;

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((-1.2 * Math.PI) / 180);
  ctx.translate(-W / 2, -H / 2);
  ctx.translate(0, tapeY);
  ctx.scale(1, scale);
  ctx.translate(0, -tapeY);

  ctx.save();
  ctx.shadowColor = "rgba(27,27,30,0.18)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = SHEET;
  tapePath(ctx, TAPE_X, tapeY, TAPE_W, tapeH);
  ctx.fill();
  ctx.restore();

  let cy = tapeY;
  for (const b of blocks) {
    b.draw(cy);
    cy += b.h;
  }
  // 관인은 마지막에 — 접수증을 다 찍고 나서 도장을 누르는 순서 그대로다.
  // 바코드 오른쪽 빈 칸에, 종이 안쪽으로 완전히 들어오게 찍어 링 글자가 잘리지 않는다.
  await drawSeal(ctx, inX + inW - 96, barcodeY + 31, 96);
  ctx.restore();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob 실패"))), "image/png");
  });
}

/** 모바일이면 시스템 공유 시트, 아니면 파일 다운로드 */
export async function shareCardImage(data: ShareCardData): Promise<"shared" | "downloaded"> {
  const blob = await renderShareCard(data);
  // 파일 이름은 ASCII로 둔다. 한글 이름을 <a download>에 넣으면 크롬이 속성값을 버리고
  // 확장자 없는 "download"로 저장해서, 안드로이드 갤러리가 이미지로 알아보지 못한다.
  // (영문 이름과 한글 이름을 같은 조건으로 대조해 확인했다)
  const file = new File([blob], `apt-game-${data.date}.png`, { type: "image/png" });
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
  a.rel = "noopener";
  // 사파리는 문서에 붙어 있지 않은 앵커의 click()을 무시한다. 크롬은 붙이지 않아도
  // 동작하지만, 붙여서 손해 볼 것은 없다.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10_000);
  return "downloaded";
}

// 렌더 검증용 훅 (Playwright에서 픽셀을 직접 확인한다)
if (typeof window !== "undefined") {
  (window as unknown as { __renderShareCard?: typeof renderShareCard }).__renderShareCard = renderShareCard;
}
