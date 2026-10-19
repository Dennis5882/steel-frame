/* 스펙 입력 검증 회귀 — 기본 모델링·자유골조 공통 (planFields). 잘못된 값은 두 모드 모두 실행 차단, 기존 값으로 조용히 대체 전송 금지.
   실행: node --import tsx scripts/verify-input.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { CN_DEFAULT_SPEC, DEFAULT_SPEC, defaultSpecFor, baySpans } = await import('../src/domain/types')
const { fieldConflicts, fieldStep, initVals, invalidFields, toSpec } = await import('../src/components/planFields')
const { portalGeometry } = await import('../src/domain/portal')
const { steppedValue } = await import('../src/components/NumericInput')
const { TEMPLATES, TEMPLATE_KEYS } = await import('../src/domain/templates')

let fails = 0, n = 0
const ok = (cond: boolean, msg: string) => { n++; if (!cond) { fails++; console.log(`NG  ${msg}`) } }
const bad = (spec: typeof DEFAULT_SPEC, free: boolean, patch: Record<string, string>) => {
  const vals = { ...initVals(spec), ...patch }
  return invalidFields(toSpec(spec, vals, free), vals, free).map((f) => f.path)
}

for (const [name, spec] of [['TW', DEFAULT_SPEC], ['CN', CN_DEFAULT_SPEC]] as const) {
  for (const free of [false, true]) {
    const tag = `${name} ${free ? 'free' : 'template'}`
    ok(bad(spec, free, {}).length === 0, `${tag}: defaults valid`)
    for (const [field, v] of [['span', ''], ['span', '-24'], ['span', 'abc'], ['span', 'NaN'], ['span', 'Infinity'], ['eaveHeight', '0'], ['sagRods', '1.5'], ['sagRods', '-1'],
      ['sections.column', 'RH 400x'], ['sections.column', 'XYZ'], ['material', 'NOPE']] as const)
      ok(bad(spec, free, { [field]: v }).includes(field), `${tag}: ${field}='${v}' rejected`)
    ok(bad(spec, free, { sagRods: '0' }).length === 0, `${tag}: sagRods 0 allowed (min 0)`)
  }
  /* 기본 모델링: 베이 수 정수·간격 양수 */
  ok(bad(spec, false, { bays: '5.5' }).includes('bays'), `${name} template: bays 5.5 rejected (no silent rounding)`)
  ok(bad(spec, false, { baySpacing: '-6' }).includes('baySpacing'), `${name} template: baySpacing −6 rejected`)
  /* 자유골조: 베이 목록 */
  for (const v of ['', '6, ,x', '6, 0, 6', '6, -6', 'abc', '6;6'])
    ok(bad(spec, true, { bayList: v }).includes('bayList'), `${name} free: bayList '${v}' rejected`)
  for (const v of ['6, 6, 7.5, 7.5, 6', '6 6 6', '6，6、7.5'])
    ok(!bad(spec, true, { bayList: v }).includes('bayList'), `${name} free: bayList '${v}' accepted`)
  /* 유효 입력은 그대로 스펙에 반영 */
  const vals = { ...initVals(spec), bayList: '6, 6, 7.5, 7.5, 6', span: '27' }
  const sp = toSpec(spec, vals, true)
  ok(sp.span === 27 && sp.bays === 5 && JSON.stringify(sp.bayList) === '[6,6,7.5,7.5,6]', `${name} free: valid list → bays 5, span 27`)
}
/* TW 전용 지진·풍 / CN 전용 칸 */
ok(bad(DEFAULT_SPEC, true, { 'seismic.SDS': '-0.1' }).includes('seismic.SDS'), 'TW free: SDS −0.1 rejected')
ok(bad(DEFAULT_SPEC, true, { 'wind.exposure': 'Z' }).includes('wind.exposure'), 'TW free: exposure Z rejected')
ok(bad(CN_DEFAULT_SPEC, true, { 'china.topography': '0.5' }).includes('china.topography'), 'CN free: topography 0.5 < 0.75 rejected')
ok(bad(CN_DEFAULT_SPEC, true, { 'china.alphaMax': '0.5' }).includes('china.alphaMax'), 'CN free: αmax 0.5 not in list rejected')

/* 칸 사이 충돌 — 치수 한계·간격 과대는 해당 칸 오류 (위저드가 그 단계에서 막음) */
const cf = (spec: typeof DEFAULT_SPEC, free: boolean, patch: Record<string, string>) => {
  const vals = { ...initVals(spec), ...patch }
  return fieldConflicts(toSpec(spec, vals, free), vals, free)
}
const cfPaths = (spec: typeof DEFAULT_SPEC, free: boolean, patch: Record<string, string>) => cf(spec, free, patch).map((c) => c.field.path)
for (const [name, spec] of [['TW', DEFAULT_SPEC], ['CN', CN_DEFAULT_SPEC]] as const) {
  for (const free of [false, true]) {
    const tag = `${name} ${free ? 'free' : 'template'}`
    ok(cfPaths(spec, free, {}).length === 0, `${tag}: defaults have no conflict`)
    ok(cfPaths(spec, free, { span: '70' }).join() === 'span', `${tag}: span 70 > 60 → span`)
    ok(cfPaths(spec, free, { eaveHeight: '20' }).join() === 'eaveHeight', `${tag}: eave 20 > 18 → eaveHeight`)
    ok(cfPaths(spec, free, { roofSlope: '1.2' }).join() === 'roofSlope', `${tag}: slope 1.2 → roofSlope`)
    ok(cfPaths(spec, free, { span: '24', roofSlope: '0.1', purlinSpacing: '10' }).join() === 'purlinSpacing', `${tag}: purlin 10 m on 12.06 m rafter → purlinSpacing`)
    ok(cfPaths(spec, free, { span: '24', roofSlope: '0.1', purlinSpacing: '8' }).length === 0, `${tag}: purlin 8 m (12.06/8 = 1.51) ok`)
    ok(cfPaths(spec, free, { eaveHeight: '8', girtSpacing: '6' }).join() === 'girtSpacing', `${tag}: girt 6 m on 8 m eave → girtSpacing`)
    ok(cfPaths(spec, free, { span: '24', postSpacing: '20' }).join() === 'postSpacing', `${tag}: post 20 m on 24 m span → postSpacing`)
    ok(cfPaths(spec, free, { span: '', purlinSpacing: '100' }).length === 0, `${tag}: invalid span → field error first, no conflict`)
  }
  const [c] = cf(spec, false, { span: '24', roofSlope: '0.1', purlinSpacing: '10' })
  ok(!!c && c.text.includes('12.06') && c.text.includes('8.03'), `${name}: purlin message gives length and max (${c?.text})`)
  for (const k of TEMPLATE_KEYS) {
    const vals = { ...initVals(spec), ...Object.fromEntries(Object.entries(TEMPLATES[k]).map(([a, v]) => [a, String(v)])) }
    ok(fieldConflicts(toSpec(spec, vals, false), vals, false).length === 0, `${name}: template ${k} has no conflict`)
  }
}

// Guided modeling uses the same nonuniform geometry as free frames, with its own validation step.
for (const code of ['TW', 'CN', 'KR'] as const) {
  const base = defaultSpecFor(code)
  const vals = { ...initVals(base), bayList: '3, 4, 4, 3', bays: '', baySpacing: '' }
  const sp = toSpec(base, vals, false, true)
  ok(invalidFields(sp, vals, false, true).length === 0, `${code}: guided individual bays ignore inactive uniform inputs`)
  ok(sp.bays === 4 && sp.baySpacing === 4 && JSON.stringify(baySpans(sp)) === '[3,4,4,3]', `${code}: 4 bays, longest design span 4 m`)
  ok(portalGeometry(sp).length === 14, `${code}: individual geometry length 14 m`)
  for (const raw of ['', ', 4', '3, , 4', '3, 4,', '3, 0, 4', '3, -1, 4', '3, Infinity, 4', '3 4, 3']) {
    const badVals = { ...vals, bayList: raw }
    const draft = toSpec(base, badVals, false, true)
    const error = invalidFields(draft, badVals, false, true).find((f) => f.path === 'bayList')
    ok(!!error && fieldStep(error) === 2, `${code}: '${raw}' blocks the bays step`)
    ok(JSON.stringify(baySpans(draft)) === JSON.stringify(baySpans(base)), `${code}: invalid list never silently drops a bay`)
  }
  const uniform = toSpec(sp, { ...initVals(sp), bays: '4', baySpacing: '3.5' }, false, false)
  ok(!uniform.bayList && portalGeometry(uniform).length === 14, `${code}: switching to uniform clears the old nonuniform geometry`)
  const equal = toSpec(base, { ...vals, bayList: '3, 3, 3, 3' }, false, true)
  ok(!equal.bayList && equal.bays === 4 && equal.baySpacing === 3, `${code}: equal individual cells normalize without losing bay count`)
}

for (const [raw, direction, step, min, expected] of [
  ['3', 1, 0.1, undefined, '3.1'], ['3.1', -1, 0.1, undefined, '3'],
  ['0.1', 1, 0.01, undefined, '0.11'], ['0.045', -1, 0.001, 0.045, '0.045'],
  ['0.5', -1, 0.01, 0.5, '0.5'], ['1', -1, 1, undefined, '1'],
  ['1', -1, 1, 0, '0'], ['0', 1, 1, 0, '1'], ['0.05', -1, 0.1, undefined, '0.05'],
  ['', 1, 0.1, undefined, null], ['abc', 1, 0.1, undefined, null], ['Infinity', 1, 0.1, undefined, null],
] as const) ok(steppedValue(raw, direction, step, min) === expected, `Numeric stepping '${raw}' respects decimals, bounds and incomplete input`)

console.log(fails ? `Input validation: ${fails}/${n} failed` : `Input validation: ${n} checks passed`)
process.exit(fails ? 1 : 0)
