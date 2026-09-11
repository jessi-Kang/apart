"use client";

import { useEffect, useState } from "react";
import type { RegionGroup } from "@/lib/data";
import { AREA_EVENT, areaPref, setAreaPref } from "@/lib/local";

/**
 * 접수 대장 위의 '담당 구역' 칸.
 * 기본은 전국 무작위이고, 시·도나 서울 자치구를 고르면 그 범위 단지만 나온다.
 * 구역끼리 점수를 비교하거나 줄 세우지 않는다 — 어느 동네가 더 어렵다는
 * 이야기를 만드는 순간 게임이 아니라 시비가 된다.
 *
 * 이름 조립은 구역을 따르지 않는다. 두 단어 이상인 단지가 한 구에
 * 열 곳 남짓이라 같은 퍼즐이 바로 되풀이된다.
 */
export function AreaPicker({ regions }: { regions: RegionGroup[] }) {
  const [area, setArea] = useState("");

  useEffect(() => {
    const refresh = () => setArea(areaPref());
    refresh();
    window.addEventListener(AREA_EVENT, refresh);
    return () => window.removeEventListener(AREA_EVENT, refresh);
  }, []);

  const seoul = regions.find((r) => r.districts.length > 0);
  const label = area ? area.replace(/특별자치시$|특별시$|광역시$/, "") : "";

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
        <optgroup label="시 · 도">
          {regions.map((r) => (
            <option key={r.sido} value={r.sido}>
              {r.label} 전체
            </option>
          ))}
        </optgroup>
        {seoul && (
          <optgroup label="서울 자치구">
            {seoul.districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="area-note">
        {area ? `${label} 단지만 나옵니다 · 이름 조립 제외` : "전국에서 무작위로 나옵니다"}
      </p>
    </div>
  );
}
