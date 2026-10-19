/* China member resistance, N/mm² and mm internally, kN/kN·m externally.
   GB 50017-2017 6.1, 6.2/C, 7.2/D, 7.3, 8.1/8.2;
   GB/T 50018-2025 4.2, 5.2–5.6, B.1/B.2 for Q235 cold-formed CC.
   Elastic section moduli (gamma_x=gamma_y=1), beta_m=beta_t=1.
   Local-buckling exceedance is reported NG; H postbuckling is not credited. */
import { cnStrength } from './cn'
import { effectiveWidth } from './cnLateral'
import { coldPhi } from './cnColdTable'
import type { Capacity, MemberForces, MemberLengths } from './twSteel'
import type { SectionProps } from '../domain/sections'

export type Curve = 'a' | 'b' | 'c' | 'd'
export function bucklingPhi(lambda: number, fy: number, E = 206000, curve: Curve = 'b'): number {
  const n = lambda / Math.PI * Math.sqrt(fy / E)
  const values = curve === 'a' ? [.41, .986, .152] : curve === 'b' ? [.65, .965, .3] : curve === 'c' ? [.73, n <= 1.05 ? .906 : 1.216, n <= 1.05 ? .595 : .302] : [1.35, n <= 1.05 ? .868 : 1.375, n <= 1.05 ? .915 : .432]
  if (n <= .215) return 1 - values[0] * n * n
  const x = values[1] + values[2] * n + n * n
  return Math.min(1, 2 / (x + Math.sqrt(Math.max(0, x * x - 4 * n * n))))
}

export interface CnCapacity extends Capacity {
  px: number; py: number; nex: number; ney: number
  elasticX: number; elasticY: number; local: number
}

/** Physical sway alignment equation, ideal base and fully rigid beam joint.
    No credit for roof/cladding diaphragm. */
export function cnK(Gtop: number, fixed: boolean): number {
  const GA = Math.max(1e-7, Gtop), GB = fixed ? 1e-7 : 1e8
  const f = (K: number) => { const u = Math.PI / K; return (GA * GB * u * u - 36) / (6 * (GA + GB)) - u / Math.tan(u) }
  let lo = 1.0000001, hi = 100
  for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m }
  return (lo + hi) / 2
}

/** CC effective-section lower bound: reduce all gross properties by the
    smallest plate effective-width ratio; no cold-work strength enhancement.
    Lip restraint uses 5.6.3 (partial stiffener), k1=1. */
function ccReduction(s: SectionProps, L: MemberLengths, stress: number) {
  const t = s.tw, b = s.bf - t, a = Number(s.name.split(' ')[1].split(/[x/]/)[2]) - t / 2, h = s.d - t
  const I = a ** 3 * t * (1 + 4 * b / a) / (12 * (1 + b / a))
  const ld = Math.PI * (b * b * h / 6 * (b + 32.8 * I / t ** 3)) ** .25
  const ln = Math.min(ld, L.Lb)
  const k = Math.min(4, ((b / ln) ** 2 / 3 + .142 + 10.92 * I * b / (ln * ln * t ** 3)) / (.333333333 + a / b))
  const ratio = (width: number, kk: number, psi = 1) => {
    const bc = psi < 0 ? width / (1 - psi) : width
    return (width - bc + effectiveWidth(width, t, stress, kk, psi)) / width
  }
  const flange = ratio(b, k), lip = ratio(a, .425)
  return { axial: Math.min(ratio(h, 4), flange, lip), bending: Math.min(ratio(h, 23.87, -1), flange, lip) }
}

export function cnCapacity(s: SectionProps, material: string, L: MemberLengths, Pc = 0): CnCapacity {
  const cold = s.kind === 'CC'
  if (cold && material !== 'Q235B') throw new Error('GB/T 50018 cold-formed checks currently require Q235B')
  const st = cold ? { fy: 235, f: 205, fv: 120, fu: 370 } : cnStrength(material, Math.max(s.tw, s.tf), s.kind === 'P')
  const E = 206000, eps = Math.sqrt(235 / st.fy), lx = L.KLx / s.rx, ly = L.KLy / s.ry
  const KLr = Math.max(lx, ly), lambdaC = KLr / Math.PI * Math.sqrt(st.fy / E)
  const wideQ235 = s.bf / s.d > .8 && material === 'Q235B'
  const thick = Math.max(s.tw, s.tf) >= 40
  const cx: Curve = s.kind === 'P' ? 'a' : !s.rolled || thick ? 'b' : wideQ235 ? 'b' : 'a'
  const cy: Curve = s.kind === 'P' ? 'a' : !s.rolled || thick || wideQ235 ? 'c' : 'b'
  let px = bucklingPhi(lx, st.fy, E, cx), py = bucklingPhi(ly, st.fy, E, cy)
  let effA = 1, effB = 1, phib = 1, local = 0
  const notes: string[] = []
  if (cold) {
    const r = ccReduction(s, L, st.f)
    effA = r.axial; effB = r.bending
    // Flexural-torsional buckling: conservative shear centre beyond web.
    const b = s.bf - s.tw, h = s.d - s.tw
    const xb = (2 * b * s.tw * b / 2 + 2 * (Number(s.name.split(' ')[1].split(/[x/]/)[2]) - s.tw / 2) * s.tw * b) / s.A
    const e0 = xb + s.tw * b * b * h * h / (4 * s.Ix)
    const i0 = e0 * e0 + s.rx * s.rx + s.ry * s.ry
    const ft = (E / 2.6 * s.J + Math.PI ** 2 * E * s.Cw / L.Lb ** 2) / (s.A * i0)
    const fyEuler = Math.PI ** 2 * E / Math.max(ly * ly, 1e-9)
    const H = Math.max(.01, 1 - e0 * e0 / i0)
    const fcr = (fyEuler + ft - Math.sqrt(Math.max(0, (fyEuler + ft) ** 2 - 4 * H * fyEuler * ft))) / (2 * H)
    px = coldPhi(lx)
    py = coldPhi(Math.PI * Math.sqrt(E / Math.max(fcr, 1e-9)))
    const l = Math.max(1, L.Lb), eta = -.46 // destabilizing load at upper flange: ea=-h/2
    const zeta = 4 * s.Cw / (s.d ** 2 * s.Iy) + .156 * s.J / s.Iy * (l / s.d) ** 2
    const raw = 4320 * s.A * s.d / ((l / s.ry) ** 2 * s.Sx) * 1.13 * (Math.sqrt(eta * eta + zeta) + eta) * 235 / st.fy
    phib = Math.min(1, raw > .7 ? 1.091 - .274 / raw : raw)
    notes.push('GB/T 50018 5.6: k1=1; effective-section lower bound; no cladding restraint credit')
  } else if (s.kind === 'H') {
    const lambda = Math.max(30, Math.min(100, KLr))
    const flangeLimit = (10 + .1 * lambda) * eps
    const webLimit = Pc > 1e-6 ? (25 + .5 * lambda) * eps : 80 * eps
    local = Math.max((s.bf - s.tw) / (2 * s.tf) / flangeLimit, s.h / s.tw / webLimit)
    const xi = L.Lb * s.tf / (s.bf * s.d)
    const beta = xi <= 2 ? .69 + .13 * xi : .95 // C.0.1 top-flange UDL, conservative vs end moments
    const raw = beta * 4320 / (L.Lb / s.ry) ** 2 * s.A * s.d / s.Sx * Math.sqrt(1 + ((L.Lb / s.ry) * s.tf / (4.4 * s.d)) ** 2) * eps
    phib = Math.min(1, raw > .6 ? 1.07 - .282 / raw : raw)
    if (local > 1) notes.push('GB 50017 local plate limit exceeded; postbuckling not credited')
  } else {
    local = s.d / s.tw / (100 * eps * eps)
  }
  const P = s.A * st.f / 1000
  const elasticX = s.Sx * st.f * effB / 1e6, elasticY = s.Sy * st.f * effB / 1e6
  // Elastic shear maximum VQ/It, rather than gross web average.
  const lip = cold ? Number(s.name.split(' ')[1].split(/[x/]/)[2]) - s.tw / 2 : 0
  const Q = s.kind === 'P' ? 0 : cold ? (s.bf - s.tw) * s.tw * (s.d - s.tw) / 2 + lip * s.tw * (s.d - s.tw - lip) / 2 + s.tw * (s.d - s.tw) ** 2 / 8 : s.bf * s.tf * (s.d - s.tf) / 2 + s.tw * s.h ** 2 / 8
  const shearArea = s.kind === 'P' ? s.A / 2 : s.Ix * s.tw / Q
  const cap: CnCapacity = {
    phiPnc: Math.min(px, py) * P * effA, phiPnt: P,
    phiMnx: (cold ? .9 : 1) * Math.min(1, phib) * elasticX, phiMny: elasticY,
    phiVn: shearArea * st.fv / 1000,
    mxMode: cold ? 'CF-LTB' : phib < 1 ? 'LTB-elastic' : 'elastic',
    lambdaC, KLr, compact: local > 1 ? 'slender' : 'noncompact', notes,
    px: px * P * effA, py: py * P * effA,
    nex: Math.PI ** 2 * E * s.A / (1.1 * Math.max(lx * lx, 1e-9)) / 1000,
    ney: Math.PI ** 2 * E * s.A / (1.1 * Math.max(ly * ly, 1e-9)) / 1000,
    elasticX, elasticY, local,
  }
  return cap
}

/** gammaRE — GB 51022 표 3.1.5 / GB 50011 5.4.2 지진 조합: 강도 0.85, 안정 0.90 (요구/저항 비에 곱함) */
export function cnCheck(c: CnCapacity, f: MemberForces, sway = 1, gammaRE?: { strength: number; stability: number }): { ratio: number; eq: `GB ${string}`; B: number } {
  const gs = gammaRE?.strength ?? 1, gb = gammaRE?.stability ?? 1
  const N = Math.max(0, -f.P), bx = N >= c.nex / .8 ? 99 : 1 / (1 - .8 * N / c.nex), by = N >= c.ney / .8 ? 99 : 1 / (1 - .8 * N / c.ney)
  const B = Math.max(1, bx, by, sway)
  const gross = gs * (Math.abs(f.P) / c.phiPnt + sway * (f.Mx / c.elasticX + f.My / c.elasticY))
  const inPlane = gb * (N / c.px + Math.max(bx, sway) * f.Mx / c.elasticX + sway * f.My / c.phiMny)
  const outPlane = gb * (N / c.py + sway * f.Mx / c.phiMnx + Math.max(by, sway) * f.My / c.elasticY)
  const tensionBending = gs * (Math.abs(f.P) / c.phiPnt + sway * (f.Mx / c.phiMnx + f.My / c.phiMny))
  const pm = f.P >= 0 ? Math.max(gross, tensionBending) : Math.max(gross, inPlane, outPlane)
  const shear = gs * Math.abs(f.V) / c.phiVn
  // 6.1.4 combined normal/shear stress: conservative same-point envelope.
  const interaction = Math.hypot(pm, shear)
  const r = Math.max(pm, shear, interaction, c.local > 1 ? c.local : 0)
  return { ratio: r, eq: c.local > 1 && c.local === r ? 'GB 7.3/6.3' : interaction === r ? 'GB 6.1.4' : shear === r ? 'GB 6.1.2' : f.P < 0 ? 'GB 8.2.5' : 'GB 8.1.1', B }
}
