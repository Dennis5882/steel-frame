/* 대만 기준 모델 정답 세트 — fixture 형식(capture-tw-golden.ts 가 쓰고 verify-tw.ts 가 읽음).
   results = 라이브 Gen 해석 결과(Map → 배열), golden = 그 결과로 계산한 설계·접합 검토 요약. */
import { fileURLToPath } from 'node:url'
import type { Results } from '../src/actions/results'
import { runConnections } from '../src/domain/connections'
import { runDesign } from '../src/domain/design'
import { buildLoadPayloads } from '../src/domain/loads'
import { buildPortal } from '../src/domain/portal'
import type { FactorySpec } from '../src/domain/types'
import { lateralSwayKr } from '../src/domain/krSway'
import { serviceNodes } from '../src/domain/resultValidation'

/** 국가별 기준 모델 fixture — TW tw-sample, CN cn-sample, KR kr-sample */
export const fixtureFor = (code: 'TW' | 'CN' | 'KR') => fileURLToPath(new URL(`./fixtures/${code.toLowerCase()}-sample.json.gz`, import.meta.url))
export const FIXTURE = fixtureFor('TW')

type Pt = [number, number, number, number, number]
export interface EncodedResults {
  beam: [number, [string, Pt[]][]][]
  truss: [number, [string, number][]][]
  sway: [string, Results['sway'] extends Map<string, infer V> ? V : never][]
  disp: [string, [number, { dx: number; dy: number; dz: number }][]][]
  combos: string[]
}

export const encodeResults = (r: Results): EncodedResults => ({
  beam: [...r.beam].map(([e, m]) => [e, [...m].map(([c, ps]) => [c, ps.map((p) => [p.P, p.Vy, p.Vz, p.My, p.Mz] as Pt)])]),
  truss: [...r.truss].map(([e, m]) => [e, [...m]]),
  sway: [...r.sway],
  disp: [...r.disp].map(([c, m]) => [c, [...m]]),
  combos: r.combos,
})

export const decodeResults = (r: EncodedResults): Results => ({
  beam: new Map(r.beam.map(([e, m]) => [e, new Map(m.map(([c, ps]) => [c, ps.map(([P, Vy, Vz, My, Mz]) => ({ P, Vy, Vz, My, Mz }))]))])),
  truss: new Map(r.truss.map(([e, m]) => [e, new Map(m)])),
  sway: new Map(structuredClone(r.sway)),
  disp: new Map(r.disp.map(([c, m]) => [c, new Map(m.map(([id, d]) => [id, { ...d }]))])),
  combos: [...r.combos],
})

const r6 = (x: number) => Math.round(x * 1e6) / 1e6

/** 정답 — 부재별 강도비·지배 조합·식, 사용성, 접합(치수·항목별 비) */
export function golden(spec: FactorySpec, res: Results) {
  const model = buildPortal(spec)
  const info = buildLoadPayloads(spec, model).info
  if (spec.code === 'KR') lateralSwayKr(res, serviceNodes(spec, model).tops.map((n) => n.id), info.seismic)
  const d = runDesign(spec, model, info, res)
  const cs = runConnections(spec, model, info, res)
  return {
    summary: {
      maxRatio: r6(d.maxRatio), ng: d.ng,
      byRole: Object.fromEntries(Object.entries(d.byRole).map(([k, m]) => [k, { section: m!.section, ratio: r6(m!.ratio), elem: m!.id, combo: m!.combo, eq: m!.eq }])),
      service: d.service.map((s) => ({ key: s.key, ratio: r6(s.ratio) })),
      conns: cs.map((c) => ({ type: c.type, ratio: r6(c.ratio) })),
    },
    members: d.members.map((m) => [m.id, r6(m.ratio), m.combo, m.eq] as const),
    conns: cs.map((c) => ({ type: c.type, elem: c.elem, combo: c.combo, dims: c.dims, checks: c.checks.map((k) => [k.item, r6(k.ratio)] as const) })),
  }
}
export type Golden = ReturnType<typeof golden>
