/* GB 51022-2015 门式刚架轻型房屋钢结构技术规范 — 순수 표·식 (폐쇄형).
   원문 KB: COde/CN/knowledge/gb51022-2015, 그림·표는 원본 이미지(_gb51022_raw/img)로 대조 (2026-10-16).
   - 4.2.1 wk = β·μw·μz·w0 — β 주골조 1.1, 퍼린·거트·외장재 1.5. μz 는 10 m 미만이면 10 m 값.
   - 4.2.2 μw (MBMA 2006 기반, 내압 ±i 포함): 표 4.2.2-1 횡방향(θ 보간, 주 3), 4.2.2-2 종방향,
     4.2.2-3 외벽, 4.2.2-4 쌍坡, 4.2.2-5 다경간 쌍坡, 4.2.2-6 편坡. 유효 면적 A = l·c, c ≥ l/3 (4.2.3).
   - 그림 4.2.2-1 a = min(최소 수평 치수 10%, 0.4h) ≥ max(최소 치수 4%, 1 m).
   - 4.3.2 적설 분포, 4.4.2-3 수직지진, 3.3 변형 한계, 3.4.2 세장비, 부록 A.0.6 흔들림 기둥 증폭. */

export type Internal = '+i' | '-i'
/** 표 4.2.2-1 주골조 횡방향 (폐쇄형): [1E, 2E, 3E, 4E, 1, 2, 3, 4, 5·6] */
export type ZoneMW = '1E' | '2E' | '3E' | '4E' | '1' | '2' | '3' | '4' | '5'
const ZONES: ZoneMW[] = ['1E', '2E', '3E', '4E', '1', '2', '3', '4', '5']
const TRANS: { deg: number; p: number[]; m: number[] }[] = [
  { deg: 5, p: [.43, -1.25, -.71, -.60, .22, -.87, -.55, -.47, -.63], m: [.79, -.89, -.35, -.25, .58, -.51, -.19, -.11, -.27] },
  { deg: 10.5, p: [.49, -1.25, -.76, -.67, .26, -.87, -.58, -.51, -.63], m: [.85, -.89, -.40, -.31, .62, -.51, -.22, -.15, -.27] },
  { deg: 15.6, p: [.54, -1.25, -.81, -.74, .30, -.87, -.62, -.55, -.63], m: [.90, -.89, -.45, -.38, .66, -.51, -.26, -.19, -.27] },
  { deg: 20, p: [.62, -1.25, -.87, -.82, .35, -.87, -.66, -.61, -.63], m: [.98, -.89, -.51, -.46, .71, -.51, -.30, -.25, -.27] },
  { deg: 30, p: [.51, .09, -.71, -.66, .38, .03, -.61, -.55, -.63], m: [.87, .45, -.35, -.30, .74, .39, -.25, -.19, -.27] },
]
/** 표 4.2.2-2 주골조 종방향 (모든 θ) — 1·4 = 박공벽, 2·3 = 지붕 (풍상 L/2·풍하 L/2), 5·6 = 측벽 */
const LONG = { p: [.43, -1.25, -.71, -.61, .22, -.87, -.55, -.47, -.63], m: [.79, -.89, -.35, -.25, .58, -.51, -.19, -.11, -.27] }

/** 표 4.2.2-1 μw — θ ≤ 5° 는 첫 행, 30~45° 는 끝 행, 사이는 직선보간 (주 3) */
export function mwTransCN(deg: number, i: Internal, zone: ZoneMW): number {
  if (!(deg >= 0 && deg <= 45)) throw new Error('GB 51022 table 4.2.2-1: 0° ≤ θ ≤ 45°')
  const k = ZONES.indexOf(zone), row = (r: (typeof TRANS)[number]) => (i === '+i' ? r.p : r.m)[k]
  if (deg <= TRANS[0].deg) return row(TRANS[0])
  const j = TRANS.findIndex((r) => deg <= r.deg)
  if (j < 0) return row(TRANS[TRANS.length - 1])
  const a = TRANS[j - 1], b = TRANS[j]
  return row(a) + (row(b) - row(a)) * (deg - a.deg) / (b.deg - a.deg)
}
export const mwLongCN = (i: Internal, zone: ZoneMW) => (i === '+i' ? LONG.p : LONG.m)[ZONES.indexOf(zone)]

/** 그림 4.2.2-1 주 — 가장자리 폭 a (m) */
export function edgeACN(minDim: number, h: number): number {
  return Math.max(Math.min(.1 * minDim, .4 * h), .04 * minDim, 1)
}
/** 표 4.2.2-1 주 4 — 2구역 μw 가 음이면 풍상 처마에서 min(0.5·최소 치수, 2.5h) 까지, 나머지는 3구역 */
export const zone2LenCN = (coef2: number, minDim: number, h: number, B: number) =>
  Math.min(B / 2, coef2 < 0 ? Math.min(.5 * minDim, 2.5 * h) : B / 2)

/** 면적 의존 계수: A ≤ 1 → v1, A ≥ A2 → v2, 사이는 log A 직선 (표의 "+k·logA + c" 와 같음) */
type Piece = [v1: number, v2: number, A2: number]
const byArea = ([v1, v2, A2]: Piece, A: number) =>
  A <= 1 ? v1 : A >= A2 ? v2 : v1 + (v2 - v1) * Math.log10(A) / Math.log10(A2)

export type ZoneCC = '1' | '2' | '3' | "2'" | "3'"
interface RoofTable { lo: number; hi: number; neg: Partial<Record<ZoneCC, Piece>>; pos: Piece }
/** 표 4.2.2-4a/b (θ≤10)·4d/e (10~30)·4g/h (30~45) 쌍坡 */
const GABLE: RoofTable[] = [
  { lo: 0, hi: 10, neg: { '3': [-2.98, -1.28, 10], '2': [-1.98, -1.28, 10], '1': [-1.18, -1.08, 10] }, pos: [.48, .38, 10] },
  { lo: 10, hi: 30, neg: { '3': [-2.28, -1.58, 10], '2': [-2.28, -1.58, 10], '1': [-1.08, -.98, 10] }, pos: [.68, .48, 10] },
  { lo: 30, hi: 45, neg: { '3': [-1.38, -1.18, 10], '2': [-1.38, -1.18, 10], '1': [-1.18, -.98, 10] }, pos: [1.08, .98, 10] },
]
/** 표 4.2.2-5a~d 다경간 쌍坡 (θ > 10°; θ ≤ 10° 는 그림 4.2.2-4a 쌍坡 표) */
const MULTI: RoofTable[] = [
  { lo: 0, hi: 10, neg: GABLE[0].neg, pos: GABLE[0].pos },
  { lo: 10, hi: 30, neg: { '3': [-2.88, -1.88, 10], '2': [-2.38, -1.88, 10], '1': [-1.78, -1.58, 10] }, pos: [.78, .58, 10] },
  { lo: 30, hi: 45, neg: { '3': [-2.78, -1.88, 10], '2': [-2.68, -1.88, 10], '1': [-2.18, -1.28, 10] }, pos: [1.18, .98, 10] },
]
/** 표 4.2.2-6a~d 편坡 (3° < θ ≤ 30°; θ ≤ 3° 는 쌍坡 θ ≤ 10° 표 = 평지붕) */
const MONO: RoofTable[] = [
  { lo: 0, hi: 3, neg: GABLE[0].neg, pos: GABLE[0].pos },
  { lo: 3, hi: 10, neg: { "3'": [-2.78, -1.78, 10], '3': [-1.98, -1.38, 10], "2'": [-1.78, -1.68, 10], '2': [-1.48, -1.38, 10], '1': [-1.28, -1.28, 10] }, pos: [.48, .38, 10] },
  { lo: 10, hi: 30, neg: { '3': [-3.08, -2.18, 10], '2': [-1.78, -1.38, 10], '1': [-1.48, -1.28, 10] }, pos: [.58, .48, 10] },
]
export type RoofKind = 'gable' | 'mono' | 'multi'
/** 지붕 외장재 μw {neg, pos} — 경계 각(10°·30°)은 두 표의 불리한 값 */
export function ccRoofCN(kind: RoofKind, deg: number, zone: ZoneCC, A: number): { neg: number; pos: number } {
  const tables = (kind === 'mono' ? MONO : kind === 'multi' ? MULTI : GABLE).filter((t) => deg >= t.lo - 1e-9 && deg <= t.hi + 1e-9)
  if (!tables.length) throw new Error(`GB 51022 table 4.2.2-${kind === 'mono' ? 6 : 4}: roof angle ${deg.toFixed(1)}° outside the tables`)
  let neg = 0, pos = 0
  for (const t of tables) {
    const p = t.neg[zone] ?? t.neg[zone.replace("'", '') as ZoneCC]
    if (!p) throw new Error(`GB 51022: zone ${zone} not in the ${kind} table`)
    neg = Math.min(neg, byArea(p, A)); pos = Math.max(pos, byArea(t.pos, A))
  }
  return { neg, pos }
}
/** 표 4.2.2-3a/b 외벽 — 5 = 모서리(가장자리 a 안), 4 = 중간 */
export function ccWallCN(zone: '4' | '5', A: number): { neg: number; pos: number } {
  return { neg: byArea(zone === '5' ? [-1.58, -.98, 50] : [-1.28, -.98, 50], A), pos: byArea([1.18, .88, 50], A) }
}
/** 4.2.3 유효 풍하중 면적 A = l·c, c ≥ max(부담폭, l/3) */
export const effAreaCN = (l: number, trib: number) => l * Math.max(trib, l / 3)
export const BETA_FRAME_CN = 1.1, BETA_CC_CN = 1.5

/** 4.4.2-3 수직지진 / 중력 대표값 — 8도 0.20g 10%, 0.30g 15%, 9도 20% (다우 αmax 0.16·0.24·0.32) */
export function verticalRatioCN(alphaMax: number): number {
  return alphaMax >= .32 - 1e-9 ? .2 : alphaMax >= .24 - 1e-9 ? .15 : alphaMax >= .16 - 1e-9 ? .1 : 0
}

/** 부록 A.0.6 흔들림 기둥이 있을 때 강접 기둥 계산길이 증폭 η = √(1 + Σ(N/h)흔들림 / (1.1·Σ(P/H)강접)) */
export function leanEtaCN(leanNh: number, rigidPH: number): number {
  return rigidPH > 1e-9 ? Math.sqrt(1 + Math.max(0, leanNh) / (1.1 * rigidPH)) : 1
}

/** 표 3.3.1 무크레인·경량 벽 h/60, 표 3.3.2 거트 L/100 (압형강판 벽)·풍주 L/250 */
export const DRIFT_CN = 1 / 60, GIRT_DEFL_CN = 1 / 100, POST_DEFL_CN = 1 / 250
/** 표 3.4.2 세장비 — 주요 압축재 180, 기타·가새 압축 220, 인장 가새 400 (장력 원형강·강선 제외) */
export const slenderLimitCN = (primary: boolean, compression: boolean) => (compression ? (primary ? 180 : 220) : 400)

/** 지진 조합 — 케이스 EX·EY·EV 를 포함 (조합 이름 "GB E+ EX", "GB EHV -EY EV" …) */
export const isSeismicCN = (combo: string) => /(^| )-?E[XYV]( |$)/.test(combo)
