/* 한국 KDS 41 12 00 (2022) 5.4.2·5.8 — 외장재설계용 피크풍압계수, 기준높이 H < 20 m.
   W_C = q_H(Ĉpe − Ĉpi)·A_C (5.4-3), q_H = 지표면조도 A·B·C 이면 C 로 계산, D 이면 D (5.4.2(1)). |W_C/A_C| ≥ 675 N/m² (5.4(2)).
   그래프 값은 원문 그림(KB assets)을 직접 읽어 대조 — 로그 면적 직선 보간:
   - 벽 표 5.8-2①: 정압 ④⑤ 2.0(≤ 2 m², 그림상 꺾임 ~2 — 전사는 1, 보수적으로 2) → 1.4(50) / 부압 ④ −2.2 → −1.6, ⑤ −2.8 → −1.6 (1 → 50). θ ≤ 10° 면 10% 저감 가능(주 3).
   - 박공 지붕 표 5.8-2②: θ ≤ 10° ① −2.1 → −1.8, ② −3.9 → −2.25, ③ −6.0 → −2.25 (1 → 10, 정압 없음) /
     10° < θ ≤ 30° ① −1.8 → −1.6, ② −3.4 → −2.4, ③ −5.2 → −4.0 (정압 없음) / 30° < θ ≤ 45° 정압 1.95 → 1.65, ① −2.1 → −1.8, ②③ −2.55 → −2.1.
   - 편지붕 표 5.8-3: θ ≤ 10° 정압 0.6 → 0.4, ① −2.2, ② −2.6 → −2.4, ③ −3.6 → −2.4, ④ −3.2 → −3.0, ⑤ −5.2 → −3.2 /
     10° < θ ≤ 30° 정압 0.8 → 0.6, ① −2.6 → −2.2, ② −3.2 → −2.4, ③ −5.8 → −4.0. (30° 초과 표 없음 → 적용범위 밖)
   - 다중박공 표 5.8-4: θ ≤ 10° 표 5.8-2② ① (주 2) / 10° < θ ≤ 30° 정압 1.2 → 0.8, ① −3.2 → −2.8, ② −4.4 → −3.4, ③ −5.4 → −3.4 /
     30° < θ ≤ 45° 정압 2.0 → 1.6, ① −4.0 → −2.2, ② −5.0 → −3.4, ③ −5.2 → −3.4.
   - 피크내압 표 5.8-9 = 주골조 표 5.7-4(CPI_KR) 의 정확히 2배 (밀폐 분류 동일). */
import { CPI_KR, type CpiKR } from './krLateral'

type Curve = [A1: number, v1: number, A2: number, v2: number]
const interp = ([A1, v1, A2, v2]: Curve, A: number) =>
  A <= A1 ? v1 : A >= A2 ? v2 : v1 + ((v2 - v1) * Math.log10(A / A1)) / Math.log10(A2 / A1)
const r = (v1: number, v2: number): Curve => [1, v1, 10, v2]
const NONE: Curve = [1, 0, 10, 0]

/** 지붕 구역 1(일반)·2(가장자리)·3(모서리) 의 부압 곡선과 정압 곡선 */
interface RoofTable { pos: Curve; z1: Curve; z2: Curve; z3: Curve }
const GABLE: RoofTable[] = [
  { pos: NONE, z1: r(-2.1, -1.8), z2: r(-3.9, -2.25), z3: r(-6.0, -2.25) }, // θ ≤ 10°
  { pos: NONE, z1: r(-1.8, -1.6), z2: r(-3.4, -2.4), z3: r(-5.2, -4.0) }, // 10° < θ ≤ 30°
  { pos: r(1.95, 1.65), z1: r(-2.1, -1.8), z2: r(-2.55, -2.1), z3: r(-2.55, -2.1) }, // 30° < θ ≤ 45°
]
/* 편지붕 θ ≤ 10° 는 5구역(가장자리 ②·④, 모서리 ③·⑤) — 방향 구분 없이 가장자리 = ④(더 불리), 모서리 = ⑤ 로 보수적 단순화 */
const MONO: RoofTable[] = [
  { pos: r(0.6, 0.4), z1: r(-2.2, -2.2), z2: r(-3.2, -3.0), z3: r(-5.2, -3.2) },
  { pos: r(0.8, 0.6), z1: r(-2.6, -2.2), z2: r(-3.2, -2.4), z3: r(-5.8, -4.0) },
]
const MULTI: RoofTable[] = [
  GABLE[0],
  { pos: r(1.2, 0.8), z1: r(-3.2, -2.8), z2: r(-4.4, -3.4), z3: r(-5.4, -3.4) },
  { pos: r(2.0, 1.6), z1: r(-4.0, -2.2), z2: r(-5.0, -3.4), z3: r(-5.2, -3.4) },
]
const WALL = { pos: [2, 2.0, 50, 1.4] as Curve, z4: [1, -2.2, 50, -1.6] as Curve, z5: [1, -2.8, 50, -1.6] as Curve }

export type RoofFormKR = 'gable' | 'mono' | 'multi'
export type CCZoneKR = 1 | 2 | 3 | 4 | 5

/** 지붕 형식·경사가 표 범위 안인지 (편지붕 30° 초과·45° 초과는 표 없음) */
export const ccRangeKR = (form: RoofFormKR, thetaDeg: number) => thetaDeg <= (form === 'mono' ? 30 : 45)

/** Ĉpe 정압·부압 쌍 — 지붕 구역 1~3, 벽 4~5 */
export function cpeCCKR(form: RoofFormKR, zone: CCZoneKR, A: number, thetaDeg: number): { pos: number; neg: number } {
  if (zone >= 4) {
    const red = thetaDeg <= 10 ? 0.9 : 1
    return { pos: interp(WALL.pos, A) * red, neg: interp(zone === 4 ? WALL.z4 : WALL.z5, A) * red }
  }
  if (!ccRangeKR(form, thetaDeg)) throw new Error(`KDS C&C: no table 5.8 for ${form} roof at ${thetaDeg.toFixed(1)}°`)
  const i = thetaDeg <= 10 ? 0 : thetaDeg <= 30 ? 1 : 2
  const t = (form === 'mono' ? MONO : form === 'multi' ? MULTI : GABLE)[i]
  return { pos: interp(t.pos, A), neg: interp(zone === 1 ? t.z1 : zone === 2 ? t.z2 : t.z3, A) }
}

/** 표 5.8-9 피크내압계수 Ĉpi (+, −) — 주골조 표 5.7-4 의 2배 */
export const cpiCCKR = (k: CpiKR): [number, number] => [2 * CPI_KR[k][0], 2 * CPI_KR[k][1]]

/** 구역 폭 a (m) — min(0.1·최소폭, 0.4H) ≥ max(0.04·최소폭, 1.0) (표 5.8-2~5.8-4 주) */
export const zoneWidthKR = (H: number, least: number) => Math.max(Math.min(0.1 * least, 0.4 * H), 0.04 * least, 1.0)

/** 유효수압면적 A_C (m²) — 외장재는 '하중분담 표면적'(1.3 용어 정의): 경간 L × 부담폭. 대만식 L/3 하한 없음 (면적이 작을수록 계수 큼 — 보수적) */
export const effAreaKR = (L: number, trib: number) => L * trib

/** 5.4(2) 외장재 설계풍압 하한 675 N/m² */
export const CC_MIN_KR = 0.675
