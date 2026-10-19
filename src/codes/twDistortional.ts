import type { CCDims } from './twColdFormed'

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

/** TW 6.2-33..39 / 7.3-10..13. beta=1, k_phi=0.
 * PDF p.107 uses Iyf in compression Lcr; the stress equation uses Ixf.
 * Retain the printed wavelength and also evaluate the stationary wavelength
 * derived from 7.3-10. Use the lower stress pending edition/errata confirmation.
 * PDF p.70: the whole [45360(1-xi)+62160] multiplies (L/h)^2. */
export function distortionalTW(g: CCDims, E: number, mode: 'flexure' | 'compression', Lm: number) {
  const f = flangeProps(g), t = g.t, h0 = g.H, G = E / 2.6, mu = 0.3
  const dx = f.xof - f.hxf // = b
  const core = f.Ixf * dx ** 2 - (f.Ixyf ** 2 / f.Iyf) * dx ** 2 // + Cwf (0)
  const Lcrd = mode === 'flexure'
    ? ((4 * Math.PI ** 4 * h0 * (1 - mu * mu)) / t ** 3 * core + (Math.PI ** 4 * h0 ** 4) / 720) ** 0.25
    : ((6 * Math.PI ** 4 * h0 * (1 - mu * mu)) / t ** 3 * (f.Iyf * dx ** 2 - (f.Ixyf ** 2 / f.Iyf) * dx ** 2)) ** 0.25
  const evaluate = (L: number) => {
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
    return (kfe + kwe) / (kfg + kwg)
  }
  const stationaryLcrd = mode === 'compression' ? ((6 * Math.PI ** 4 * h0 * (1 - mu * mu)) / t ** 3 * core) ** .25 : Lcrd
  const printedL = Math.min(Lcrd, Lm), stationaryL = Math.min(stationaryLcrd, Lm)
  const L = evaluate(stationaryL) < evaluate(printedL) ? stationaryL : printedL
  return { Fcrd: evaluate(L), Lcrd, stationaryLcrd, L }
}
