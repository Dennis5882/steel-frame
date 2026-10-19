/* 한국 KDS 14 31 10 (2024, 하중저항계수설계법) 부재 강도 — KDS 41 30 10 4장이 이 기준을 따른다. 순수 함수, 단위 N·mm·MPa → kN·kN·m.
   원문 KB: COde/KR/knowledge/kds-14-31-10/04-설계.md, kds-14-31-15/04-설계.md
   - 4.1.3 인장 φt 0.90 Pn = Fy·Ag (총단면 항복). 유효순단면 파단(0.75·Fu·Ae)은 접합 상세가 정해지는 접합부 검토(2단계)에서
   - 4.2.3 휨좌굴 Fcr = 0.658^(Fy/Fe)·Fy (Fy/Fe ≤ 2.25) / 0.877Fe, 4.2.4 (4.2-8) 2축대칭 비틀림좌굴, φc 0.90
   - 4.2.7 세장판 압축재 유효폭 (4.2-19~22, 표 4.2-4 c1·c2), 원형강관 (4.2-23·24)
   - 4.3.2.1.1.2/.3/.4 강축 휨 H형강 (조밀 웨브: 항복·LTB·FLB / 비조밀 웨브: Rpc·rt), .6 약축, .8 원형강관, φb 0.90, Cb (4.3-1)
   - 4.3.2.1.2.2 전단 Vn = 0.6Fy·Aw·Cv (압연 H h/tw ≤ 2.24√(E/Fy) → φv 1.0), .6 원형강관
   - 4.4.1 조합 (4.4-1)·(4.4-2) — 인장 + 휨도 같은 식 (4.4.1.2)
   - KDS 14 31 15 4.3 유효길이법: 4.3-2 횡이동 골조 K, 4.5.2.1 B1 (Cm = 1.0 보수적), 4.5.2.2 B2 (R_M) — 적용 조건 B2 ≤ 1.5 (4.3.1)
   미구현(표시): 웨브 세장 H(4.3.2.1.1.5) — 후보 단면에 없음, 만나면 NG 처리 */
import type { SectionProps } from '../domain/sections'

export const E_KR = 210000, G_KR = 81000 // KDS 41 30 10 표 3.4-1 (MPa)

export interface KrLengths { KLx: number; KLy: number; Lb: number }
export interface KrForces { P: number; Mx: number; My: number; V: number }
export type KrMode = 'Mp' | 'LTB-inelastic' | 'LTB-elastic' | 'FLB' | 'WLB' | 'elastic'
export interface KrCapacity {
  phiPnc: number; phiPnt: number; phiMnx: number; phiMny: number; phiVn: number
  mxMode: KrMode
  /** 휨 기준 판 분류 (표 4.3-2) — 'slender' 는 플랜지·웨브 세장 */
  compact: 'compact' | 'noncompact' | 'slender'
  KLr: number
  /** 표시용 λc = (KL/r)/π·√(Fy/E) */
  lambdaC: number
  /** 압축 유효면적 비 Ae/Ag (4.2.7) */
  aeRatio: number
  notes: string[]
}
export interface KrCheckResult { ratio: number; eq: 'KDS 4.4-1' | 'KDS 4.4-2' | 'KDS 4.3.2.1.2' | 'KDS 4.1.3' | 'KDS 4.2'; pmRatio: number; vRatio: number }

/** (4.3-1) Cb = 12.5Mmax/(2.5Mmax + 3MA + 4MB + 3MC) — 4분점 모멘트 절댓값, 상한 3.0 */
export function cbKR(m: number[]): number {
  if (m.length !== 5) return 1
  const a = m.map(Math.abs), mmax = Math.max(...a)
  if (mmax < 1e-9) return 1
  return Math.min(3.0, 12.5 * mmax / (2.5 * mmax + 3 * a[1] + 4 * a[2] + 3 * a[3]))
}

/** (4.2-2)·(4.2-3) */
const fcrOf = (Fy: number, Fe: number) => (Fy / Fe <= 2.25 ? 0.658 ** (Fy / Fe) * Fy : 0.877 * Fe)

/** (4.2-20) 세장판 유효폭 */
function effWidth(b: number, lam: number, lamR: number, Fy: number, Fcr: number, c1: number): number {
  if (lam <= lamR * Math.sqrt(Fy / Fcr)) return b
  const c2 = (1 - Math.sqrt(1 - 4 * c1)) / (2 * c1) // (4.2-21)
  const Fel = (c2 * lamR / lam) ** 2 * Fy // (4.2-22)
  const r = Math.sqrt(Fel / Fcr)
  return Math.min(b, b * (1 - c1 * r) * r)
}

/** 부재 설계강도 — Fy(판두께별, MPa), L(mm), Cb */
export function krCapacity(sp: SectionProps, Fy: number, L: KrLengths, Cb: number): KrCapacity {
  const E = E_KR, G = G_KR, notes: string[] = []
  const rt = Math.sqrt(E / Fy)
  const KLr = Math.max(L.KLx / sp.rx, L.KLy / sp.ry)
  const lambdaC = KLr / Math.PI / rt
  const kN = (N: number) => N / 1000, kNm = (Nmm: number) => Nmm / 1e6
  let Fe = Math.PI ** 2 * E / KLr ** 2 // (4.2-4)

  if (sp.kind === 'P') {
    const Dt = sp.d / sp.tw
    if (Dt >= 0.45 * E / Fy) notes.push('D/t ≥ 0.45E/Fy (4.3.2.1.1.8 범위 밖)')
    const Fcr = fcrOf(Fy, Fe)
    const Ae = Dt <= 0.11 * E / Fy ? sp.A : (0.038 * E / (Fy * Dt) + 2 / 3) * sp.A // (4.2-23·24)
    /* 4.3.2.1.1.8 — 조밀 Mp = Fy·Z / 비조밀 (0.021E/(D/t) + Fy)S / 세장 0.33E/(D/t)·S */
    const lp = 0.07 * E / Fy, lr = 0.31 * E / Fy
    const Mn = Dt <= lp ? Fy * sp.Zx : Dt <= lr ? (0.021 * E / Dt + Fy) * sp.Sx : 0.33 * E / Dt * sp.Sx
    const compact: KrCapacity['compact'] = Dt <= lp ? 'compact' : Dt <= lr ? 'noncompact' : 'slender'
    /* 4.3.2.1.2.6 — Fcr = max(1.60E/(√(Lv/D)(D/t)^1.25), 0.78E/(D/t)^1.5) ≤ 0.6Fy, Lv = 부재 길이/2 (보수적 가정) */
    const Lv = Math.max(L.Lb / 2, sp.d)
    const Fv = Math.min(0.6 * Fy, Math.max(1.6 * E / (Math.sqrt(Lv / sp.d) * Dt ** 1.25), 0.78 * E / Dt ** 1.5))
    return { phiPnc: kN(0.9 * Fcr * Ae), phiPnt: kN(0.9 * Fy * sp.A), phiMnx: kNm(0.9 * Mn), phiMny: kNm(0.9 * Mn), phiVn: kN(0.9 * Fv * sp.A / 2),
      mxMode: compact === 'compact' ? 'Mp' : 'elastic', compact, KLr, lambdaC, aeRatio: Ae / sp.A, notes }
  }
  if (sp.kind !== 'H') throw new Error(`KDS 14 31 10: unsupported section ${sp.name}`)

  /* ── H형강 (압연 H·용접 경량 LH) ── */
  const { d, bf, tw, tf, h } = sp
  const ho = d - tf
  const kc = Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(h / tw)))
  /* 4.2.4 (4.2-8) 2축대칭 비틀림좌굴 — L_cz = 면외 비지지길이(거트·퍼린 + 플라이브레이스) */
  const Lcz = L.KLy
  const FeT = (Math.PI ** 2 * E * sp.Cw / Lcz ** 2 + G * sp.J) / (sp.Ix + sp.Iy)
  if (FeT < Fe) { Fe = FeT; notes.push('4.2.4 torsional') }
  const Fcr = fcrOf(Fy, Fe)
  /* 4.2.7 세장판 — 표 4.2-2 λr: 플랜지(압연 0.56√(E/Fy) / 용접 0.64√(kcE/Fy)), 웨브 1.49√(E/Fy) */
  const bt = bf / 2 / tf, htw = h / tw
  const lrFc = sp.rolled ? 0.56 * rt : 0.64 * Math.sqrt(kc * E / Fy), lrWc = 1.49 * rt
  const beF = effWidth(bf / 2, bt, lrFc, Fy, Fcr, 0.22), heW = effWidth(h, htw, lrWc, Fy, Fcr, 0.18)
  const Ae = sp.A - 4 * (bf / 2 - beF) * tf - (h - heW) * tw
  if (Ae < sp.A - 1e-6) notes.push(`4.2.7 Ae/Ag ${(Ae / sp.A).toFixed(3)}`)
  const phiPnc = 0.9 * Fcr * Ae

  /* 표 4.3-2 휨 폭두께비 — 플랜지 λp 0.38√(E/Fy), λr 압연 1.0√(E/Fy) / 용접 0.95√(kcE/FL), FL = 0.7Fy. 웨브 3.76 / 5.70 √(E/Fy) */
  const FL = 0.7 * Fy
  const lpf = 0.38 * rt, lrf = sp.rolled ? 1.0 * rt : 0.95 * Math.sqrt(kc * E / FL)
  const lpw = 3.76 * rt, lrw = 5.70 * rt
  const Mp = Math.min(Fy * sp.Zx, 1.6 * Fy * sp.Sx)
  let compact: KrCapacity['compact'] = bt <= lpf && htw <= lpw ? 'compact' : bt <= lrf && htw <= lrw ? 'noncompact' : 'slender'
  let MnLTB: number, ltbMode: KrMode, MnFLB = Infinity
  const Lb = L.Lb
  if (htw <= lpw) {
    /* 4.3.2.1.1.2 / .3 — 조밀 웨브 */
    const rts = Math.sqrt(Math.sqrt(sp.Iy * sp.Cw) / sp.Sx) // (4.3-8)
    const Jc = sp.J / (sp.Sx * ho) // c = 1
    const Lp = 1.76 * sp.ry * rt // (4.3-6)
    const Lr = 1.95 * rts * E / FL * Math.sqrt(Jc) * Math.sqrt(1 + Math.sqrt(1 + 6.76 * (FL / E / Jc) ** 2)) // (4.3-7)
    if (Lb <= Lp) { MnLTB = Mp; ltbMode = 'Mp' }
    else if (Lb <= Lr) { MnLTB = Math.min(Mp, Cb * (Mp - (Mp - FL * sp.Sx) * (Lb - Lp) / (Lr - Lp))); ltbMode = 'LTB-inelastic' } // (4.3-3)
    else {
      const FcrL = Cb * Math.PI ** 2 * E / (Lb / rts) ** 2 * Math.sqrt(1 + 0.078 * Jc * (Lb / rts) ** 2) // (4.3-5)
      MnLTB = Math.min(Mp, FcrL * sp.Sx); ltbMode = 'LTB-elastic'
    }
    if (bt > lpf) MnFLB = bt <= lrf ? Mp - (Mp - FL * sp.Sx) * (bt - lpf) / (lrf - lpf) : 0.9 * E * kc * sp.Sx / bt ** 2 // (4.3-9)·(4.3-10)
  } else {
    /* 4.3.2.1.1.4 — 비조밀 웨브, 2축대칭 (Sxc = Sxt, Iyc/Iy = 0.5 > 0.23, hc = h). 웨브 세장(.5)은 미구현 → NG */
    if (htw > lrw) { notes.push('web slender (4.3.2.1.1.5 미구현)'); compact = 'slender' }
    const Myc = Fy * sp.Sx
    const Rpc = htw > lrw ? 0 : Math.min(Mp / Myc, Mp / Myc - (Mp / Myc - 1) * (htw - lpw) / (lrw - lpw)) // (4.3-19b)
    const aw = h * tw / (bf * tf) // (4.3-21)
    const rtt = bf / Math.sqrt(12 * (ho / d + aw * h ** 2 / (6 * ho * d))) // (4.3-20)
    const Lp = 1.1 * rtt * rt // (4.3-17)
    const Jx = sp.J / (sp.Sx * ho)
    const Lr = 1.95 * rtt * E / FL * Math.sqrt(Jx) * Math.sqrt(1 + Math.sqrt(1 + 6.76 * (FL / E / Jx) ** 2)) // (4.3-18)
    if (Lb <= Lp) { MnLTB = Rpc * Myc; ltbMode = 'Mp' }
    else if (Lb <= Lr) { MnLTB = Math.min(Rpc * Myc, Cb * (Rpc * Myc - (Rpc * Myc - FL * sp.Sx) * (Lb - Lp) / (Lr - Lp))); ltbMode = 'LTB-inelastic' } // (4.3-12)
    else { MnLTB = Math.min(Rpc * Myc, Cb * Math.PI ** 2 * E / (Lb / rtt) ** 2 * Math.sqrt(1 + 0.078 * Jx * (Lb / rtt) ** 2) * sp.Sx); ltbMode = 'LTB-elastic' } // (4.3-13·15)
    MnFLB = Rpc * Myc
    if (bt > lpf) MnFLB = bt <= lrf ? Rpc * Myc - (Rpc * Myc - FL * sp.Sx) * (bt - lpf) / (lrf - lpf) : 0.9 * E * kc * sp.Sx / bt ** 2 // (4.3-23·24)
  }
  const Mnx = Math.min(MnLTB, MnFLB)
  const mxMode: KrMode = Mnx === MnLTB ? ltbMode : htw > lpw && bt <= lpf ? 'WLB' : 'FLB'
  /* 4.3.2.1.1.6 약축 — Mp = min(Fy·Zy, 1.6Fy·Sy), λ = b/t (플랜지 반폭) */
  const Mpy = Math.min(Fy * sp.Zy, 1.6 * Fy * sp.Sy)
  const lrfy = 1.0 * rt
  const Mny = bt <= lpf ? Mpy : bt <= lrfy ? Mpy - (Mpy - 0.7 * Fy * sp.Sy) * (bt - lpf) / (lrfy - lpf) : 0.69 * E / bt ** 2 * sp.Sy // (4.3-38~40)
  /* 4.3.2.1.2.2 전단 — Aw = d·tw, kv = 5 (무보강). 압연 H h/tw ≤ 2.24√(E/Fy): φv 1.0, Cv 1.0 */
  const Aw = d * tw
  let phiV = 0.9, Cv: number
  const kv = 5, s = Math.sqrt(kv * E / Fy)
  if (sp.rolled && htw <= 2.24 * rt) { phiV = 1.0; Cv = 1 }
  else Cv = htw <= 1.10 * s ? 1 : htw <= 1.37 * s ? 1.10 * s / htw : 1.51 * E * kv / (htw ** 2 * Fy) // (4.3-86~88)
  return {
    phiPnc: kN(phiPnc), phiPnt: kN(0.9 * Fy * sp.A), phiMnx: kNm(0.9 * Mnx), phiMny: kNm(0.9 * Mny), phiVn: kN(phiV * 0.6 * Fy * Aw * Cv),
    mxMode, compact, KLr, lambdaC, aeRatio: Ae / sp.A, notes,
  }
}

/** (4.4-1)·(4.4-2) + 전단. B = 휨 증폭 (max(B1, B2)) */
export function krCheck(cap: KrCapacity, f: KrForces, B = 1): KrCheckResult {
  const tension = f.P >= 0
  const pr = Math.abs(f.P) / (tension ? cap.phiPnt : cap.phiPnc)
  const mr = B * f.Mx / cap.phiMnx + B * f.My / cap.phiMny
  const pm = pr >= 0.2 ? pr + 8 / 9 * mr : pr / 2 + mr
  const vr = f.V / cap.phiVn
  const eq: KrCheckResult['eq'] = vr > pm ? 'KDS 4.3.2.1.2' : f.Mx + f.My < 1e-9 ? (tension ? 'KDS 4.1.3' : 'KDS 4.2') : pr >= 0.2 ? 'KDS 4.4-1' : 'KDS 4.4-2'
  return { ratio: Math.max(pm, vr), eq, pmRatio: pm, vRatio: vr }
}

/** 14 31 15 (4.5-3) B1 = Cm/(1 − Pu/Pe1) ≥ 1, Cm = 1.0 (지지점 사이 횡하중 — 보수적), Pe1 = π²EI/(K1L)², K1 ≤ 1 → L */
export function krB1(PuComp_kN: number, I: number, Lmm: number): number {
  if (PuComp_kN <= 0) return 1
  const Pe1 = Math.PI ** 2 * E_KR * I / Lmm ** 2 / 1000
  return PuComp_kN >= Pe1 ? 99 : Math.max(1, 1 / (1 - PuComp_kN / Pe1))
}

/** 14 31 15 (4.5-6·7) B2 = 1/(1 − P_story/P_e,story), P_e,story = R_M·H·L/Δ_H, R_M = 1 − 0.15·P_mf/P_story (모멘트골조 0.85, 가새골조 1.0) */
export function krB2(Pstory: number, drift: number, H: number, L: number, RM: number): number {
  if (H < 1e-6 || drift <= 0) return 1
  const x = Pstory * drift / (RM * H * L)
  return x >= 1 ? 99 : 1 / (1 - x)
}

/** 14 31 15 (4.3-2) 횡이동 골조 유효길이계수 — (GaGb(π/K)² − 36)/(6(Ga+Gb)) = (π/K)/tan(π/K) */
export function krKSway(Ga: number, Gb: number): number {
  const f = (K: number) => { const u = Math.PI / K; return (Ga * Gb * u * u - 36) / (6 * (Ga + Gb)) - u / Math.tan(u) }
  let lo = 1.0001, hi = 50
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid }
  return (lo + hi) / 2
}

/** 4.1.1 인장재 L/r 300 (가급적), 4.2.2 압축재 KL/r 200 (가급적) */
export const SLENDER_KR = { compression: 200, tension: 300 }
/** KDS 14 31 60 표 3.2-1 재료초과강도계수 Ry — SS275·SM275·SM355 1.2, SN·SHN 1.1 */
export const ryKR = (material: string) => (/^SN|^SHN/.test(material) ? 1.1 : 1.2)
