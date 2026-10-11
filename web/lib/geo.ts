import coords from "@/data/coords.json";

/**
 * 실단지 좌표 (위도, 경도). 야간 수집 작업이 카카오 로컬 API로 채운다
 * (`scripts/geocode-kakao.mjs`). 못 찾은 단지는 null로 남겨 다시 묻지 않는다.
 *
 * 좌표는 정답을 공개한 뒤의 응답에만 싣는다. 문제를 내는 응답에 실리면
 * "좌표가 있다 = 진짜"가 되어 그대로 정답이 샌다.
 */
export type Geo = [number, number] | [number, number, number];
const table = coords as unknown as Record<string, Geo | null>;

/** [위도, 경도, 카카오 장소 번호?]. 장소 번호는 크게 본 화면의 카카오맵 연결에 쓴다 */
export function geoOf(id: string): Geo | undefined {
  return table[id] ?? undefined;
}
