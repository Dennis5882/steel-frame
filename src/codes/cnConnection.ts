/** GB 50017-2017: 11.5.1/2 holes, 12.2.1 block tearing,
 * 12.2.3(2) short gusset stability, 11.2.2 effective fillet length. */
export const standardHoleCN = (d: number) => ({ 12: 13.5, 16: 17.5, 20: 22, 22: 24, 24: 26, 27: 30, 30: 33 }[d] ?? (() => { throw new Error('GB standard bolt hole outside table 11.5.1') })())
export const netHoleCN = (d: number) => Math.max(d + 4, standardHoleCN(d))
/** Fig.12.2.2(c): spread from the first to last row at 22 degrees,
 * bounded by the actual plate width, before hole deductions. */
export const effectiveWidthCN = (width: number, gauge: number, connectionLength: number) => Math.min(width, gauge + 2 * connectionLength * Math.tan(22 * Math.PI / 180))
export function blockTearCN(t: number, tensionNetLength: number, shearNetLength: number, f: number): number {
  return Math.max(0, tensionNetLength + shearNetLength / Math.sqrt(3)) * t * f / 1000
}
export function gussetStabilityCN(width: number, t: number, clearLength: number, fy: number, f: number) {
  const limit = 10 * Math.sqrt(235 / fy)
  return { applicable: clearLength / t <= limit, capacity: .8 * width * t * f / 1000, limit }
}
export const filletCN = (leg: number, length: number, f: number, lines = 1) => .7 * leg * Math.max(0, length - 2 * leg) * f * lines / 1000
