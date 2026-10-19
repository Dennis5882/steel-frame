/* 다층 강골조 하중 (CN) — 순수 계산.
   - 풍: GB 50009-2012 8.1.1-1 wk = βz μs μz w0, μz 表8.2.1, βz 8.4.3~8.4.6 (φ1 表G.0.3), GB 55001-2021 4.6.5 βz ≥ 1.2,
         기본주기 T = 0.22 + 0.035H/B^(1/3) (예제 Gen 기본값), 층력 = wk × 받는 폭 × 분담 높이
   - 지진: GB 50011 表5.1.4-1 αmax(多遇), 表5.1.4-2 Tg
   - 조합: GB 55001-2021 3.1.13 (γG 1.3/1.0, γQ 1.5), ψc 활 0.7 (GB 50009 5.1.1)·풍 0.6 (8.1.4),
           GB 50011 5.4.1 (2024 局部修订) 1.3 G_E + 1.4 E_h, 유리 시 γG 1.0 */
import { muZ } from '../codes/cnLateral'
import type { CnSeismicSpec, FrameModel, FrameSpec } from './types'

/* ── 지진 ── */
export const ALPHA_MAX: Record<CnSeismicSpec['intensity'], number> = { '6_005': 0.04, '7_010': 0.08, '7_015': 0.12, '8_020': 0.16, '8_030': 0.24, '9_040': 0.32 }
export const SFI: Record<CnSeismicSpec['intensity'], string> = { '6_005': '0.05g', '7_010': '0.10g', '7_015': '0.15g', '8_020': '0.20g', '8_030': '0.30g', '9_040': '0.40g' }
const TG: Record<1 | 2 | 3, number[]> = { 1: [0.2, 0.25, 0.35, 0.45, 0.65], 2: [0.25, 0.3, 0.4, 0.55, 0.75], 3: [0.3, 0.35, 0.45, 0.65, 0.9] }
const SITES: CnSeismicSpec['site'][] = ['I0', 'I1', 'II', 'III', 'IV']
export const tgOf = (s: CnSeismicSpec) => TG[s.group][SITES.indexOf(s.site)]
/** GB 50011 表5.2.5 최소 전단중량비 (T1 < 3.5 s) */
export const LAMBDA_MIN: Record<CnSeismicSpec['intensity'], number> = { '6_005': 0.008, '7_010': 0.016, '7_015': 0.024, '8_020': 0.032, '8_030': 0.048, '9_040': 0.064 }

/* ── 풍 ── */
const PHI1_Z = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
const PHI1 = [0, 0.02, 0.08, 0.17, 0.27, 0.38, 0.45, 0.67, 0.74, 0.86, 1]
/** 表G.0.3 1차 진동형 계수 (직선 보간) */
export function phi1(zr: number): number {
  const r = Math.min(1, Math.max(0, zr)), i = Math.min(9, Math.floor(r * 10))
  return PHI1[i] + (PHI1[i + 1] - PHI1[i]) * (r - PHI1_Z[i]) / 0.1
}
const I10 = { A: 0.12, B: 0.14, C: 0.23, D: 0.39 }, KW = { A: 1.28, B: 1.0, C: 0.54, D: 0.26 }
const K_A1 = { A: [0.944, 0.155], B: [0.67, 0.187], C: [0.295, 0.261], D: [0.112, 0.346] }

/** βz (8.4.3) — 고층건축 계수. B = 받는 폭 (m, ≤ 2H), z·H 지면 기준 (m) */
export function betaZ(z: number, H: number, B: number, T1: number, w0: number, terrain: 'A' | 'B' | 'C' | 'D', zeta: number): number {
  const x1 = Math.max(5, 30 * (1 / T1) / Math.sqrt(KW[terrain] * w0))
  const R = Math.sqrt(Math.PI / (6 * zeta) * x1 * x1 / (1 + x1 * x1) ** (4 / 3))
  const Bw = Math.min(B, 2 * H)
  const rhoX = 10 * Math.sqrt(Bw + 50 * Math.exp(-Bw / 50) - 50) / Bw
  const rhoZ = 10 * Math.sqrt(H + 60 * Math.exp(-H / 60) - 60) / H
  const [k, a1] = K_A1[terrain]
  const Bz = k * H ** a1 * rhoX * rhoZ * phi1(z / H) / muZ(z, terrain)
  return 1 + 2 * 2.5 * I10[terrain] * Bz * Math.sqrt(1 + R * R)
}

export interface WindStory { level: number; z: number; muz: number; betaz: number; wk: number; width: number; trib: number; F: number }
export interface WindResult { dir: 'X' | 'Y'; T1: number; H: number; stories: WindStory[]; base: number }

/** 방향별 층 풍력. dir X = X 방향으로 부는 바람 (받는 폭 = Y 길이) */
export function windLoads(spec: FrameSpec, model: FrameModel, dir: 'X' | 'Y'): WindResult {
  const w = spec.wind, lv = model.levels, H = lv[lv.length - 1] - lv[0]
  const Lx = spec.xs[spec.xs.length - 1] - spec.xs[0], Ly = spec.ys[spec.ys.length - 1] - spec.ys[0]
  const width = dir === 'X' ? Ly : Lx
  /* 기본주기 — 예제 Gen 대화상자: X 방향 Bx = X 길이, Y 방향 By = Y 길이 */
  const Bt = dir === 'X' ? Lx : Ly
  const T1 = (dir === 'X' ? w.Tx : w.Ty) ?? 0.22 + 0.035 * H / Bt ** (1 / 3)
  const mus = Math.abs(w.muWindward) + Math.abs(w.muLeeward)
  const stories: WindStory[] = []
  for (let k = 1; k < lv.length; k++) {
    const z = lv[k] - lv[0]
    const trib = (lv[k] - lv[k - 1]) / 2 + (k < lv.length - 1 ? (lv[k + 1] - lv[k]) / 2 : 0)
    const muz = muZ(z, w.terrain), bz = Math.max(1.2, betaZ(z, H, width, T1, w.w0, w.terrain, w.damping))
    const wk = bz * mus * muz * w.w0
    stories.push({ level: k, z, muz, betaz: bz, wk, width, trib, F: wk * width * trib })
  }
  return { dir, T1, H, stories, base: stories.reduce((a, s) => a + s.F, 0) }
}

/* ── 하중조합 ── */
export type CaseKey = 'D' | 'L' | 'WX' | 'WY' | 'RX' | 'RY'
export interface Combo { name: string; desc: string; seismic: boolean; wind: boolean; terms: [CaseKey, number][] }

export function frameCombos(): Combo[] {
  const out: Combo[] = []
  const add = (desc: string, seismic: boolean, terms: [CaseKey, number][]) =>
    out.push({ name: `sLCB${out.length + 1}`, desc, seismic, wind: terms.some(([k]) => k === 'WX' || k === 'WY'), terms })
  add('1.3D+1.5L', false, [['D', 1.3], ['L', 1.5]])
  add('1.0D+1.5L', false, [['D', 1.0], ['L', 1.5]])
  for (const [w, s] of [['WX', 1], ['WX', -1], ['WY', 1], ['WY', -1]] as [CaseKey, number][]) {
    const sg = s > 0 ? '+' : '-'
    add(`1.3D+1.5L${sg}0.9${w}`, false, [['D', 1.3], ['L', 1.5], [w, 0.9 * s]])
    add(`1.3D+1.05L${sg}1.5${w}`, false, [['D', 1.3], ['L', 1.05], [w, 1.5 * s]])
    add(`1.3D${sg}1.5${w}`, false, [['D', 1.3], [w, 1.5 * s]])
    add(`1.0D${sg}1.5${w}`, false, [['D', 1.0], [w, 1.5 * s]])
  }
  /* 지진: 중력대표값 G_E = D + 0.5L (질량과 같은 계수는 spec.seismic.liveMassFactor — 여기서는 조합 계수로 반영) */
  for (const e of ['RX', 'RY'] as CaseKey[]) {
    add(`1.3(D+0.5L)+1.4${e}`, true, [['D', 1.3], ['L', 0.65], [e, 1.4]])
    add(`1.0(D+0.5L)+1.4${e}`, true, [['D', 1.0], ['L', 0.5], [e, 1.4]])
  }
  return out
}

/* ── 하중 합계 (오프라인 평형 확인용) ── */
export function gravityTotals(spec: FrameSpec, model: FrameModel) {
  const ns = model.levels.length - 1, A = model.floorArea, P = model.perimeter, l = spec.loads
  const floorD = A * (l.floorDead * (ns - 1) + l.roofDead), floorL = A * (l.floorLive * (ns - 1) + l.roofLive)
  const edge = P * (l.edgeFloor * (ns - 1) + l.edgeRoof)
  return { floorD, floorL, edge, dlExceptSelf: floorD + edge, ll: floorL }
}
