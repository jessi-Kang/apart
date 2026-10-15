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

type Geo = [number, number] | [number, number, number];

/**
 * 사진은 단지 좌표를 한가운데 두고 받는다. 그래서 사진 정중앙이 곧 그 단지다 —
 * 핀을 가운데 찍어 "이 사진 속 어느 건물인가"를 알려 준다(핀이 없으면 지붕 숲일 뿐이었다).
 * 한 단계 더 당겨(18) 단지가 사진을 거의 채우게 한다.
 */
function photoUrl([lat, lng]: Geo, size: number): string {
  const q = new URLSearchParams({
    service: "image",
    request: "getmap",
    key: KEY,
    format: "jpeg",
    basemap: "PHOTO",
    center: `${lng},${lat}`,
    crs: "epsg:4326",
    zoom: "18",
    size: `${size},${size}`,
  });
  return `https://api.vworld.kr/req/image?${q}`;
}

export const photoEnabled = (geo?: Geo) => Boolean(KEY && geo);

/**
 * 카카오맵으로 잇는 주소. 항공사진만으로는 어느 건물인지 실감이 안 나서, 사람들이 올린
 * 단지 사진과 로드뷰가 있는 카카오맵 장소 화면으로 보낸다. 장소 번호가 아직 없는
 * 단지(야간 작업이 채우는 중)는 좌표에 핀을 꽂은 지도로 연다 — 거기서도 로드뷰가 된다.
 */
function kakaoUrl(geo: Geo, name: string): string {
  if (geo.length === 3) return `https://place.map.kakao.com/${geo[2]}`;
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${geo[0]},${geo[1]}`;
}

/** 사진 정중앙의 핀. 인주색 하나만 쓴다 */
function Pin({ size }: { size: number }) {
  return (
    <svg className="apt-pin" width={size} height={size * 1.3} viewBox="0 0 20 26" aria-hidden="true">
      <path d="M10 25C10 25 2 15.6 2 9.6A8 8 0 0 1 18 9.6C18 15.6 10 25 10 25Z" fill="var(--stamp)" stroke="var(--sheet)" strokeWidth="1.6" />
      <circle cx="10" cy="9.6" r="3" fill="var(--sheet)" />
    </svg>
  );
}

export function AptPhoto({
  geo,
  name,
  caption,
  onLoadFail,
}: {
  geo: Geo;
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
        <Pin size={14} />
        <em>사진</em>
      </button>
      {open && (
        <div className="photo-veil" role="dialog" aria-modal="true" aria-label={`${name} 항공사진`} onClick={() => setOpen(false)}>
          <div className="photo-card" onClick={(e) => e.stopPropagation()}>
            <div className="photo-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(geo, 640)} alt={`${name}을 하늘에서 내려다본 사진. 가운데 핀이 단지 위치`} width={320} height={320} />
              <Pin size={26} />
            </div>
            <b>{name}</b>
            <p>{caption}</p>
            <small>가운데 핀이 단지 위치 · 항공사진 브이월드(국토교통부)</small>
            <a className="photo-link" href={kakaoUrl(geo, name)} target="_blank" rel="noopener noreferrer">
              카카오맵에서 단지 사진·로드뷰 보기 ›
            </a>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
