/* KR 합성 해석 결과 — Gen 없이 설계·계산서 경로를 시험 (verify-kr, verify-pdf). 수치는 검증값이 아니라 경로 확인용 */
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { serviceNodes } from '../src/domain/resultValidation'
import type { FactorySpec } from '../src/domain/types'
import type { Results } from '../src/actions/results'

export function krSynthetic(spec: FactorySpec) {
  const model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
  const combos = Object.values<any>(loads['LCOM-GEN']).map((c) => c.NAME as string)
  const results: Results = { beam: new Map(), truss: new Map(), sway: new Map(), disp: new Map(), combos }
  for (const e of model.elements) {
    if (e.role === 'brace') { results.truss.set(e.id, new Map(combos.map((c) => [c, -20]))); continue }
    const pts = [0, 1, 2, 3, 4].map((i) => ({ P: e.role === 'column' ? -150 : -5, Vy: 0, Vz: 10, My: (e.role === 'column' || e.role === 'rafter' ? 200 : 3) * (1 - i / 2), Mz: 0.5 }))
    results.beam.set(e.id, new Map(combos.map((c) => [c, pts])))
  }
  for (const c of combos) results.sway.set(c, { X: { sumPu: 900, drift: 0.01, sumH: 100 }, Y: { sumPu: 900, drift: 0.002, sumH: 100 } })
  const cases = Object.values<any>(loads.STLD).map((c) => c.NAME as string)
  for (const lc of cases.filter((c) => c !== 'D')) results.disp.set(lc, new Map(serviceNodes(spec, model).nodes.map((nd) => [nd.id, { dx: 0.004, dy: 0.002, dz: -0.01 }])))
  return { model, loads, results, cases, combos }
}
