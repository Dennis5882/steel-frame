import type { Results } from '../actions/results'
import { portalGeometry } from './portal'
import type { FactoryModel, FactorySpec } from './types'

/** Check each span relative to its own moving supports; signed displacement,
 * interpolated at the check point, also handles unequal spans and mono roofs. */
export function roofDeflection(spec: FactorySpec, model: FactoryModel, res: Results, cases: string[], divisor: number, dead = false) {
  const g = portalGeometry(spec)
  const lines = [...g.eaveXs, ...g.leanXs].sort((a, b) => a - b)
  const top = (x: number, y: number) => model.nodes.find((n) => Math.abs(n.x - x) < 1e-7 && Math.abs(n.y - y) < 1e-7 && Math.abs(n.z - g.zAt(x)) < 1e-7)
  let best = { value: 0, limit: (lines[1] - lines[0]) / divisor, ratio: 0, case: cases[0] ?? '' }
  for (const lc of cases) for (const n of model.nodes.filter(g.isDeflNode)) {
    const left = lines.filter((x) => x < n.x - 1e-7).at(-1)!, right = lines.find((x) => x > n.x + 1e-7)!
    const a = top(left, n.y), b = top(right, n.y)
    if (!a || !b) throw new Error(`Roof deflection: missing support at ${n.id}`)
    const dz = (id: number) => {
      const v = res.disp.get(lc)?.get(id)?.dz, d = dead ? res.disp.get('D')?.get(id)?.dz : 0
      if (!Number.isFinite(v) || !Number.isFinite(d)) throw new Error(`Roof deflection: missing displacement ${lc}, ${id}`)
      return v! + d!
    }
    const t = (n.x - left) / (right - left), value = Math.abs(dz(n.id) - ((1 - t) * dz(a.id) + t * dz(b.id)))
    const limit = (right - left) / divisor, ratio = value / limit
    if (ratio > best.ratio) best = { value, limit, ratio, case: dead ? `D+${lc}` : lc }
  }
  return best
}
