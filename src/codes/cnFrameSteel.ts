/* 다층 강골조 부재 검토 — GB 50017-2017 (2019 勘误 포함) + GB/T 50011-2010 (2024年版) 내진 규정, 강제규범 GB 55002·GB 55006 우선.
   단위: 내부 N·mm, 입력 kN·kN·m. 원문 KB: E:/MIDAS PROGRAM/COde/CN/knowledge/{gb50017-2017,gb50011-2010}.
   - 강도 4.4.1 (Q355 = 2019 勘误), 단면등급 3.5.1, γx·γy 6.1.2 / 8.1.1
   - 보 6.1.1 강도, 6.1.3 전단, 6.2.3 + 附录 C.0.1 (2019 勘误: εk²) 횡비틀림
   - 기둥 8.1.1 강도, 8.2.5 이축 압축휨 안정 (βm 8.2.1, φb C.0.5), μ 附录 E.0.1 (无侧移)
   - 축압 φ 附录 D (7.2.1 단면분류, 압연 H b/h>0.8: Q355 x a·y b)
   - 내진: γRE 5.4.2 (강도 0.75, 안정 0.80), 기둥 세장비 8.3.1, 판폭두께비 8.3.2·8.4.1, 가새 ψ 8.2.6
   알려진 단순화(계산서에 표기): 인자형 가새 불평형력(8.2.6-2) 미검토, 节点域(8.2.5) 미검토, 强柱弱梁 미검토. */
import { bucklingPhi, type Curve } from './cnSteel'

export type SteelGrade = 'Q235B' | 'Q355B'

export interface CnFrameStrength { fy: number; f: number; fv: number; fu: number }

/** GB 50017-2017 表4.4.1 (2019 勘误: Q345 → Q355, fy 갱신) */
export function cnFrameStrength(grade: SteelGrade, t: number): CnFrameStrength {
  if (!(t > 0 && t <= 100)) throw new Error('GB 50017 4.4.1: 0 < t ≤ 100 mm')
  if (grade === 'Q235B') {
    const r = t <= 16 ? [235, 215, 125] : t <= 40 ? [225, 205, 120] : [215, 200, 115]
    return { fy: r[0], f: r[1], fv: r[2], fu: 370 }
  }
  const r = t <= 16 ? [355, 305, 175] : t <= 40 ? [345, 295, 170] : t <= 63 ? [335, 290, 165] : t <= 80 ? [325, 280, 160] : [315, 270, 155]
  return { fy: r[0], f: r[1], fv: r[2], fu: 470 }
}

export const epsK = (fy: number) => Math.sqrt(235 / fy)

/** H형강 단면 (mm). r = 필릿 반경 — 판폭두께비의 자유돌출폭·腹板计算高度에서 제외 */
export interface HSection {
  name: string; d: number; bf: number; tw: number; tf: number; r: number
  A: number; Ix: number; Iy: number; Wx: number; Wy: number; ix: number; iy: number
  rolled: boolean
}

export const flangeRatio = (s: HSection) => ((s.bf - s.tw) / 2 - s.r) / s.tf
export const webRatio = (s: HSection) => (s.d - 2 * s.tf - 2 * s.r) / s.tw

/** 表3.5.1 단면등급 (H, 휨 또는 압축휨). λ = 압축휨 부재의 세장비 (S3 腹板 식) */
export function sectionClass(s: HSection, fy: number, kind: 'beam' | 'column', alpha0 = 2, lambda = 100): 1 | 2 | 3 | 4 | 5 {
  const e = epsK(fy), fl = flangeRatio(s), w = webRatio(s)
  const fLim = [9, 11, 13, 15].map((v) => v * e)
  const lam = Math.min(100, Math.max(30, lambda))
  const wLim = kind === 'beam' ? [65, 72, 93, 124].map((v) => v * e)
    : [(33 + 13 * alpha0 ** 1.3) * e, (38 + 13 * alpha0 ** 1.39) * e,
      (alpha0 <= 1.6 ? 16 * alpha0 + 0.5 * lam + 25 : 48 * alpha0 + 0.5 * lam - 26.2) * e, (45 + 25 * alpha0 ** 1.66) * e]
  for (let k = 0; k < 4; k++) if (fl <= fLim[k] && w <= wLim[k]) return (k + 1) as 1 | 2 | 3 | 4
  return 5
}

/** 附录 D 곡선 (表7.2.1-1, t < 40): 압연 H b/h ≤ 0.8 → x a, y b; b/h > 0.8 → x a*, y b* (Q235: b, c) */
export function curvesOf(s: HSection, grade: SteelGrade): { x: Curve; y: Curve } {
  const thick = Math.max(s.tw, s.tf) >= 40
  if (thick) return { x: 'b', y: 'c' }
  if (!s.rolled) return { x: 'b', y: 'c' }
  if (s.bf / s.d <= 0.8) return { x: 'a', y: 'b' }
  return grade === 'Q235B' ? { x: 'b', y: 'c' } : { x: 'a', y: 'b' }
}

/** 附录 E.0.1 无侧移框架柱 μ — 표의 근거 식을 이분법으로 풂. K = Σ(Ib/lb)/Σ(Ic/lc), 고정 기초 K2 = 10 */
export function muNoSway(K1: number, K2: number): number {
  const k1 = Math.min(Math.max(K1, 0), 1e6), k2 = Math.min(Math.max(K2, 0), 1e6)
  const g = (mu: number) => {
    const u = Math.PI / mu
    return (u * u + 2 * (k1 + k2) - 4 * k1 * k2) * u * Math.sin(u) - 2 * ((k1 + k2) * u * u + 4 * k1 * k2) * Math.cos(u) + 8 * k1 * k2
  }
  let lo = 0.5, hi = 1
  if (g(hi) === 0) return hi
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (g(lo) * g(m) <= 0) hi = m; else lo = m }
  return (lo + hi) / 2
}

/** 附录 E.0.2 有侧移框架柱 μ — [36K1K2 − (π/μ)²]·sin(π/μ) + 6(K1+K2)(π/μ)·cos(π/μ) = 0 을 u = π/μ ∈ (0, π) 에서 이분법. K1 = K2 = 0 → ∞ */
export function muSway(K1: number, K2: number): number {
  const k1 = Math.min(Math.max(K1, 0), 1e6), k2 = Math.min(Math.max(K2, 0), 1e6)
  if (k1 + k2 < 1e-9) return Infinity
  const f = (u: number) => (36 * k1 * k2 - u * u) * Math.sin(u) + 6 * (k1 + k2) * u * Math.cos(u)
  let lo = 1e-9, hi = Math.PI
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m }
  return Math.PI / ((lo + hi) / 2)
}

/** 附录 C.0.1 (2019 勘误 εk²) — 이축대칭 압연 H, βb = 表C.0.1. φb > 0.6 → 1.07 − 0.282/φb ≤ 1 */
export function phiBeam(s: HSection, l1: number, fy: number, betaB: number): number {
  const ly = l1 / s.iy, e = epsK(fy)
  const raw = betaB * 4320 / (ly * ly) * s.A * s.d / s.Wx * Math.sqrt(1 + (ly * s.tf / (4.4 * s.d)) ** 2) * e * e
  return Math.min(1, raw > 0.6 ? 1.07 - 0.282 / raw : raw)
}

/** 表C.0.1 βb: 중앙 횡지지 없음 + 상부 플랜지 등분포(1) / 중앙 1점 횡지지 + 등분포 상부(5) */
export function betaB(s: HSection, l1: number, midSupport: boolean): number {
  if (midSupport) return 1.15
  const xi = l1 * s.tf / (s.bf * s.d)
  return xi <= 2 ? 0.69 + 0.13 * xi : 0.95
}

/** C.0.5 (λy ≤ 120εk) 압축휨 부재 φb */
export const phiBColumn = (lambdaY: number, fy: number) => Math.min(1, 1.07 - lambdaY ** 2 / (44000 * epsK(fy) ** 2))

/** 8.2.1-5 βm (무측이동, 횡하중 없음): M1 = 절댓값 큰 단모멘트, 반곡률이면 이부호 */
export const betaM = (Ma: number, Mb: number) => {
  const [M1, M2] = Math.abs(Ma) >= Math.abs(Mb) ? [Ma, Mb] : [Mb, Ma]
  if (Math.abs(M1) < 1e-9) return 1
  // Gen BEAMFORCE = 위치별 단면력(모멘트도) → 단곡률이면 양단 같은 부호 = 원문 "同号"
  return 0.6 + 0.4 * (M2 / M1)
}

/** 부재 한 위치의 힘 (kN, kN·m). N 인장 +, Mx 강축, My 약축 */
export interface Station { N: number; Vx: number; Vy: number; Mx: number; My: number }

export interface MemberInput {
  role: 'beam' | 'column' | 'brace'
  section: HSection; grade: SteelGrade
  /** 부재 길이 (m), 계산길이 μ (강축·약축), 횡비틀림 비지지 길이 l1 (m) */
  L: number; muX: number; muY: number; l1: number; midLateralSupport: boolean
  /** 순단면적비 (8.1.1 An) */
  netArea: number
  /** 내진 등급 (1~4) */
  seismicGrade: 1 | 2 | 3 | 4
}

export interface CheckItem { key: string; clause: string; demand: number; capacity: number; ratio: number
  /** 가새 압축: 적용한 ψ (8.2.6-2). ratio × ψ = ψ 미적용 비 (Gen 예제 방식, 참고용) */
  psi?: number }
export interface ComboCheck { combo: string; seismic: boolean; ratio: number; governing: string; items: CheckItem[] }

/** 부재 고정 성질 (조합 무관) + 구조 규정 검토 */
export interface MemberStatic {
  st: CnFrameStrength; eps: number; cls: number; gx: number; gy: number
  lambdaX: number; lambdaY: number; phiX: number; phiY: number; phiB: number; phiBc: number
  detailing: CheckItem[]
}

export function memberStatic(m: MemberInput): MemberStatic {
  const s = m.section
  const st = cnFrameStrength(m.grade, Math.max(s.tw, s.tf))
  const eps = epsK(st.fy)
  const lambdaX = m.muX * m.L * 1000 / s.ix, lambdaY = m.muY * m.L * 1000 / s.iy
  const cls = sectionClass(s, st.fy, m.role === 'beam' ? 'beam' : 'column', 2, Math.max(lambdaX, lambdaY))
  const plastic = cls <= 3
  const gx = plastic ? 1.05 : 1, gy = plastic ? 1.2 : 1
  const cv = curvesOf(s, m.grade)
  const phiX = bucklingPhi(lambdaX, st.fy, 206000, cv.x), phiY = bucklingPhi(lambdaY, st.fy, 206000, cv.y)
  const phiB = phiBeam(s, m.l1 * 1000, st.fy, betaB(s, m.l1 * 1000, m.midLateralSupport))
  const phiBc = phiBColumn(lambdaY, st.fy)
  const g = m.seismicGrade
  const detailing: CheckItem[] = []
  const lim = (key: string, clause: string, demand: number, capacity: number) => detailing.push({ key, clause, demand, capacity, ratio: demand / capacity })
  if (m.role === 'column') {
    lim('slender', 'GB/T 50011 8.3.1', Math.max(lambdaX, lambdaY), [60, 80, 100, 120][g - 1] * eps)
    lim('flange', 'GB/T 50011 8.3.2', flangeRatio(s), [10, 11, 12, 13][g - 1] * eps)
    lim('web', 'GB/T 50011 8.3.2', webRatio(s), [43, 45, 48, 52][g - 1] * eps)
  } else if (m.role === 'beam') {
    lim('flange', 'GB/T 50011 8.3.2', flangeRatio(s), [9, 9, 10, 11][g - 1] * eps)
    // 腹板 한계는 축압비 의존 — 조합별 검토에서 갱신. 여기서는 N = 0 상한
    lim('web', 'GB/T 50011 8.3.2', webRatio(s), [60, 65, 70, 75][g - 1] * eps)
  } else {
    lim('slender', 'GB/T 50011 8.4.1', Math.max(lambdaX, lambdaY), 120 * eps)
    lim('flange', 'GB/T 50011 8.4.1', flangeRatio(s), [8, 9, 10, 13][g - 1] * eps)
    lim('web', 'GB/T 50011 8.4.1', webRatio(s), [25, 26, 27, 33][g - 1] * eps)
  }
  return { st, eps, cls, gx, gy, lambdaX, lambdaY, phiX, phiY, phiB, phiBc, detailing }
}

/** 조합 하나에 대한 부재 검토. stations = 부재 길이 방향 위치(I…J), seismic = 지진 조합(γRE 적용) */
export function checkMember(m: MemberInput, ms: MemberStatic, combo: string, seismic: boolean, stations: Station[]): ComboCheck {
  const s = m.section, { st, gx, gy } = ms, f = st.f, E = 206000
  const reS = seismic ? 0.75 : 1, reB = seismic ? 0.8 : 1
  const items: CheckItem[] = []
  const add = (key: string, clause: string, demand: number, capacity: number) => items.push({ key, clause, demand, capacity, ratio: capacity > 0 ? demand / capacity : 99 })
  const An = m.netArea * s.A
  const absMax = (k: keyof Station) => stations.reduce((a, p) => Math.max(a, Math.abs(p[k])), 0)
  const N = Math.min(...stations.map((p) => p.N)) // 최대 압축 (음수)
  const Nt = Math.max(...stations.map((p) => p.N))
  const Nc = Math.max(0, -N) * 1e3

  /* 강도 8.1.1 / 6.1.1 — 위치별 최대 */
  let strength = 0
  for (const p of stations) strength = Math.max(strength, Math.abs(p.N) * 1e3 / An + Math.abs(p.Mx) * 1e6 / (gx * s.Wx) + Math.abs(p.My) * 1e6 / (gy * s.Wy))
  add('strength', m.role === 'beam' ? 'GB 50017 6.1.1' : 'GB 50017 8.1.1', strength * reS, f)

  /* 전단 6.1.3 — 강축 VS/(I tw), 약축은 두 플랜지 */
  const Sx = s.bf * s.tf * (s.d - s.tf) / 2 + s.tw * (s.d / 2 - s.tf) ** 2 / 2
  const tauX = absMax('Vy') * 1e3 * Sx / (s.Ix * s.tw)
  const Sy = 2 * (s.tf * (s.bf / 2) ** 2 / 2), tauY = absMax('Vx') * 1e3 * Sy / (s.Iy * 2 * s.tf)
  add('shear', 'GB 50017 6.1.3', Math.max(tauX, tauY) * reS, st.fv)

  const Mx = absMax('Mx') * 1e6, My = absMax('My') * 1e6
  if (m.role === 'beam') {
    /* 6.2.3 횡비틀림 */
    add('ltb', 'GB 50017 6.2.3', (Mx / (ms.phiB * s.Wx) + My / (gy * s.Wy)) * reB, f)
    /* GB 50011 8.3.2 腹板: 72-100Nb/(Af) 등 (축압비) */
    const g = m.seismicGrade, nb = Nc / (s.A * f)
    const webLim = ([[72, 120, 60], [72, 100, 65], [80, 110, 70], [85, 120, 75]][g - 1])
    add('web', 'GB/T 50011 8.3.2', webRatio(s), Math.min(webLim[0] - webLim[1] * nb, webLim[2]) * ms.eps)
  } else {
    /* 8.2.5 이축 압축휨 안정 (압축 시). βm·βt 는 단모멘트 비 (8.2.1) */
    const I = stations[0], J = stations[stations.length - 1]
    const bmx = Math.min(1, Math.max(0.4, betaM(I.Mx, J.Mx))), bmy = Math.min(1, Math.max(0.4, betaM(I.My, J.My)))
    const third = (k: 'Mx' | 'My') => {
      if (stations.length < 5) return 1
      const at = (x: number) => { const t = x * 4, i = Math.min(3, Math.floor(t)); return stations[i][k] + (stations[i + 1][k] - stations[i][k]) * (t - i) }
      const mx = absMax(k)
      return mx > 1e-9 ? Math.max(0.5, Math.max(Math.abs(at(1 / 3)), Math.abs(at(2 / 3)), Math.abs(stations[2][k])) / mx) : 1
    }
    const btx = third('Mx'), bty = third('My')
    const NEx = Math.PI ** 2 * E * s.A / (1.1 * ms.lambdaX ** 2), NEy = Math.PI ** 2 * E * s.A / (1.1 * ms.lambdaY ** 2)
    if (Nc > 0 || m.role === 'column') {
      const eta = 1
      const r1 = Nc / (ms.phiX * s.A * f) + bmx * Mx / (gx * s.Wx * (1 - 0.8 * Nc / NEx) * f) + eta * bty * My / (1 * s.Wy * f)
      const r2 = Nc / (ms.phiY * s.A * f) + eta * btx * Mx / (ms.phiBc * s.Wx * f) + bmy * My / (gy * s.Wy * (1 - 0.8 * Nc / NEy) * f)
      add('stabilityX', 'GB 50017 8.2.5-1', r1 * reB, 1)
      add('stabilityY', 'GB 50017 8.2.5-2', r2 * reB, 1)
    }
    if (m.role === 'brace') {
      /* GB 50011 8.2.6 가새 압축 (지진: ψ/γRE), 비지진 7.2.1. 인장 N/(An f) */
      const phi = Math.min(ms.phiX, ms.phiY), lam = Math.max(ms.lambdaX, ms.lambdaY)
      const lamN = lam / Math.PI * Math.sqrt(st.fy / E), psi = seismic ? 1 / (1 + 0.35 * lamN) : 1
      if (Nc > 0) add('braceComp', seismic ? 'GB/T 50011 8.2.6' : 'GB 50017 7.2.1', Nc / (phi * s.A) * reB, psi * f)
      if (Nc > 0 && psi < 1) items[items.length - 1].psi = psi
      if (Nt > 0) add('braceTens', 'GB 50017 7.1.1', Nt * 1e3 / An * reS, f)
    }
  }
  /* 'web'(8.3.2 판폭두께비) 는 구조 규정 — 응력비에서 제외하고 detailRatio 로 따로 본다 */
  const gov = items.filter((i) => i.key !== 'web').reduce((a, b) => (b.ratio > a.ratio ? b : a))
  return { combo, seismic, ratio: gov.ratio, governing: gov.key, items }
}
