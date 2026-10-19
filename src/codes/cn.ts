/* China GB: GB 55001-2021 + GB 50009-2012; steel GB 50017-2017.
   Gen material/section database mappings verified against Gen NX on 2026-10-15.
   DSTL intentionally omitted: the public API lists GB50017-03, not 2017.
   Member checks are performed by cnSteel.ts, independently of Gen's design code. */
import type { CodeProfile } from './types'
import { spectrum, muZ, roofShape } from './cnLateral'

export interface CnStrength { fy: number; f: number; fv: number; fu: number }
/** GB 50017-2017 4.4.1 (plates), 4.4.3 (seamless pipe). */
export function cnStrength(material: string, t: number, pipe = false): CnStrength {
  if (!(t > 0 && t <= 100)) throw new Error('GB 50017: thickness must be 0 < t ≤ 100 mm')
  if (material === 'Q235B') {
    const r = pipe ? (t <= 16 ? [235, 215, 125] : t <= 30 ? [225, 205, 120] : [215, 195, 115])
      : t <= 16 ? [235, 215, 125] : t <= 40 ? [225, 205, 120] : [215, 200, 115]
    return { fy: r[0], f: r[1], fv: r[2], fu: pipe ? 375 : 370 }
  }
  if (material === 'Q345B') {
    const r = pipe ? (t <= 16 ? [345, 305, 175] : t <= 30 ? [325, 290, 170] : [295, 260, 150])
      : t <= 16 ? [345, 305, 175] : t <= 40 ? [335, 295, 170] : t <= 63 ? [325, 290, 165] : t <= 80 ? [315, 280, 160] : [305, 270, 155]
    return { fy: r[0], f: r[1], fv: r[2], fu: 470 }
  }
  throw new Error(`Unsupported GB steel: ${material}`)
}

export const CN: CodeProfile = {
  id: 'CN', labelKey: 'code_CN', checkLabelKey: 'code_CN_check', selectLabelKey: 'code_CN_select', basisLabelKey: 'code_CN_basis', method: 'LSD',
  materials: {
    Q235B: { fy: 235, fu: 370, E: 206000, nu: 0.3, gamma: 78.5, gen: { standard: 'GB03(S)', db: 'Q235' } },
    Q345B: { fy: 345, fu: 470, E: 206000, nu: 0.3, gamma: 78.5, gen: { standard: 'GB03(S)', db: 'Q345' } },
  },
  defaultMaterial: 'Q235B', fyAt: (m, t) => cnStrength(m, t).fy,
  gen: { sectionDb: 'GB-YB05', sectionDbOf: (s) => s.startsWith('CC ') ? 'GB50018-02' : 'GB-YB05', shapeOf: (s) => /^(HN|HW|HM|HT|BH) /.test(s) ? 'H' : s.split(' ')[0] },
  roofLive: () => 0.5, // GB 55001 4.2.8: inaccessible roof, no area reduction
  combos: () => [
    { ref: 'G', terms: [['D', 1.3]] },
    { ref: 'Q', terms: [['D', 1.3], ['L', 1.5]] },
    { ref: 'S', terms: [['D', 1.3], ['S', 1.5]] },
    { ref: 'W+', terms: [['D', 1.3], ['W', 1.5]] },
    { ref: 'W-', terms: [['D', 1], ['W', 1.5]] },
    { ref: 'SW', terms: [['D', 1.3], ['S', 1.5], ['W', 0.9]] },
    { ref: 'WS', terms: [['D', 1.3], ['S', 1.05], ['W', 1.5]] },
    { ref: 'E+', terms: [['D', 1.3], ['E', 1.4]] },
    { ref: 'E-', terms: [['D', 1], ['E', 1.4]] },
    { ref: 'ES+', terms: [['D', 1.3], ['S', 0.65], ['E', 1.4]] },
    { ref: 'ES-', terms: [['D', 1], ['S', 0.5], ['E', 1.4]] },
  ],
  lateral: {
    // CN loads use explicit Tx/Ty, w0, Tg and alphaMax inputs; these adapters
    // support the shared reporting interface without importing TW equations.
    period: () => { throw new Error('GB: specify the structural period Tx/Ty') },
    seismicCoef: ({ SDS, SD1, T }) => { const c = spectrum(T, SDS, SD1, 0.05); return { c, cV: c, cStar: c, cMin: 0.2 * SDS, cM: 0, SaD: c, Fu: 1, Ra: 1, m: 1, gov: 'GB/T 50011 5.1.5' } },
    windQ: (z, o) => muZ(z, o.exposure) * o.V10 ** 2 / 1600,
    gust: 1, gcpi: () => 0.2,
    wallCp: { windward: 0.8, leeward: () => -0.5 },
    roofCp: ({ thetaDeg }) => { const r = roofShape(thetaDeg); return { low: r, high: r, leeward: -0.5 } },
  },
}
