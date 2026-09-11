import { isArea } from "./data";

/**
 * 요청이 들고 온 구역 값을 집계·출제에 쓸 수 있는 형태로 정규화한다.
 * 모르는 값은 전국("")으로 떨어뜨린다 — 임의 문자열이 들어와 집계 테이블에
 * 쓰레기 구역을 만들지 못하게 한다.
 */
export function normalizeArea(value: unknown): string {
  return typeof value === "string" && isArea(value) ? value : "";
}

/** 쿼리스트링(?area=)에서 꺼내 정규화 */
export function areaFromUrl(url: string): string {
  return normalizeArea(new URL(url).searchParams.get("area"));
}
