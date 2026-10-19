/* 한국 KDS 41 30 30 (2022) 냉간성형강 — 립 C형강 퍼린·거트 강도 (순수 함수, N·mm·MPa → kN·kN·m).
   KDS 41 30 30 = AISI S100-16 번역 (유효폭법). 유효폭·응력 경사 웨브·립 보강 플랜지(4.12)는 twColdFormed 와 같은 식 (μ 0.3 이면 1.052 상수 동일).
   - E 210,000·G 81,000 (KDS 41 30 10 표 3.4-1 — 41 30 30 에 값 없음)
   - 4.4 휨 φb 0.90: Mne = Sf·Fn ≤ My (4.4-1, Fcre = Cb·r0·A/Sf·√(σey·σt) 4.4-6), 국부 Mnℓ = Se(Fn)·Fn (4.4-33),
     단면형상변형 Mnd (4.4-44·45, Mcrd = Sf·Fcrd, Fcrd 4.13-32 — 표 4.13-1 립 C 플랜지 성질, k̃φwe 는 KB 누락으로 AISI S100-16 2.3.3.3-6)
   - 4.3 압축 φc 0.85: Pne (0.658/0.877, 휨·휨비틀림 4.3-8), Pnℓ = Ae(Fn)·Fn (4.3-14), Pnd (4.3-22~25, Fcrd 4.13-11 — 분모는 합: KB 전사 오류)
   - 4.2 인장 φt 0.90 총단면 항복 (순단면 파단 4.2-2 는 접합 구멍 — 퍼린 클리트 볼트 상세 범위 밖)
   - 4.5.2 전단 φv 0.95, kv 5.34 / 4.6.2 휨+전단 √((M/φMnℓo)² + (V/φVn)²) ≤ 1 (4.6-5)
   - 4.6.1 인장+휨 (4.6-1·4.6-2), 압축+휨 Pu/φPn + Mux/φMnx + Muy/φMny ≤ 1 (4.6-4, 선형 — S100-07 의 0.15 분기 없음), M = B1·M, B1 = 1/(1 − Pu/Pe1) (Cm 1.0)
   - 표 1.6-1 유효폭법 적용 한계: 립 보강 플랜지 b/t ≤ 60 (Is < Ia)·90, 립 d/t ≤ 60, 웨브 h/t < 200, d0/b0 ≤ 0.7, Fy < 552 → 벗어나면 메모 (1.2.2 합리적 해석 필요)
   보수적 단순화: 단면형상변형 β 1.0·kφ 0 (외장재 회전강성 미고려), Lm = 새그로드 간격. 약축 φMny = 0.90·Sy·Fy (유효폭 미적용, twColdFormed 와 같음). */
import type { SectionProps } from '../domain/sections'
import { ccDims, effArea, effSx, shearCenter, type CCDims, type CFLengths } from './twColdFormed'

export const E_CF = 210000, G_CF = 81000, MU_CF = 0.3

/** 표 4.13-1 립 C 플랜지(+립) 성질 — 중심선 b, d, 립 90° */
function flangeProps(g: CCDims) {
  const t = g.t, b = g.B - t, d = g.C - t / 2
  const s = b + d
  return {
    Af: s * t, Jf: (b * t ** 3) / 3 + (d * t ** 3) / 3,
    Ixf: (t * (t * t * b * b + 4 * b * d ** 3 + t * t * b * d + d ** 4)) / (12 * s),
    Iyf: (t * (b ** 4 + 4 * d * b ** 3)) / (12 * s),
    Ixyf: (t * b * b * d * d) / (4 * s),
    xof: (b * b) / (2 * s), hxf: -(b * b + 2 * d * b) / (2 * s), yof: -(d * d) / (2 * s),
  }
}

/** 단면형상변형 탄성좌굴응력 Fcrd (MPa) — mode 'flexure' (4.13-32, ξweb = 2 대칭 휨) / 'compression' (4.13-11). Lm = 구속점 간 거리 */
export function distortionalKR(g: CCDims, mode: 'flexure' | 'compression', Lm: number) {
  const f = flangeProps(g), t = g.t, h0 = g.H, E = E_CF, G = G_CF, mu = MU_CF
  const dx = f.xof - f.hxf // = b
  const core = f.Ixf * dx ** 2 - (f.Ixyf ** 2 / f.Iyf) * dx ** 2 // + Cwf (0)
  const Lcrd = mode === 'flexure'
    ? ((4 * Math.PI ** 4 * h0 * (1 - mu * mu)) / t ** 3 * core + (Math.PI ** 4 * h0 ** 4) / 720) ** 0.25
    : ((6 * Math.PI ** 4 * h0 * (1 - mu * mu)) / t ** 3 * core) ** 0.25
  const L = Math.min(Lcrd, Lm)
  const pL = Math.PI / L
  const kfe = pL ** 4 * E * core + pL ** 2 * G * f.Jf
  const ratio = f.Ixyf / f.Iyf
  const kfg = pL ** 2 * (f.Af * (dx ** 2 * ratio ** 2 - 2 * f.yof * dx * ratio + f.hxf ** 2 + f.yof ** 2) + f.Ixf + f.Iyf)
  let kwe: number, kwg: number
  if (mode === 'flexure') {
    kwe = ((E * t ** 3) / (12 * (1 - mu * mu))) * (3 / h0 + pL ** 2 * (19 * h0) / 60 + pL ** 4 * h0 ** 3 / 240)
    const xi = 2, Lh = L / h0
    kwg = ((h0 * t * Math.PI ** 2) / 13440) * (((45360 * (1 - xi) + 62160) * Lh ** 2 + 448 * Math.PI ** 2 + (1 / Lh) ** 2 * (53 + 3 * (1 - xi)) * Math.PI ** 4)
      / (Math.PI ** 4 + 28 * Math.PI ** 2 * Lh ** 2 + 420 * Lh ** 4))
  } else {
    kwe = (E * t ** 3) / (6 * h0 * (1 - mu * mu))
    kwg = pL ** 2 * (t * h0 ** 3) / 60
  }
  return { Fcrd: (kfe + kwe) / (kfg + kwg), Lcrd, L }
}

export interface KrCFCapacity {
  phiPnc: number; phiPnt: number
  /** 강축: 압축 플랜지 구속(외장재)·비구속(L_b 횡비틀림) — 둘 다 단면형상변형 포함 */
  phiMnxBraced: number; phiMnxLTB: number
  /** 4.6-5 φbMnℓo (Fn = Fy 국부좌굴), 4.6-1 φbMnxt = φb·Sft·Fy */
  phiMnlo: number; phiMnxt: number
  phiMny: number; phiVn: number
  PEx: number; PEy: number
  Fn: number; Fcrd: number; mode: 'yield' | 'LTB' | 'distortional' | 'local'
  KLr: number
  notes: string[]
  applicable: boolean
}

export function krCfCapacity(name: string, sp: SectionProps, Fy: number, L: CFLengths & { Lm: number }, Cb: number): KrCFCapacity {
  const g = ccDims(name), E = E_CF, G = G_CF
  const { A, Ix, rx, ry, J, Sy } = sp
  const notes: string[] = []
  const xc = (() => { const b = g.B - g.t, c = g.C - g.t / 2, h = g.H - g.t; return (2 * b * (b / 2) + 2 * c * b) / (h + 2 * b + 2 * c) })()
  const { m, Cw } = shearCenter(g, Ix)
  const x0 = xc + m, r0 = Math.sqrt(rx ** 2 + ry ** 2 + x0 ** 2)
  const sigEy = (Ly: number) => (Math.PI ** 2 * E) / (Ly / ry) ** 2
  const sigEx = (Lx: number) => (Math.PI ** 2 * E) / (Lx / rx) ** 2
  const sigT = (Lt: number) => (G * J + (Math.PI ** 2 * E * Cw) / Lt ** 2) / (A * r0 ** 2)

  /* 표 1.6-1 적용 한계 (유효폭법) */
  const wF = g.B - 2 * g.t, dL = g.C - g.t, wW = g.H - 2 * g.t
  const S = 1.28 * Math.sqrt(E / Fy), Ia = wF / g.t > 0.328 * S ? Math.min(399 * g.t ** 4 * ((wF / g.t) / S - 0.328) ** 3, g.t ** 4 * (115 * (wF / g.t) / S + 5)) : 0
  const Is = (dL ** 3 * g.t) / 12
  const applicable = !(wF / g.t > (Is >= Ia ? 90 : 60) || dL / g.t > 60 || wW / g.t >= 200 || g.C / g.B > 0.7 || Fy >= 552)
  if (!applicable) notes.push('KDS 41 30 30 table 1.6-1 limits')

  /* 휨 — 4.4.2 Mne, 4.4.3 Mnℓ, 4.4.4 Mnd */
  const Sf = Ix / (g.H / 2), My = Sf * Fy
  const Fcre = (Cb * r0 * A * Math.sqrt(sigEy(L.Lb) * sigT(L.Lb))) / Sf
  const Fn = Fcre >= 2.78 * Fy ? Fy : Fcre > 0.56 * Fy ? (10 / 9) * Fy * (1 - (10 * Fy) / (36 * Fcre)) : Fcre
  const Mne = Math.min(Sf * Fn, My), MneB = My
  const MnlB = Math.min(effSx(g, Fy, E).Se * Fy, MneB)
  const Mnl = Math.min(effSx(g, Fn, E).Se * Fn, Mne)
  const fd = distortionalKR(g, 'flexure', L.Lm)
  const Mcrd = Sf * fd.Fcrd, ld = Math.sqrt(My / Mcrd)
  const Mnd = ld <= 0.673 ? My : (1 - 0.22 * Math.sqrt(Mcrd / My)) * Math.sqrt(Mcrd / My) * My
  const phiMnxBraced = (0.9 * Math.min(MnlB, Mnd)) / 1e6
  const phiMnxLTB = (0.9 * Math.min(Mnl, Mnd)) / 1e6
  const mode: KrCFCapacity['mode'] = Mnd < Math.min(Mnl, MnlB) ? 'distortional' : Fn < Fy ? 'LTB' : MnlB < My ? 'local' : 'yield'

  /* 압축 — 4.3.2 Pne, 4.3.3 Pnℓ, 4.3.4 Pnd */
  const sEx = sigEx(L.Lx), sEy = sigEy(L.Ly), sT = sigT(L.Lt)
  const beta = 1 - (x0 / r0) ** 2
  const FeTF = (1 / (2 * beta)) * (sEx + sT - Math.sqrt((sEx + sT) ** 2 - 4 * beta * sEx * sT))
  const lc = Math.sqrt(Fy / Math.min(sEy, FeTF))
  const Fnc = lc <= 1.5 ? 0.658 ** (lc ** 2) * Fy : (0.877 / lc ** 2) * Fy
  const Pnl = effArea(g, Fnc, E) * Fnc
  const Py = A * Fy, Pcrd = A * distortionalKR(g, 'compression', L.Lm).Fcrd, ldc = Math.sqrt(Py / Pcrd)
  const Pnd = ldc <= 0.561 ? Py : (1 - 0.25 * (Pcrd / Py) ** 0.6) * (Pcrd / Py) ** 0.6 * Py

  /* 전단 4.5.2.1 (μ 0.3 → h/t 경계 √(E·kv/Fy)·1.51 √) */
  const kv = 5.34, ht = wW / g.t
  const Vn = ht <= Math.sqrt((E * kv) / Fy) ? 0.6 * Fy * wW * g.t
    : ht <= 1.51 * Math.sqrt((E * kv) / Fy) ? 0.6 * g.t ** 2 * Math.sqrt(kv * Fy * E) : (0.904 * E * kv * g.t ** 3) / wW
  return {
    phiPnc: (0.85 * Math.min(Fnc * A, Pnl, Pnd)) / 1e3, phiPnt: (0.9 * A * Fy) / 1e3,
    phiMnxBraced, phiMnxLTB, phiMnlo: (0.9 * MnlB) / 1e6, phiMnxt: (0.9 * Sf * Fy) / 1e6,
    phiMny: (0.9 * Sy * Fy) / 1e6, phiVn: (0.95 * Vn) / 1e3,
    PEx: (A * sEx) / 1e3, PEy: (A * sEy) / 1e3,
    Fn, Fcrd: fd.Fcrd, mode, KLr: Math.max(L.Lx / rx, L.Ly / ry), notes, applicable,
  }
}

/** 4.6 조합 — P(kN, + 인장), Mx·My (kN·m 절댓값), V (kN). braced = 압축 플랜지가 외장재에 구속 */
export function krCfCheck(cap: KrCFCapacity, f: { P: number; Mx: number; My: number; V: number }, braced: boolean) {
  const phiMx = braced ? cap.phiMnxBraced : cap.phiMnxLTB
  let pm: number, eq: 'KDS 4.6-1' | 'KDS 4.6-2' | 'KDS 4.6-4' | 'KDS 4.6-5'
  if (f.P >= 0) {
    const a = f.Mx / cap.phiMnxt + f.My / cap.phiMny + f.P / cap.phiPnt // 4.6-1 (인장 연단)
    const b = f.Mx / phiMx + f.My / cap.phiMny - f.P / cap.phiPnt // 4.6-2
    pm = Math.max(a, b); eq = a >= b ? 'KDS 4.6-1' : 'KDS 4.6-2'
  } else {
    const Pu = -f.P
    const ax = Math.max(1e-3, 1 - Pu / cap.PEx), ay = Math.max(1e-3, 1 - Pu / cap.PEy) // B1 = 1/α (Cm 1.0)
    pm = Pu / cap.phiPnc + f.Mx / (phiMx * ax) + f.My / (cap.phiMny * ay); eq = 'KDS 4.6-4'
  }
  const mv = Math.sqrt((f.Mx / cap.phiMnlo) ** 2 + (f.V / cap.phiVn) ** 2) // 4.6-5
  return mv > pm ? { ratio: mv, eq: 'KDS 4.6-5' as const } : { ratio: pm, eq }
}
