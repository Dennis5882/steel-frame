/* 대만 風力規範(2014) 3장 — 局部構材及外部被覆物 외풍압계수 (GCp), 封閉/部分封閉 h ≤ 18 m (그림 3.1).
   원문: 3.3 해설 — 그림 3.1 의 (GCp) = ASCE 7-02 값 × 2.083 (풍속 평균시간 10분 vs 3초, 1.443²).
   KB 그림 전사값(wind-load-2014/圖表-00-圖表.md)과 대조: 벽 ④ −2.29→−1.67, ⑤ −2.92→−1.67, 정압 2.08→1.46 (A 1→50 m²);
   지붕 θ≤7° ① −2.08→−1.87, ② −3.75→−2.29, ③ −5.83→−2.29, 정압 0.62→0.42 (A 1→10 m²) 등 — 일치.
   受風面積 A = 경간 × 유효폭, 유효폭 ≥ 경간/3 (1장 정의). 구역 폭 a = min(0.4h, 0.1·최소폭) ≥ max(0.9 m, 0.04·최소폭).
   그림 3.1(a) 주1: θ ≤ 10° 이면 벽 (GCp) 10% 저감. */

const K = 2.083
type Curve = [A1: number, v1: number, A2: number, v2: number]
/** 로그 면적 직선 보간 (A ≤ A1 → v1, A ≥ A2 → v2) */
const interp = ([A1, v1, A2, v2]: Curve, A: number) =>
  A <= A1 ? v1 : A >= A2 ? v2 : v1 + ((v2 - v1) * Math.log10(A / A1)) / Math.log10(A2 / A1)
const c = (A1: number, v1: number, A2: number, v2: number): Curve => [A1, v1 * K, A2, v2 * K]

/* ASCE 7-02 그림 6-11A~D 원값 (×2.083 은 c() 에서) */
const WALL = { pos: c(1, 1.0, 50, 0.7), z4: c(1, -1.1, 50, -0.8), z5: c(1, -1.4, 50, -0.8) }
const ROOF = {
  flat: { pos: c(1, 0.3, 10, 0.2), z1: c(1, -1.0, 10, -0.9), z2: c(1, -1.8, 10, -1.1), z3: c(1, -2.8, 10, -1.1) }, // θ ≤ 7°
  mid: { pos: c(1, 0.5, 10, 0.3), z1: c(1, -0.9, 10, -0.8), z2: c(1, -1.7, 10, -1.2), z3: c(1, -2.6, 10, -2.0) }, // 7° < θ ≤ 27°
  steep: { pos: c(1, 0.9, 10, 0.8), z1: c(1, -1.0, 10, -0.8), z2: c(1, -1.2, 10, -1.0), z3: c(1, -1.2, 10, -1.0) }, // 27° < θ ≤ 45°
}

export type CCZone = 1 | 2 | 3 | 4 | 5

/** (GCp) 정압·부압 쌍 — 지붕 구역 1~3, 벽 4~5 */
export function gcpCC(zone: CCZone, A: number, thetaDeg: number): { pos: number; neg: number } {
  if (zone >= 4) {
    const red = thetaDeg <= 10 ? 0.9 : 1
    return { pos: interp(WALL.pos, A) * red, neg: interp(zone === 4 ? WALL.z4 : WALL.z5, A) * red }
  }
  const t = thetaDeg <= 7 ? ROOF.flat : thetaDeg <= 27 ? ROOF.mid : ROOF.steep
  return { pos: interp(t.pos, A), neg: interp(zone === 1 ? t.z1 : zone === 2 ? t.z2 : t.z3, A) }
}

/** 구역 폭 a (m) — h: 평균 지붕 높이(θ ≤ 10° 면 처마), least: 건물 최소 폭 */
export const zoneWidth = (h: number, least: number) => Math.max(Math.min(0.4 * h, 0.1 * least), 0.9, 0.04 * least)

/** 受風面積 (m²) — 경간 L × 유효폭(부담폭, ≥ L/3) */
export const effArea = (L: number, trib: number) => L * Math.max(trib, L / 3)
