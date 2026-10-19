/* 대만 鋼構造建築物鋼結構設計技術規範 LRFD — 부재 강도 검토 (순수 함수).
   원문 KB: COde/TW/knowledge/steel-design-technical-code/LRFD-0{4,5,6,7,8}*.md. 식은 원문 단위(tf, cm, tf/cm²)로 계산.
   - 4.5 표4.5-1 폭두께비 (λp·λr), 4.4 세장비(압축 200·인장 300)
   - 5 인장 φt = 0.9, Pn = Fy·Ag (총단면 항복 — 볼트 구멍 순단면 파단은 접합부 검토에서)
   - 6.2 압축 φc = 0.85, λc = KL/(πr)·√(Fy/E), Fcr = exp(−0.419λc²)Fy (λc ≤ 1.5) / 0.877Fy/λc²
   - 7.2 휨 φb = 0.90: Lp = 80ry/√Fyf, Lr (7.2-4), Mr = FL·Sx, (7.2-1) 비탄성 LTB, (7.2-11) 탄성 LTB, Cb (해설 AISC 1999 4분점 식)
   - 7.3 전단 φv = 0.90, kv = 5 (무보강), (7.3-1~3)
   - 8.2 조합 (8.2-1a/b), Mu = B·M (B = max(B1, B2), 아래 단순화)
   단순화(표시): 비조밀(λp<λ≤λr) 플랜지·웨브 국부좌굴은 Mp→Mr 직선 보간(AISC-LRFD 부록 F 형식, 원문 본문에 식 없음),
   압축 세장 판요소는 부록1 Qs·Qa를 적용하며, 미지원 세장 H형강 휨은 sectionRange로 차단한다.
   립 C형강의 실제 검토 경로는 twColdFormed.ts이며 이 파일의 CC 탄성 분기는 구형 호출 호환용이다. */
import type { SectionProps } from '../domain/sections'

const KN_TF = 1 / 9.80665 // kN → tf
const MPA_TFCM2 = 1 / 98.0665 // MPa → tf/cm² (정확값)

export interface MemberLengths {
  /** 유효좌굴길이 KL (mm) — x = 강축 휨 평면(강축 좌굴), y = 약축 */
  KLx: number
  KLy: number
  /** 횡비틀림 비지지길이 Lb (mm) */
  Lb: number
}

export interface MemberForces {
  /** 축력 kN (+ 인장, − 압축) */
  P: number
  /** 강축·약축 휨모멘트 kN·m (절댓값) */
  Mx: number
  My: number
  /** 강축 방향 전단 kN */
  V: number
}

export interface Capacity {
  /** 설계강도 (kN, kN·m) */
  phiPnc: number
  phiPnt: number
  phiMnx: number
  phiMny: number
  phiVn: number
  /** 지배 휨 한계상태 */
  /** CF·CF-LTB = 냉간성형 단면 강도·횡비틀림 (twColdFormed) */
  mxMode: 'Mp' | 'LTB-inelastic' | 'LTB-elastic' | 'FLB' | 'WLB' | 'elastic' | 'CF' | 'CF-LTB' | 'CF-distortional' | 'CF-local' | 'CF-yield'
  lambdaC: number
  KLr: number
  compact: 'compact' | 'noncompact' | 'slender'
  notes: string[]
}

export interface CheckResult {
  ratio: number
  /** 지배 식 */
  eq: '8.2-1a' | '8.2-1b' | '7.3' | '5' | '6.2'
  pmRatio: number
  vRatio: number
}

/** (7.2 해설) Cb = 12.5Mmax / (2.5Mmax + 3MA + 4MB + 3MC) — 비지지 구간 4분점 모멘트 절댓값 */
export function cbOf(m: number[]): number {
  if (m.length !== 5) return 1
  const a = m.map(Math.abs)
  const mmax = Math.max(...a)
  if (mmax < 1e-9) return 1
  return Math.min(3.0, (12.5 * mmax) / (2.5 * mmax + 3 * a[1] + 4 * a[2] + 3 * a[3]))
}

/** 압축재 강도 (6.2) — tf, cm */
function compression(Ag: number, Fy: number, E: number, KLr: number, Q = 1) {
  const lc = (KLr / Math.PI) * Math.sqrt(Fy / E)
  const Fcr = lc * Math.sqrt(Q) <= 1.5 ? Q * Math.exp(-0.419 * Q * lc ** 2) * Fy : (0.877 / lc ** 2) * Fy
  return { lc, phiPn: 0.85 * Ag * Fcr }
}

/** LRFD appendix 1, A-1-3/4/8/9/11/12. Fy,E in tf/cm2.
 * Gross area and radii retained. H web stress follows appendix 1(2):
 * min(phi_c Fcr with Q=Qs, phi_b Fy Qs); no unverified stress iteration.
 */
export function compressionQ(sp: SectionProps, Fy: number, E: number, KLr: number) {
  if (sp.kind === 'P') return { Qs: 1, Qa: sp.d / sp.tw <= 232 / Fy ? 1 : Math.min(1, 77 / (Fy * sp.d / sp.tw) + 2 / 3), applicable: sp.d / sp.tw < 914 / Fy }
  if (sp.kind !== 'H') return { Qs: 1, Qa: 1, applicable: true }
  const bt = sp.bf / (2 * sp.tf), ht = sp.h / sp.tw
  const kc = Math.max(.35, Math.min(.763, 4 / Math.sqrt(ht)))
  const x = bt * Math.sqrt(Fy / kc)
  const flangeLimit = sp.rolled ? 25 / Math.sqrt(Fy) : 20 / Math.sqrt(Fy - 1.16)
  const Qs = bt <= flangeLimit ? 1 : Math.min(1, Math.max(0, x <= 30 ? 1 : x < 53 ? 1.415 - .0143 * x : 1840 / x ** 2))
  const phiFcr = compression(sp.A / 100, Fy, E, KLr, Qs).phiPn / (sp.A / 100)
  const f = Math.min(phiFcr, .9 * Fy * Qs)
  const be = ht < 68 / Math.sqrt(f) ? sp.h : Math.min(sp.h, 87 * sp.tw / Math.sqrt(f) * (1 - 15 / (ht * Math.sqrt(f))))
  return { Qs, Qa: Math.max(0, 1 - (sp.h - be) * sp.tw / sp.A), applicable: true }
}

/** 부재 설계강도 — sp: 단면(mm), FyMPa·EMPa, L: 길이(mm), Pu·Cb 는 웨브 λp 와 LTB 에 사용 */
export function capacity(sp: SectionProps, FyMPa: number, EMPa: number, L: MemberLengths, Cb: number, PuComp_kN: number): Capacity {
  const notes: string[] = []
  const Fy = FyMPa * MPA_TFCM2, E = EMPa * MPA_TFCM2, G = E / 2.6
  /* cm 단위 성질 */
  const A = sp.A / 100, Iy = sp.Iy / 1e4, Sx = sp.Sx / 1e3, Sy = sp.Sy / 1e3, Zx = sp.Zx / 1e3, Zy = sp.Zy / 1e3
  const rx = sp.rx / 10, ry = sp.ry / 10, J = sp.J / 1e4, Cw = sp.Cw / 1e6
  const KLr = Math.max(L.KLx / 10 / rx, L.KLy / 10 / ry)
  const q = compressionQ(sp, Fy, E, KLr)
  const { lc, phiPn } = compression(A, Fy, E, KLr, q.Qs * q.Qa)
  if (q.Qs * q.Qa < 1) notes.push(`LRFD A-1: Qs=${q.Qs.toFixed(4)}, Qa=${q.Qa.toFixed(4)}`)
  if (!q.applicable) notes.push('TW applicability: LRFD A-1 D/t >= 914/Fy')
  const phiPnt = 0.9 * A * Fy
  const toKN = (tf: number) => tf / KN_TF
  const toKNm = (tfcm: number) => tfcm / KN_TF / 100

  if (sp.kind === 'P') {
    /* 원형강관 — 표4.5-1: 축압 λr = 232/Fy, 휨 λp = 145/Fy (D/t, Fy tf/cm²) */
    const Dt = sp.d / sp.tw
    let compact: Capacity['compact'] = 'compact'
    if (Dt > 232 / Fy) { compact = 'slender'; notes.push('D/t > 232/Fy (附錄1)') }
    else if (Dt > 145 / Fy) compact = 'noncompact'
    const Mp = Fy * Zx, My = Fy * Sx
    const Mn = compact === 'compact' ? Mp : My
    const Aw = A / 2
    return { phiPnc: toKN(phiPn), phiPnt: toKN(phiPnt), phiMnx: toKNm(0.9 * Mn), phiMny: toKNm(0.9 * Mn), phiVn: toKN(0.9 * 0.6 * Fy * Aw),
      mxMode: compact === 'compact' ? 'Mp' : 'elastic', lambdaC: lc, KLr, compact, notes }
  }

  const Fr = sp.rolled ? 0.7 : 1.16 // 표4.5-1 주 [b]
  const FL = Fy - Fr // (7.2-4) F_L = min(Fyf − Fr, Fyw), 단일 강종
  const Py = A * Fy
  const ratioP = Math.max(0, PuComp_kN) * KN_TF / (0.9 * Py)

  if (sp.kind === 'CC') {
    /* 냉간성형 립 C형강 — 탄성 단면, LTB 는 7.2 식(무립 Cw 근사). 冷軋型鋼 규범의 유효폭은 미고려 → 참고 값 */
    notes.push('冷軋型鋼: 7.2 approx. (no effective width)')
    const Mr = Fy * Sx
    const Lb = L.Lb / 10
    const Mcr = Cb * (Math.PI / Lb) * Math.sqrt(E * Iy * G * J + (Math.PI * E / Lb) ** 2 * Iy * Cw)
    const Mnx = Math.min(Mr, Mcr)
    const Aw = (sp.d / 10) * (sp.tw / 10)
    return { phiPnc: toKN(phiPn), phiPnt: toKN(phiPnt), phiMnx: toKNm(0.9 * Mnx), phiMny: toKNm(0.9 * Fy * Sy), phiVn: toKN(0.9 * 0.6 * Fy * Aw),
      mxMode: Mcr < Mr ? 'LTB-elastic' : 'elastic', lambdaC: lc, KLr, compact: 'slender', notes }
  }

  /* ── H형강 ── */
  const bt = sp.bf / 2 / sp.tf, htw = sp.h / sp.tw
  const sq = Math.sqrt(Fy)
  /* 표4.5-1 — 휨 플랜지: λp 17/√Fy, λr 37/√(Fy−Fr)(압연) · 28/√(Fyw−Fr)(용접) */
  const fP = 17 / sq, fR = (sp.rolled ? 37 : 28) / Math.sqrt(Fy - Fr)
  /* 휨+압축 웨브 λp, λr = 260/√Fy */
  const wP = ratioP <= 0.125 ? (170 / sq) * (1 - 2.75 * ratioP) : Math.max((51 / sq) * (2.33 - ratioP), 68 / sq)
  const wR = 260 / sq
  /* 순압축 세장 판정 — 플랜지 25/√Fy(압연)·20/√(Fy−Fr)(용접), 웨브 68/√Fy */
  const cfR = sp.rolled ? 25 / sq : 20 / Math.sqrt(Fy - Fr)
  if (PuComp_kN > 0 && (bt > cfR || htw > 68 / sq)) notes.push('LRFD A-1 compression Q applied')

  const Mp = Fy * Zx, Mr = FL * Sx
  /* 횡비틀림 (7.2.2·7.2.3) */
  const Lp = (80 * ry) / sq
  const X1 = (Math.PI / Sx) * Math.sqrt((E * G * J * A) / 2)
  const X2 = 4 * (Cw / Iy) * (Sx / (G * J)) ** 2
  const Lr = ((ry * X1) / FL) * Math.sqrt(1 + Math.sqrt(1 + X2 * FL ** 2))
  const Lb = L.Lb / 10
  let MnLTB: number, ltbMode: Capacity['mxMode']
  if (Lb <= Lp) { MnLTB = Mp; ltbMode = 'Mp' }
  else if (Lb <= Lr) { MnLTB = Math.min(Mp, Cb * (Mp - (Mp - Mr) * ((Lb - Lp) / (Lr - Lp)))); ltbMode = 'LTB-inelastic' }
  else { MnLTB = Math.min(Mp, Cb * (Math.PI / Lb) * Math.sqrt(E * Iy * G * J + ((Math.PI * E) / Lb) ** 2 * Iy * Cw)); ltbMode = 'LTB-elastic' }
  /* 국부좌굴 — 비조밀은 직선 보간(단순화), 세장은 경고 후 Mr */
  let compact: Capacity['compact'] = 'compact'
  let MnFLB = Mp, MnWLB = Mp
  if (bt > fP) {
    compact = bt > fR ? 'slender' : 'noncompact'
    MnFLB = bt > fR ? Mr : Mp - (Mp - Mr) * ((bt - fP) / (fR - fP))
    if (bt > fR) notes.push('TW applicability: LRFD appendix 3 slender flange flexure')
  }
  if (htw > wP) {
    if (htw > wR) { compact = 'slender'; notes.push('TW applicability: LRFD appendix 3 slender web flexure') } else if (compact === 'compact') compact = 'noncompact'
    MnWLB = htw > wR ? Fy * Sx : Mp - (Mp - Fy * Sx) * ((htw - wP) / (wR - wP))
  }
  const Mnx = Math.min(MnLTB, MnFLB, MnWLB)
  const mxMode: Capacity['mxMode'] = Mnx === MnLTB ? ltbMode : Mnx === MnFLB ? 'FLB' : 'WLB'
  /* 약축 휨 — Mp,y = min(Fy·Zy, 1.5Fy·Sy), 플랜지 비조밀 보간 (Mr,y = Fy·Sy) */
  const Mpy = Math.min(Fy * Zy, 1.5 * Fy * Sy)
  const Mny = bt <= fP ? Mpy : bt <= fR ? Mpy - (Mpy - Fy * Sy) * ((bt - fP) / (fR - fP)) : Fy * Sy
  /* 전단 (7.3.2), kv = 5, Aw = d·tw */
  const kv = 5
  const Aw = (sp.d / 10) * (sp.tw / 10)
  const lim1 = 50 * Math.sqrt(kv / Fy), lim2 = 62 * Math.sqrt(kv / Fy)
  const Vn = htw <= lim1 ? 0.6 * Fy * Aw : htw <= lim2 ? 0.6 * Fy * Aw * (lim1 / htw) : ((1860 * kv) / htw ** 2) * Aw

  return {
    phiPnc: toKN(phiPn), phiPnt: toKN(phiPnt), phiMnx: toKNm(0.9 * Mnx), phiMny: toKNm(0.9 * Mny), phiVn: toKN(0.9 * Vn),
    mxMode, lambdaC: lc, KLr, compact, notes,
  }
}

/** 강도비 — (8.2-1a/b) 와 전단 (7.3). B = 2차 효과 증폭계수(휨에 곱함) */
export function check(cap: Capacity, f: MemberForces, B = 1): CheckResult {
  const tension = f.P >= 0
  const phiPn = tension ? cap.phiPnt : cap.phiPnc
  const pr = Math.abs(f.P) / phiPn
  const mr = (B * f.Mx) / cap.phiMnx + (B * f.My) / cap.phiMny
  const pm = pr >= 0.2 ? pr + (8 / 9) * mr : pr / 2 + mr
  const vr = f.V / cap.phiVn
  const eq: CheckResult['eq'] = vr > pm ? '7.3' : f.Mx + f.My < 1e-9 ? (tension ? '5' : '6.2') : pr >= 0.2 ? '8.2-1a' : '8.2-1b'
  return { ratio: Math.max(pm, vr), eq, pmRatio: pm, vRatio: vr }
}

/** 비횡이동 증폭 B1 (8.2 해설, Cm = 1.0 보수적) — Pe1 = π²EI/(KL)², K ≤ 1 */
export function b1Of(PuComp_kN: number, sp: SectionProps, EMPa: number, Lmm: number): number {
  if (PuComp_kN <= 0) return 1
  const Pe = (Math.PI ** 2 * EMPa * sp.Ix) / Lmm ** 2 / 1000 // N → kN
  return PuComp_kN >= Pe ? 99 : Math.max(1, 1 / (1 - PuComp_kN / Pe))
}

/** 횡이동 증폭 B2 (8.2-5) = 1 / (1 − ΣPu·Δoh / (ΣH·L)) */
export function b2Of(sumPu: number, drift: number, sumH: number, L: number): number {
  if (sumH < 1e-6 || drift <= 0) return 1
  const x = (sumPu * drift) / (sumH * L)
  return x >= 1 ? 99 : 1 / (1 - x)
}

/** 4.8 유효길이계수 — 횡이동 허용 골조 정렬도 식: (GA·GB·(π/K)² − 36) / (6(GA+GB)) = (π/K) / tan(π/K) */
export function kSway(GA: number, GB: number): number {
  const f = (K: number) => { const u = Math.PI / K; return (GA * GB * u * u - 36) / (6 * (GA + GB)) - u / Math.tan(u) }
  let lo = 1.0001, hi = 50
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid }
  return (lo + hi) / 2
}

/** 4.4 세장비 한계 — 압축재 KL/r ≤ 200, 인장재 L/r ≤ 300 */
export const SLENDER_LIMIT = { compression: 200, tension: 300 }
