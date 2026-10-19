/* Regression for incomplete/corrupt analysis results, without Gen or a key.
   TW uses captured Gen results. CN uses a complete zero-response fixture to
   test validation only (not structural correctness). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { decodeResults, FIXTURE } from './tw-golden'
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { CN_DEFAULT_SPEC, KR_DEFAULT_SPEC } from '../src/domain/types'
import { runDesign } from '../src/domain/design'
import { runConnections } from '../src/domain/connections'
import { ResultValidationError, serviceNodes } from '../src/domain/resultValidation'
import type { Results } from '../src/actions/results'
import type { Built } from '../src/state/store'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { fetchResults } = await import('../src/actions/results')
const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true) // 화면 없음 — 모델 교체 확인 자동 승인
const { msgText } = await import('../src/state/ui')
const { runDesignCheck } = await import('../src/actions/design')
const { t } = await import('../src/i18n')
const { buildReport } = await import('../src/report/report')
const tw = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString())
let passed = 0, fault = ''
const zero = () => ({ P: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 })

function input(code: 'TW' | 'CN' | 'KR'): { built: Built; results: Results } {
  const spec = structuredClone(code === 'CN' ? CN_DEFAULT_SPEC : code === 'KR' ? KR_DEFAULT_SPEC : tw.spec), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
  const comboNames = Object.keys(loads.info.comboKind), cases = Object.values(loads.STLD).map((x: any) => x.NAME)
  const built = { spec, model, info: loads.info, comboNames, combos: comboNames.length, cases }
  if (code === 'TW') return { built, results: decodeResults(structuredClone(tw.results)) }
  const results: Results = { beam: new Map(), truss: new Map(), sway: new Map(), disp: new Map(), combos: comboNames }
  for (const e of model.elements) {
    if (e.role === 'brace') results.truss.set(e.id, new Map(comboNames.map((c) => [c, 0])))
    else results.beam.set(e.id, new Map(comboNames.map((c) => [c, Array.from({ length: 5 }, zero)])))
  }
  for (const c of comboNames) results.sway.set(c, { X: { sumPu: 0, drift: 0, sumH: 0 }, Y: { sumPu: 0, drift: 0, sumH: 0 } })
  for (const c of cases) results.disp.set(c, new Map(serviceNodes(spec, model).nodes.map((n) => [n.id, { dx: 0, dy: 0, dz: 0 }])))
  return { built, results }
}

for (const code of ['TW', 'CN', 'KR'] as const) {
  const cn = code === 'CN'
  let source = input(code)
  const design = () => runDesign(source.built.spec, source.built.model, source.built.info, source.results)
  assert.equal(design().members.length, source.built.model.elements.length); passed++
  const mutations: Record<string, (r: Results) => void> = {
    'missing beam': (r) => { r.beam.delete(r.beam.keys().next().value!) },
    'missing purlin with local-wind demands': (r) => { r.beam.delete(source.built.model.elements.find((e) => e.role === 'purlin')!.id) },
    'missing combo declaration': (r) => { r.combos.pop() },
    'missing beam combo': (r) => { const m = r.beam.values().next().value!; m.delete(m.keys().next().value!) },
    'missing station': (r) => { r.beam.values().next().value!.values().next().value!.pop() },
    'NaN force': (r) => { r.beam.values().next().value!.values().next().value![0].P = NaN },
    'infinite force': (r) => { r.beam.values().next().value!.values().next().value![0].My = Infinity },
    'missing brace': (r) => { r.truss.delete(r.truss.keys().next().value!) },
    'missing sway': (r) => { r.sway.clear() },
    'missing LR': (r) => { r.disp.delete('LR') },
    'missing wind node': (r) => { const c = source.built.info.wind.variants[0].parts[0].lc; r.disp.get(c)!.delete(serviceNodes(source.built.spec, source.built.model).eaves[0].id) },
    'NaN displacement': (r) => { r.disp.get('EX')!.values().next().value!.dx = NaN },
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    source = input(code); mutate(source.results)
    assert.throws(design, ResultValidationError, `${code} ${name}`); passed++
  }
  source = input(code); source.results.truss.clear()
  assert.throws(() => runConnections(source.built.spec, source.built.model, source.built.info, source.results), ResultValidationError); passed++
  source = input(code); source.results.disp.delete(cn ? 'SN' : 'ETX')
  assert.throws(design, ResultValidationError); passed++

  /* Exercise the real table parser: dropped cells/rows, station order,
     duplicate stations, missing reaction sums and partial node responses. */
  source = input(code)
  const { built, results } = source
  S.mapiKey = `offline-results-${code}`
  ;(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
    const a = JSON.parse(String(init.body)).Argument, type = a.TABLE_TYPE, name = a.TABLE_NAME
    const keys = a.NODE_ELEMS.KEYS as number[], loads = (a.LOAD_CASE_NAMES as string[]).map((c) => c.replace(/\((CB|ST)\)$/, ''))
    if (fault === 'unknown schema') return Response.json({})
    let data: unknown[][] = []
    if (type === 'BEAMFORCE') {
      for (const id of keys) for (const c of loads) for (const [i, p] of results.beam.get(id)!.get(c)!.entries()) data.push(['0', String(id), c, ['I[1]', '1/4', '2/4', '3/4', 'J[2]'][i], p.P, p.Vy, p.Vz, p.My, p.Mz])
      if (fault === 'dropped station') data.splice(1, 1)
      if (fault === 'duplicate station') data[1] = data[0]
      if (fault === 'blank force') data[0][4] = ''
      if (fault === 'reversed stations') data.reverse()
    } else if (type === 'TRUSSFORCE') {
      for (const id of keys) for (const c of loads) data.push(['0', id, c, results.truss.get(id)!.get(c), results.truss.get(id)!.get(c)])
      if (fault === 'dropped truss') data.pop()
    } else if (type === 'REACTIONG') {
      data = loads.map((c) => { const s = results.sway.get(c)!; return [c, s.X.sumH, s.Y.sumH, s.X.sumPu] })
      if (fault === 'dropped reaction') data.pop()
      return Response.json({ [name]: { SUB_TABLES: [{ 'SUMMATION OF REACTION FORCES PRINTOUT': { DATA: data } }] } })
    } else if (name === 'U') {
      for (const id of keys) for (const c of loads) { const s = results.sway.get(c)!; data.push(['0', id, c, s.X.drift, s.Y.drift, 0]) }
      if (fault === 'dropped sway node') data.pop()
    } else {
      for (const id of keys) for (const c of loads) { const v = results.disp.get(c)!.get(id)!; data.push(['0', id, c, v.dx, v.dy, v.dz]) }
      if (fault === 'dropped service node') data.pop()
    }
    return Response.json({ [name]: { HEAD: [], DATA: data } })
  }
  for (const f of ['', 'reversed stations']) {
    fault = f
    const parsed = await fetchResults(built)
    assert.deepEqual(parsed.beam, results.beam); passed++
  }
  for (const f of ['unknown schema', 'dropped station', 'duplicate station', 'blank force', 'dropped truss', 'dropped reaction', 'dropped sway node', 'dropped service node']) {
    fault = f
    await assert.rejects(() => fetchResults(built), ResultValidationError, `${code} parser ${f}`); passed++
  }
  // A failed re-check must not leave the previous successful design exportable.
  S.built = built; S.analyzed = true; S.design = design(); S.connections = []; S.opt = null
  fault = 'unknown schema'
  await runDesignCheck()
  assert.equal(S.design, null); assert.equal(S.connections, null); assert.equal(S.results, null)
  assert.ok(S.msgs.some((m) => m.kind === 'html' && msgText(m).includes(t('results_invalid', '').split('(')[0])))
  assert.equal(S.busy, false); assert.equal(S.job, null); passed++
  const report = buildReport({ built, reactions: null, design: S.design, connections: S.connections })
  assert.ok(report.includes(t('check_unavailable')))
  const status = report.split('<div class="status">')[1].split('</div>')[0]
  assert.ok(!status.includes('gr-pass')); passed++
  console.log(`${code}: complete data accepted; missing/corrupt data rejected`)
}
S.mapiKey = ''
/* 실패 문구는 현재 언어 — 문제 종류는 rv_* 키, 표 이름·요소·조합만 식별자 그대로 */
{
  const { failMsg } = await import('../src/actions/job')
  const { QuantityError } = await import('../src/domain/quantities')
  const m = failMsg(new ResultValidationError('BEAMFORCE', 'missing', '3 · LCB1'), (x) => x)
  assert.ok(m.includes(t('rv_missing')) && m.includes('BEAMFORCE · ') && !/\bmissing\b/.test(m), m); passed++
  const q = failMsg(new QuantityError('knee.stiffener'), (x) => x)
  assert.ok(q === t('q_invalid', 'knee.stiffener') && !/Invalid connection/.test(q), q); passed++
}
console.log(`Result integrity: ${passed} checks passed`)
