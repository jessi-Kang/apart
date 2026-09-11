"use client";

import { useEffect, useState } from "react";
import type { RegionGroup } from "@/lib/data";
import { AREA_EVENT, areaPref, setAreaPref } from "@/lib/local";

/**
 * 접수 대장 위의 '담당 구역' 칸.
 * 기본은 전국 무작위이고, 시·도를 고르면 세 창구가 모두 그 범위 단지만 낸다.
 * 공식전도 따라간다 — 같은 (날짜, 구역) 참가자끼리 같은 10문제를 풀고 순위도 그 안에서 난다.
 * 한때 공식전만 전국 공통이라 그렇게 안내했는데, 지금은 사실이 아니라 걷어냈다.
 *
 * 자치구 단위는 두지 않는다. 전수 수집이 끝난 곳이 서울뿐이라 서울만 구를 열면
 * "왜 여기만 구가 있지"가 생기고, 조립은 구 단위로 퍼즐이 3~20개뿐이라
 * 창구마다 적용 범위가 갈렸다. 시·도 하나로 맞추면 설명할 것이 없어진다.
 *
 * 구역끼리 점수를 비교하거나 줄 세우지 않는다 — 어느 동네가 더 어렵다는
 * 이야기를 만드는 순간 게임이 아니라 시비가 된다.
 */
export function AreaPicker({ regions }: { regions: RegionGroup[] }) {
  const [area, setArea] = useState("");

  useEffect(() => {
    const refresh = () => setArea(areaPref());
    refresh();
    window.addEventListener(AREA_EVENT, refresh);
    return () => window.removeEventListener(AREA_EVENT, refresh);
  }, []);

  const label = area.replace(/특별자치시$|특별시$|광역시$/, "");

  return (
    <div className="area-row">
      <label className="area-k" htmlFor="area-select">
        담당 구역
      </label>
      <select
        id="area-select"
        className="area-sel"
        value={area}
        onChange={(e) => {
          setArea(e.target.value);
          setAreaPref(e.target.value);
        }}
      >
        <option value="">전국 · 무작위</option>
        {regions.map((r) => (
          <option key={r.sido} value={r.sido}>
            {r.label}
          </option>
        ))}
      </select>
      <p className="area-note">
        {area ? `${label} 단지만 나옵니다 · 공식전 포함` : "전국에서 무작위로 나옵니다"}
      </p>
    </div>
  );
}
