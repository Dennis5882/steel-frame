/* Primary sources: local COde/CN/knowledge/gb50009-2012 8.2/8.3,
   gb50011-2010 5.1/5.2 (2024 revision), gb55001-2021 3.1.13.
   Scope: regular single-storey gable factory, static wind and base shear.
   Site parameters and periods are explicit project inputs, not TW presets. */
export function spectrum(T: number, alphaMax: number, Tg: number, damping: number): number {
  if (!(T > 0 && T <= 6 && Tg >= 0.1 && damping > 0 && damping <= 0.2 && alphaMax > 0)) throw new Error('GB spectrum: invalid period, damping or site coefficient')
  const gamma = 0.9 + (0.05 - damping) / (0.3 + 6 * damping)
  const eta1 = Math.max(0, 0.02 + (0.05 - damping) / (4 + 32 * damping))
  const eta2 = Math.max(0.55, 1 + (0.05 - damping) / (0.08 + 1.6 * damping))
  const a = T < 0.1 ? 0.45 + (eta2 - 0.45) * T / 0.1 : T <= Tg ? eta2 : T <= 5 * Tg ? eta2 * (Tg / T) ** gamma : eta2 * 0.2 ** gamma - eta1 * (T - 5 * Tg)
  return Math.max(0, a * alphaMax)
}
const HEIGHTS = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100]
const MZ: Record<string, number[]> = {
  A: [1.09, 1.28, 1.42, 1.52, 1.67, 1.79, 1.89, 1.97, 2.05, 2.12, 2.18, 2.23],
  B: [1, 1, 1.13, 1.23, 1.39, 1.52, 1.62, 1.71, 1.79, 1.87, 1.93, 2],
  C: [.65, .65, .65, .74, .88, 1, 1.1, 1.2, 1.28, 1.36, 1.43, 1.5],
  D: [.51, .51, .51, .51, .51, .6, .69, .77, .84, .91, .98, 1.04],
}
export function muZ(z: number, terrain: string): number {
  const a = MZ[terrain]
  if (!a || !Number.isFinite(z) || z > 100) throw new Error('GB wind: terrain A–D and height ≤100 m required')
  if (z <= 5) return a[0]
  const i = HEIGHTS.findIndex((h) => z <= h)
  return a[i - 1] + (a[i] - a[i - 1]) * (z - HEIGHTS[i - 1]) / (HEIGHTS[i] - HEIGHTS[i - 1])
}
/** GB 50009 table 8.3.1 item 2, minimum absolute coefficient 0.1. */
export function roofShape(deg: number): number {
  const c = deg <= 15 ? -0.6 : deg <= 30 ? -0.6 + .6 * (deg - 15) / 15 : Math.min(.8, .8 * (deg - 30) / 30)
  return Math.abs(c) < .1 ? (c <= 0 ? -.1 : .1) : c
}
/** GB/T 50018-2025 5.6.1, no favourable adjacent-plate restraint (k1=1). */
export function effectiveWidth(b: number, t: number, stress: number, k: number, psi = 1): number {
  if (!(b > 0 && t > 0 && stress > 0 && k > 0)) throw new Error('GB effective width: invalid input')
  const alpha = psi < 0 ? 1.15 : 1.15 - .15 * psi
  const rho = Math.sqrt(205 * k / stress), r = b / t
  const bc = psi < 0 ? b / (1 - psi) : b
  const reduction = r <= 18 * alpha * rho ? 1 : r < 38 * alpha * rho ? Math.sqrt(21.8 * alpha * rho / r) - .1 : 25 * alpha * rho / r
  return Math.min(bc, Math.max(0, reduction * bc))
}
