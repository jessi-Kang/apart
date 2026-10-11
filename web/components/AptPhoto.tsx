"use client";

import { useEffect, useState } from "react";
import { sfxTap } from "@/lib/sound";

/**
 * 실단지 항공사진 (확정 시안 design/photo-a.html 1·2·4번).
 *
 * 정답 공개 칸 글 오른쪽에 84px 작은 사진을 두고, 누르면 덮개로 크게 본다.
 * 크게 띠로 넣으면 320x568에서 '다음 문제'가 첫 화면 밖으로 밀려 매 문제
 * 스크롤이 생긴다(시안 5번). 덮개는 닫혀 있는 동안 화면 구조를 건드리지 않는다.
 *
 * 사진은 휴대폰이 브이월드에서 직접 받는다 — 사이트 서버를 거치지 않아 Vercel
 * 전송량이 늘지 않는다. 키(NEXT_PUBLIC_VWORLD_KEY)는 브이월드에 등록한 도메인에서만
 * 통하는 공개용 키다. 키가 없거나 좌표가 없거나 사진을 못 받으면 칸을 통째로 접는다
 * (깨진 그림이 남지 않게, 시안 4번).
 */

const KEY = process.env.NEXT_PUBLIC_VWORLD_KEY ?? "";

function photoUrl([lat, lng]: [number, number], size: number): string {
  const q = new URLSearchParams({
    service: "image",
    request: "getmap",
    key: KEY,
    format: "jpeg",
    basemap: "PHOTO",
    center: `${lng},${lat}`,
    crs: "epsg:4326",
    zoom: "17",
    size: `${size},${size}`,
  });
  return `https://api.vworld.kr/req/image?${q}`;
}

export const photoEnabled = (geo?: [number, number]) => Boolean(KEY && geo);

export function AptPhoto({
  geo,
  name,
  caption,
  onLoadFail,
}: {
  geo: [number, number];
  name: string;
  caption: string;
  /** 사진을 못 받았을 때. 감싸는 칸이 사진 자리를 접는다 */
  onLoadFail: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="apt-thumb"
        aria-label={`${name} 항공사진 크게 보기`}
        onClick={() => {
          sfxTap();
          setOpen(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl(geo, 168)} alt="" width={84} height={84} onError={onLoadFail} />
        <em>사진</em>
      </button>
      {open && (
        <div className="photo-veil" role="dialog" aria-modal="true" aria-label={`${name} 항공사진`} onClick={() => setOpen(false)}>
          <div className="photo-card" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(geo, 640)} alt={`${name}을 하늘에서 내려다본 사진`} width={320} height={320} />
            <b>{name}</b>
            <p>{caption}</p>
            <small>항공사진 · 브이월드(국토교통부)</small>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
