import type { DesignResult } from '../src/domain/design'

/** Confirm the lengths Gen actually used, allowing CODE-TABLE rounding only. */
export function auditKrLengths(design: DesignResult, table: { HEAD?: string[]; DATA?: unknown[][] }) {
  const head = table.HEAD ?? [], rows = table.DATA ?? []
  const at = (name: string) => { const i = head.indexOf(name); if (i < 0) throw new Error(`Gen CODE-TABLE missing ${name}`); return i }
  const idAt = at('MEMB'), fields = [['Ly', 'KLx'], ['Lz', 'KLy'], ['Lb', 'Lb']] as const
  const slots = fields.map(([name, key]) => ({ name, key, i: at(name) }))
  const kSlots = ['Ky', 'Kz'].map(at), seen = new Set<number>()
  for (const row of rows) {
    const id = Number(row[idAt]), m = design.members.find((m) => m.id === id)
    if (!m || seen.has(id)) throw new Error(`Unexpected or duplicate Gen CODE-TABLE element ${id}`)
    seen.add(id)
    for (const { name, key, i } of slots) {
      const actual = Number(row[i]), expected = m.lengths[key] / 1000
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > Math.max(1e-5, expected * 5e-5)) throw new Error(`Gen ${id} ${name}: ${actual} != ${expected}`)
    }
    for (const i of kSlots) if (Number(row[i]) !== 1) throw new Error(`Gen ${id} ${head[i]} is not 1`)
  }
  if (!seen.size) throw new Error('Gen CODE-TABLE has no auditable lengths')
  return { checked: seen.size, ids: [...seen] }
}

/** Gen RAT is a strength envelope; the app's KL/r recommendation is separate.
 * Element identity is mandatory. This is an engine comparison, not proof of
 * identical equations, moment amplification or seismic/detail assumptions. */
export function compareKrMembers(design: DesignResult, rows: { ELEM?: unknown; ID?: unknown; RAT: unknown }[]) {
  const gen = new Map<number, number>()
  for (const row of rows) {
    const id = Number(row.ELEM ?? row.ID), ratio = Number(row.RAT)
    if (row.RAT === null || row.RAT === undefined || String(row.RAT).trim() === '' || !Number.isInteger(id) || id <= 0 || !Number.isFinite(ratio) || ratio < 0 || gen.has(id)) throw new Error(`Invalid or duplicate Gen result: ${id}`)
    gen.set(id, ratio)
  }
  if (!gen.size) throw new Error('Gen returned no steel check rows')
  const members = design.members.map((m) => {
    const unsupported = /^(LC-|CC\s)/.test(m.section)
    const g = gen.get(m.id), app = m.strengthRatio ?? m.ratio
    const status = unsupported ? 'cold-formed-not-checked' : g === undefined ? 'missing' : m.issues?.some((i) => i.level === 'blocked') ? 'outside-applicability' : m.role === 'purlin' || m.role === 'girt' ? 'different-demand-envelope' : 'matched'
    return { id: m.id, role: m.role, section: m.section, status, appStrength: app, appOverall: m.ratio, genStrength: g ?? null, delta: g === undefined ? null : app - g,
      appGoverning: m.strengthGoverning ?? { combo: m.combo, eq: m.eq, part: m.part, B: m.B, Cb: m.Cb }, appOverallEquation: m.eq, lengths: m.lengths }
  })
  const matched = members.filter((m) => m.status === 'matched')
  return { genRows: gen.size, matched: matched.length, missing: members.filter((m) => m.status === 'missing').map((m) => m.id),
    unsupported: members.filter((m) => m.status === 'cold-formed-not-checked').length,
    differentDemands: members.filter((m) => m.status === 'different-demand-envelope').length,
    unexpected: [...gen.keys()].filter((id) => !design.members.some((m) => m.id === id)),
    maxAbsoluteDelta: Math.max(0, ...matched.map((m) => Math.abs(m.delta!))),
    differences: matched.filter((m) => Math.abs(m.delta!) > .05).sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!)), members,
    limitations: 'Same element and assigned effective lengths; Gen RAT versus app strength envelope. Equations, force station, B1/B2 and seismic checks can differ. Cold-formed members excluded. Other secondary members are retained as different-demand-envelope because app local C&C wind checks and sag-rod weak-axis force adjustments are not reproduced in the Gen check. Delta > 0.05 is a review flag, not an acceptance tolerance.' }
}
