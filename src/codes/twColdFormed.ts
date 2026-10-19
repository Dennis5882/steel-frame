/* 냉간성형 립 C형강(CC) 부재 강도 (순수 함수, N·mm·MPa).
   근거: 대만 「冷軋型鋼構造建築物結構設計規範」 — 鋼構造 LRFD 1.1 이 냉간성형재를 적용 범위에서 제외하고 이 규범을 따르도록 함.
   원문 대조: COde/TW/knowledge/cold-formed-steel-code (2026-10-17).
   PDF 제작일 2015-10은 판본 연도가 아님. 유효폭 4.3~4.5, 휨 6.2, 전단 6.3~6.4,
   압축 7.2~7.3, 조합 8.2~8.3. 단면형상변형은 TW 전용 twDistortional 사용.
   - B2.1 유효폭 ρ = (1 − 0.22/λ)/λ (λ > 0.673), λ = (1.052/√k)(w/t)√(f/E)
   - B2.3 응력 경사 웨브 k = 4 + 2(1+ψ)³ + 2(1+ψ), b1 = be/(3+ψ), b2 = be/2 (ψ > 0.236) / be − b1
   - B3.1·B3.2 비보강 요소(립) k = 0.43
   - B4 립 보강 플랜지: S = 1.28√(E/f), Ia, RI = Is/Ia ≤ 1, n, k = 3.57·RI^n + 0.43 (D/w ≤ 0.25) 또는 (4.82 − 5D/w)·RI^n + 0.43 (≤ 0.8), ds = ds′·RI
   - C3.1.1 단면 강도 Mn = Se·Fy (φb 0.95), C3.1.2.1 횡비틀림 Fe = Cb·r0·A·√(σey·σt)/Sf → Fc, Mn = Sc·Fc (φb 0.90)
   - C3.2.1 전단 kv = 5.34 (φv 0.95), C3.3.2 휨+전단 √((M/φMnxo)² + (V/φVn)²) ≤ 1
   - C4 압축 Fe = min(휨좌굴 y, 휨비틀림 x-θ), Fn = 0.658^λc²·Fy / 0.877Fy/λc², Pn = Ae·Fn (φc 0.85)
   - C5.2.2 압축+휨 (P/φPn ≤ 0.15 단순식, 초과 시 1/α 증폭식), C5.1 인장+휨, 인장 Tn = Ag·Fy (φt 0.95)
   단순화: 모서리 R = 0 (평판 폭 = 외곽 − 2t), 약축 휨 φMny = 0.90·Sy·Fy (유효폭 미적용, 참고), 립 각도 90°. */
import type { SectionProps } from '../domain/sections'
import { distortionalTW } from './twDistortional'

const rho = (lam: number) => (lam <= 0.673 ? 1 : Math.max(0, (1 - 0.22 / lam) / lam))
const lamOf = (k: number, w: number, t: number, f: number, E: number) => (1.052 / Math.sqrt(k)) * (w / t) * Math.sqrt(Math.max(f, 1e-9) / E)
/** B2.1 / B3.1 균일 압축 유효폭 */
export const effWidth = (k: number, w: number, t: number, f: number, E: number) => rho(lamOf(k, w, t, f, E)) * w

/** B4 립 보강 플랜지 — w: 플랜지 평판 폭, D: 립 외곽 길이, d: 립 평판 길이 → 플랜지 유효폭 b, 립 유효 ds */
export function edgeStiffened(w: number, D: number, d: number, t: number, f: number, E: number) {
  const S = 1.28 * Math.sqrt(E / Math.max(f, 1e-9))
  const dsPrime = effWidth(0.43, d, t, f, E) // B3.1 (응력 f 보수적)
  if (w / t <= 0.328 * S) return { b: w, ds: dsPrime, k: 4, RI: 1 }
  const Ia = Math.min(399 * t ** 4 * ((w / t) / S - 0.328) ** 3, t ** 4 * (115 * (w / t) / S + 5))
  const Is = (d ** 3 * t) / 12
  const RI = Math.min(1, Is / Ia)
  const n = Math.max(1 / 3, 0.582 - (w / t) / (4 * S))
  const Dw = D / w
  const k = Math.min(4, (Dw <= 0.25 ? 3.57 : Math.max(0, 4.82 - 5 * Dw)) * RI ** n + 0.43)
  return { b: effWidth(k, w, t, f, E), ds: dsPrime * RI, k, RI }
}

interface Seg { L: number; y0: number; vertical: boolean }
/** 선요소 합 → A, 도심(상단 기준 y), Ix (두께 t) */
function sumSegs(segs: Seg[], t: number) {
  let A = 0, Ay = 0, I0 = 0
  for (const s of segs) {
    if (s.L <= 0) continue
    const a = s.L * t
    const yc = s.vertical ? s.y0 + s.L / 2 : s.y0
    A += a; Ay += a * yc
    I0 += s.vertical ? (t * s.L ** 3) / 12 + a * yc ** 2 : (s.L * t ** 3) / 12 + a * yc ** 2
  }
  const yc = Ay / A
  return { A, yc, I: I0 - A * yc ** 2 }
}

/** 립 C형강 치수 (mm) — 'CC HxBxC/t' 를 sectionProps 가 가진 d·bf·tw 와 립 길이로 */
export interface CCDims { H: number; B: number; C: number; t: number }
export const ccDims = (name: string): CCDims => {
  /* KS21(한국) 'LC-150x65x20x3.2' — 두께도 x 구분 */
  if (name.trim().startsWith('LC-')) { const [H, B, C, t] = name.trim().slice(3).split('x').map(Number); return { H, B, C, t } }
  const [size, ts] = name.trim().split(/\s+/)[1].split('/')
  const [H, B, C] = size.split('x').map(Number)
  return { H, B, C, t: +ts }
}

/** 강축 휨 유효 단면계수 — 상부 플랜지 압축, 압축 플랜지 응력 f 에서 (C3.1.1 절차, 중립축 반복) */
export function effSx(g: CCDims, f: number, E: number) {
  const { H, B, C, t } = g
  const h = H - t, b = B - t, cl = C - t / 2 // 중심선
  const wF = B - 2 * t, wW = H - 2 * t, dL = C - t // 평판 폭
  const fl = edgeStiffened(wF, C, dL, t, f, E)
  let yc = H / 2
  let res = { A: 0, yc, I: 0 }
  for (let it = 0; it < 30; it++) {
    /* 웨브 응력 경사: 압축 f1 (웨브 상단 평판), 인장 f2 (하단) — 선형 */
    const ytop = t, ybot = H - t
    const f1 = (f * (yc - ytop)) / yc, f2 = (f * (ybot - yc)) / yc
    const psi = Math.abs(f2 / Math.max(f1, 1e-9))
    const k = 4 + 2 * (1 + psi) ** 3 + 2 * (1 + psi)
    const be = effWidth(k, wW, t, f1, E)
    const b1 = be / (3 + psi), b2 = psi > 0.236 ? be / 2 : be - b1
    const comp = yc - ytop // 웨브 압축 구간 길이
    const segs: Seg[] = [
      /* 상부 플랜지 (압축): 중심선 폭 b 중 평판 비유효 폭 (wF − b) 제외 */
      { L: b - (wF - fl.b), y0: t / 2, vertical: false },
      { L: b, y0: H - t / 2, vertical: false }, // 하부 플랜지
      /* 상부 립: 유효 ds (+ 모서리 t/2) — 플랜지에서 아래로 */
      { L: Math.min(cl, fl.ds + t / 2), y0: t / 2, vertical: true },
      { L: cl, y0: H - t / 2 - cl, vertical: true }, // 하부 립
    ]
    if (b1 + b2 >= comp) segs.push({ L: h, y0: t / 2, vertical: true })
    else {
      segs.push({ L: b1 + t / 2, y0: t / 2, vertical: true }) // 상단 유효 b1
      segs.push({ L: H - t / 2 - (yc - b2), y0: yc - b2, vertical: true }) // b2 + 인장부
    }
    res = sumSegs(segs, t)
    if (Math.abs(res.yc - yc) < 1e-3) break
    yc = res.yc
  }
  /* 압축 연단(상단) 응력 = f 기준 Se = Ie / yc (중립축이 인장 쪽으로 내려가 압축 플랜지가 먼저 항복) */
  return { Se: res.I / res.yc, Ie: res.I, yc: res.yc, flange: fl }
}

/** 균일 압축 유효 면적 (C4) */
export function effArea(g: CCDims, f: number, E: number) {
  const { H, B, C, t } = g
  const wF = B - 2 * t, wW = H - 2 * t, dL = C - t
  const fl = edgeStiffened(wF, C, dL, t, f, E)
  const web = effWidth(4, wW, t, f, E)
  /* 총면적(중심선) − 비유효 폭 × t */
  const Ag = t * (H - t + 2 * (B - t) + 2 * (C - t / 2))
  return Ag - t * ((wW - web) + 2 * (wF - fl.b) + 2 * (dL - fl.ds))
}

/** 전단중심 거리 m (웨브 중심선 기준, AISI Manual 립 C) 와 Cw (중심선) */
export function shearCenter(g: CCDims, Ix: number) {
  const a = g.H - g.t, b = g.B - g.t, c = g.C - g.t / 2, t = g.t
  const m = ((b * t) / (12 * Ix)) * (6 * c * a ** 2 + 3 * b * a ** 2 - 8 * c ** 3)
  const Cw = ((a ** 2 * b ** 2 * t) / 12) *
    (2 * a ** 3 * b + 3 * a ** 2 * b ** 2 + 48 * c ** 4 + 112 * b * c ** 3 + 8 * a * c ** 3 + 48 * a * b * c ** 2 + 12 * a ** 2 * c ** 2 + 12 * a ** 2 * b * c + 6 * a ** 3 * c) /
    (6 * a ** 2 * b + (a + 2 * c) ** 3 - 24 * a * c ** 2)
  return { m, Cw }
}

export interface CFLengths { Lx: number; Ly: number; Lt: number; Lb: number }

export interface CFCapacity {
  /** 설계강도 kN, kN·m */
  phiPnc: number; phiPnt: number
  /** C5.2.2 Pno = Ae(Fy)·Fy 설계강도 */
  phiPno: number
  /** 강축: 압축 플랜지 구속(단면 강도)·비구속(횡비틀림) */
  phiMnxBraced: number; phiMnxLTB: number
  phiMny: number; phiVn: number
  /** 압축 오일러 (kN) — C5.2.2 α */
  PEx: number; PEy: number
  Se: number; Fc: number; Fn: number; Ae: number
  KLr: number
  notes: string[]
  applicable: boolean
  phiMnxt: number
  phiMnxo: number
  FdB: number; FdC: number
}

export function cfCapacity(name: string, sp: SectionProps, Fy: number, E: number, L: CFLengths, Cb: number): CFCapacity {
  const g = ccDims(name)
  const G = E / 2.6
  const { A, Ix, rx, ry, J, Sy } = sp
  const xc = (() => { /* 도심 ~ 웨브 중심선 거리 (중심선) */
    const b = g.B - g.t, c = g.C - g.t / 2, h = g.H - g.t
    return (2 * b * (b / 2) + 2 * c * b) / (h + 2 * b + 2 * c)
  })()
  const { m, Cw } = shearCenter(g, Ix)
  const x0 = xc + m
  const r0 = Math.sqrt(rx ** 2 + ry ** 2 + x0 ** 2)
  const sigEx = (Lx: number) => (Math.PI ** 2 * E) / (Lx / rx) ** 2
  const sigEy = (Ly: number) => (Math.PI ** 2 * E) / (Ly / ry) ** 2
  const sigT = (Lt: number) => (G * J + (Math.PI ** 2 * E * Cw) / Lt ** 2) / (A * r0 ** 2)
  const notes: string[] = []
  const applicable = Fy >= 165 && Fy <= 550 && g.t > 0 && g.t <= 25.4 && (g.B - 2 * g.t) / g.t <= 60 && (g.C - g.t) / g.t <= 60
    && (g.H - 2 * g.t) / g.t <= 200 && g.C / (g.B - 2 * g.t) <= 0.8
  if (!applicable) notes.push('TW CF 1.1 / 3.2 / 4.2 / 4.5 limits')

  /* 휨: 단면 강도 + 횡비틀림 (C3.1.2.1, 대칭축 휨) */
  const se = effSx(g, Fy, E)
  const Sf = Ix / (g.H / 2)
  const FeL = (Cb * r0 * A * Math.sqrt(sigEy(L.Lb) * sigT(L.Lb))) / Sf
  const Fc = FeL >= 2.78 * Fy ? Fy : FeL > 0.56 * Fy ? (10 / 9) * Fy * (1 - (10 * Fy) / (36 * FeL)) : FeL
  const Sc = effSx(g, Fc, E).Se
  // Even a laterally braced compression flange must satisfy 6.2.3.
  // Use full strong-axis length for distortion: a sag rod is not assumed to
  // prevent rotation of the flange-web junction.
  const FdB = distortionalTW(g, E, 'flexure', L.Lx).Fcrd
  const My = Sf * Fy, Mcrd = Sf * FdB, ld = Math.sqrt(My / Mcrd)
  const Mnd = ld <= 0.673 ? My : (1 - 0.22 * Math.sqrt(Mcrd / My)) * Math.sqrt(Mcrd / My) * My
  const phiMd = 0.9 * Mnd / 1e6
  const phiMnxBraced = Math.min((0.95 * se.Se * Fy) / 1e6, phiMd)
  const phiMnxLTB = Math.min(phiMnxBraced, (0.9 * Sc * Fc) / 1e6)
  if (phiMd <= phiMnxBraced) notes.push('CF-distortional')
  if (Fc < Fy) notes.push('CF-LTB')

  /* 압축 C4: 휨좌굴(y) · 휨비틀림(x–θ) */
  const sEx = sigEx(L.Lx), sEy = sigEy(L.Ly), sT = sigT(L.Lt)
  const beta = 1 - (x0 / r0) ** 2
  const FeTF = (1 / (2 * beta)) * (sEx + sT - Math.sqrt((sEx + sT) ** 2 - 4 * beta * sEx * sT))
  const Fe = Math.min(sEy, FeTF)
  const lc = Math.sqrt(Fy / Fe)
  const Fn = lc <= 1.5 ? 0.658 ** (lc ** 2) * Fy : (0.877 / lc ** 2) * Fy
  const Ae = effArea(g, Fn, E)
  const FdC = distortionalTW(g, E, 'compression', L.Lx).Fcrd
  const Py = A * Fy, Pcrd = A * FdC, ldc = Math.sqrt(Py / Pcrd)
  const Pnd = ldc <= 0.561 ? Py : (1 - 0.25 * (Pcrd / Py) ** 0.6) * (Pcrd / Py) ** 0.6 * Py
  /* 전단 C3.2.1 */
  const h = g.H - 2 * g.t, kv = 5.34
  const ht = h / g.t
  const Vn = ht <= Math.sqrt((E * kv) / Fy) ? 0.6 * Fy * h * g.t
    : ht <= 1.51 * Math.sqrt((E * kv) / Fy) ? 0.6 * g.t ** 2 * Math.sqrt(kv * Fy * E) : (0.904 * E * kv * g.t ** 3) / h
  return {
    phiPnc: (0.85 * Math.min(Ae * Fn, Pnd)) / 1e3, phiPnt: (0.95 * A * Fy) / 1e3, phiPno: (0.85 * Math.min(effArea(g, Fy, E) * Fy, Pnd)) / 1e3,
    phiMnxBraced, phiMnxLTB, phiMny: (0.9 * Sy * Fy) / 1e6, phiVn: (0.95 * Vn) / 1e3,
    PEx: (A * sEx) / 1e3, PEy: (A * sEy) / 1e3,
    Se: se.Se, Fc, Fn, Ae, KLr: Math.max(L.Lx / rx, L.Ly / ry), notes, applicable, phiMnxt: 0.9 * Sf * Fy / 1e6, phiMnxo: 0.95 * se.Se * Fy / 1e6, FdB, FdC,
  }
}

/** C5 조합 — P(kN, + 인장), Mx·My (kN·m 절댓값), V (kN). braced = 압축 플랜지가 외장재에 구속 */
export function cfCheck(cap: CFCapacity, f: { P: number; Mx: number; My: number; V: number }, braced: boolean) {
  const phiMx = braced ? cap.phiMnxBraced : cap.phiMnxLTB
  let pm: number, eq: `TW CF ${string}`
  if (f.P >= 0) {
    const a = f.P / cap.phiPnt + f.Mx / cap.phiMnxt + f.My / cap.phiMny
    const b = -f.P / cap.phiPnt + f.Mx / phiMx + f.My / cap.phiMny
    pm = Math.max(a, b); eq = a >= b ? 'TW CF 8.2-3' : 'TW CF 8.2-4'
  }
  else {
    const Pu = -f.P, pr = Pu / cap.phiPnc
    if (pr <= 0.15) { pm = pr + f.Mx / phiMx + f.My / cap.phiMny; eq = 'TW CF 8.3-10' }
    else {
      const ax = Math.max(1e-3, 1 - Pu / cap.PEx), ay = Math.max(1e-3, 1 - Pu / cap.PEy)
      const a = pr + f.Mx / (phiMx * ax) + f.My / (cap.phiMny * ay)
      const b = Pu / cap.phiPno + f.Mx / phiMx + f.My / cap.phiMny
      pm = Math.max(a, b); eq = a >= b ? 'TW CF 8.3-8' : 'TW CF 8.3-9'
    }
  }
  const shearInteraction = Math.hypot(f.Mx / cap.phiMnxo, f.V / cap.phiVn) // TW 6.4-3, section strength without lateral/distortional buckling
  return { ratio: Math.max(pm, shearInteraction), eq: pm >= shearInteraction ? eq : 'TW CF 6.4-3' as const }
}
