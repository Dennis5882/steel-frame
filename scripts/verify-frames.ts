/* 횡단면 형식 회귀 — 단경간 편경사(frame 'mono'). 박공은 TW/CN 정답 세트가 지킨다.
   형상(마루 없음·높은 처마·기둥/거트 높이·지붕 가새 2패널), 하중 평형(LR·지진), 양방향 X 풍(TW WX5~8),
   CN 적설 불균형 없음, 적용범위(높은 처마·TW 경고), 입력 충돌. 실행: node --import tsx scripts/verify-frames.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
import assert from 'node:assert/strict'
const { DEFAULT_SPEC, CN_DEFAULT_SPEC } = await import('../src/domain/types')
const { buildPortal, portalGeometry } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
const { buildGenPayloads } = await import('../src/domain/gen')
const { checkScope } = await import('../src/domain/scope')
const { fieldConflicts, initVals, toSpec } = await import('../src/components/planFields')

let n = 0
const ok = (c: boolean, what: string) => { n++; assert.ok(c, what) }
const near = (a: number, b: number, tol: number, what: string) => { n++; assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`) }

function totals(spec: any, model: any, loads: any) {
  const node = new Map(model.nodes.map((x: any) => [x.id, x]))
  const out: Record<string, number[]> = {}
  for (const [id, rec] of Object.entries(loads.BMLD)) {
    const e = model.elements.find((x: any) => x.id === +id)!, a: any = node.get(e.n1)!, b: any = node.get(e.n2)!
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    for (const p of (rec as { ITEMS: any[] }).ITEMS) { const o = (out[p.LCNAME] ??= [0, 0, 0]); o[['GX', 'GY', 'GZ'].indexOf(p.DIRECTION)] += p.P[0] * L }
  }
  return out
}

for (const base of [DEFAULT_SPEC, CN_DEFAULT_SPEC]) {
  const code = base.code
  const spec = { ...structuredClone(base), frame: 'mono' as const }
  const G = portalGeometry(spec), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
  const high = spec.eaveHeight + spec.span * spec.roofSlope
  /* 형상 */
  ok(G.ridges.length === 0 && G.planes.length === 1 && G.planes[0].rising, `${code} mono: one rising plane, no ridge`)
  near(G.ridgeZ, high, 1e-12, `${code} mono: high eave = eave + span·slope`)
  near(G.rafterLen, Math.hypot(spec.span, spec.span * spec.roofSlope), 1e-12, `${code} mono: rafter length = full slope`)
  near(G.hMean, spec.eaveHeight + spec.span * spec.roofSlope / 2, 1e-12, `${code} mono: mean roof height = mid-span`)
  const tops = model.nodes.filter((p) => p.y === 0 && (p.x === 0 || p.x === spec.span)).reduce((m, p) => ({ ...m, [p.x]: Math.max(m[p.x] ?? 0, p.z) }), {} as Record<number, number>)
  near(tops[0], spec.eaveHeight, 1e-12, `${code} mono: low column top`)
  near(tops[spec.span], high, 1e-12, `${code} mono: high column top`)
  ok(G.girtZsAt(spec.span).length > G.girtZs.length, `${code} mono: high wall has more girt rows (${G.girtZsAt(spec.span).length} > ${G.girtZs.length})`)
  const ids = new Set<string>()
  ok(model.elements.every((e) => e.n1 !== e.n2 && !ids.has(`${Math.min(e.n1, e.n2)}-${Math.max(e.n1, e.n2)}`) && ids.add(`${Math.min(e.n1, e.n2)}-${Math.max(e.n1, e.n2)}`)), `${code} mono: no zero-length or duplicate elements`)
  /* 안정성: 지점이 아닌 절점은 모두 주부재(기둥·지붕보·풍주)에 걸려야 한다 — 2차부재는 양단 핀이라 2차부재만 모이면 메커니즘
     (라이브 2026-10-16: 편경사 박공 거트 끝이 낮은 기둥에 절점 없이 떠서 강도비 13,895) */
  for (const s of [spec, base]) {
    const m = buildPortal(s)
    const primary = new Set(m.elements.filter((e) => e.role === 'column' || e.role === 'rafter' || e.role === 'post').flatMap((e) => [e.n1, e.n2]))
    const loose = m.nodes.filter((p) => p.z > 0 && !primary.has(p.id))
    ok(loose.length === 0, `${code} ${s.frame ?? 'gable'}: every non-support node is on a primary member (loose: ${loose.slice(0, 3).map((p) => `${p.x},${p.y},${p.z}`).join(' ')})`)
  }
  const roofBraces = model.elements.filter((e) => e.role === 'brace' && e.face === 'roof')
  const node = new Map(model.nodes.map((p) => [p.id, p]))
  ok(roofBraces.every((e) => Math.abs(node.get(e.n1)!.x - node.get(e.n2)!.x) <= spec.span / 2 + 1e-9), `${code} mono: roof X braces split at mid-span (≤ span/2 wide)`)
  ok(model.nodes.filter(G.isDeflNode).length > 0 && model.nodes.filter(G.isRidgeNode).length === 0, `${code} mono: deflection nodes at mid-span, no ridge nodes`)
  /* Gen 페이로드 생성 */
  const gp = buildGenPayloads(spec, model)
  ok(Object.keys(gp.ELEM).length === model.elements.length, `${code} mono: Gen ELEM payload`)
  /* 하중 평형 */
  const tot = totals(spec, model, loads)
  const BL = spec.span * spec.bays * spec.baySpacing
  near(-tot.LR[2], loads.info.roofLive * BL, 1e-9, `${code} mono: LR total = q·B·L`)
  for (const lc of ['EX', 'EY'] as const) {
    const dir = lc === 'EX' ? 'FX' : 'FY'
    const s = Object.values(loads.CNLD).reduce((a: number, rec: any) => a + rec.ITEMS.filter((x: any) => x.LCNAME === lc).reduce((b: number, x: any) => b + x[dir], 0), 0)
    near(s, loads.info.seismic[lc === 'EX' ? 'X' : 'Y'].V, 1e-9, `${code} mono: ${lc} nodal sum = V`)
  }
  const cases = Object.values(loads.STLD).map((c: any) => c.NAME)
  if (code === 'TW') {
    /* 비대칭 → 반대 방향 X 풍(WX5~8) 추가, 방향 반대 */
    ok(['WX5', 'WX6', 'WX7', 'WX8'].every((c) => cases.includes(c)), 'TW mono: wind from the high side WX5–8')
    ok(tot.WX1[0] > 0 && tot.WX5[0] < 0, `TW mono: WX1 pushes +X (${tot.WX1[0].toFixed(1)}), WX5 pushes −X (${tot.WX5[0].toFixed(1)})`)
    const names = Object.values(loads['LCOM-GEN']).map((c: any) => c.NAME as string)
    ok(names.some((x) => x.includes('+EX-T')) && names.some((x) => x.includes('WY1-L')), 'TW mono: opposite-sign torsion and −X across-wind combinations')
    const gable = buildLoadPayloads(DEFAULT_SPEC, buildPortal(DEFAULT_SPEC))
    ok(!Object.values(gable.STLD).some((c: any) => c.NAME === 'WX5'), 'TW gable: unchanged (no WX5)')
  } else {
    /* GB 51022 표 4.3.2 항 1: 단坡는 균일(+ 반경간 4.3.5) — 불균형 SN1/SN2 없음 */
    const steep = { ...spec, span: 12, eaveHeight: 6, roofSlope: 0.5, china: { ...spec.china!, snow: 0.5 } } // 높은 처마 12 m
    const sl = buildLoadPayloads(steep, buildPortal(steep))
    const sc = Object.values(sl.STLD).map((c: any) => c.NAME)
    ok(sc.includes('SN') && !sc.includes('SN1'), 'CN mono 26.6°: uniform snow only (no SN1/SN2)')
    const gs = { ...structuredClone(CN_DEFAULT_SPEC), roofSlope: 0.5, china: { ...CN_DEFAULT_SPEC.china!, snow: 0.5 } }
    ok(Object.values(buildLoadPayloads(gs, buildPortal(gs)).STLD).some((c: any) => c.NAME === 'SN1'), 'CN gable 26.6°: unbalanced snow kept')
    /* 양방향 풍: GB 51022 그림 4.2.2-1(b) — 편坡도 풍상 B/2 = 2구역, 나머지 3구역 (양방향 케이스) */
    ok(tot.WX1[0] > 0 && tot.WX3[0] < 0, 'CN mono: both wind directions')
  }
  /* 적용범위 */
  const sc = checkScope(spec)
  ok(!sc.blocked && sc.issues.some((i) => i.key === 'monoTW') === (code === 'TW'), `${code} mono: in scope, TW warns about wind interpretation`)
  const tall = { ...spec, eaveHeight: 16, span: 30, roofSlope: 0.1 }
  ok(checkScope(tall).issues.some((i) => i.key === 'eaveHigh' && i.level === 'block'), `${code} mono: high eave 19 m > 18 blocked`)
  ok(!checkScope({ ...tall, frame: 'gable' }).blocked, `${code} gable same dims: eave 16 m allowed`)
  /* 입력 충돌 — 높은 처마는 경사 칸 오류 */
  const vals = { ...initVals(tall), frame: 'mono' }
  const cf = fieldConflicts(toSpec(tall, vals, false), vals, false)
  ok(cf.length === 1 && cf[0].field.path === 'roofSlope' && cf[0].text.includes('19'), `${code} mono: high-eave conflict on roof slope (${cf[0]?.text})`)
  ok(initVals(base).frame === 'gable' && toSpec(base, initVals(base), false).frame === 'gable', `${code}: frame field defaults to gable`)
}
/* ── 다경간 박공 ── */
const { quantities } = await import('../src/domain/quantities')
const { normalizeSpans } = await import('../src/domain/types')
for (const base of [DEFAULT_SPEC, CN_DEFAULT_SPEC]) {
  const code = base.code
  const spec = normalizeSpans({ ...structuredClone(base), frame: 'multi' as const, spanList: [24, 24] })
  const G = portalGeometry(spec), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
  ok(spec.span === 48, `${code} multi: span = sum of spans`)
  ok(G.ridges.join() === '12,36' && G.valleys.join() === '24' && G.planes.length === 4 && G.symmetric, `${code} multi: ridges 12/36, valley 24, 4 planes, symmetric`)
  const node = new Map(model.nodes.map((p) => [p.id, p]))
  const lean = model.elements.filter((e) => e.lean)
  ok(lean.length > 0 && lean.every((e) => e.role === 'column' && node.get(e.n1)!.x === 24), `${code} multi: leaning columns on the valley line (${lean.length})`)
  const gp = buildGenPayloads(spec, model)
  const leanTops = lean.filter((e) => !lean.some((o) => o.n1 === e.n2))
  ok(leanTops.every((e) => (gp.FRLS[e.id] as any)?.ITEMS[0].FLAG_J === '0000110'), `${code} multi: leaning column tops released (pinned)`)
  ok(lean.filter((e) => node.get(e.n1)!.z === 0).every((e) => (gp.CONS[e.n1] as any).ITEMS[0].CONSTRAINT === '1110000'), `${code} multi: leaning column bases pinned`)
  const primary = new Set(model.elements.filter((e) => e.role === 'column' || e.role === 'rafter' || e.role === 'post').flatMap((e) => [e.n1, e.n2]))
  ok(model.nodes.every((p) => p.z === 0 || primary.has(p.id)), `${code} multi: every non-support node on a primary member`)
  ok(model.elements.filter((e) => e.role === 'strut' && node.get(e.n1)!.x === 24).length === spec.bays, `${code} multi: valley strut line`)
  const tot = totals(spec, model, loads)
  near(-tot.LR[2], loads.info.roofLive * spec.span * spec.bays * spec.baySpacing, 1e-9, `${code} multi: LR total = q·B·L`)
  for (const lc of ['EX', 'EY'] as const) {
    const dir = lc === 'EX' ? 'FX' : 'FY'
    const sm = Object.values(loads.CNLD).reduce((a: number, rec: any) => a + rec.ITEMS.filter((x: any) => x.LCNAME === lc).reduce((b: number, x: any) => b + x[dir], 0), 0)
    near(sm, loads.info.seismic[lc === 'EX' ? 'X' : 'Y'].V, 1e-9, `${code} multi: ${lc} nodal sum = V`)
  }
  const cases = Object.values(loads.STLD).map((c: any) => c.NAME)
  ok(!cases.includes('WX5'), `${code} multi equal spans: symmetric → no mirrored wind`)
  const uneq = normalizeSpans({ ...spec, spanList: [24, 18] })
  const uc = Object.values(buildLoadPayloads(uneq, buildPortal(uneq)).STLD).map((c: any) => c.NAME)
  ok(code === 'CN' || uc.includes('WX5'), `${code} multi unequal spans: mirrored X wind (TW)`)
  /* 물량: 주각 = 기둥 3열 × 프레임, 마루 = 2 × 프레임 */
  const frames = spec.bays + 1
  const conn = (type: string, kind: string) => ({ type, ratio: 0.5, checks: [], notes: [], dims: {}, parts: { plates: [{ part: 'plate', width: 400, length: 500, thickness: 30, count: 1, estimated: false }], fasteners: [{ kind, diameter: 24, count: 4 }] } }) as any
  const q = quantities(spec, model, [conn('base', 'anchor'), conn('apex', 'bolt')])
  ok(q.plates.filter((r) => r.type === 'base').every((r) => r.conns === 3 * frames) && q.plates.filter((r) => r.type === 'apex').every((r) => r.conns === 2 * frames), `${code} multi: connection counts base ${3 * frames}, apex ${2 * frames}`)
  /* 적용범위·입력 */
  const sc = checkScope({ ...spec, features: { crane: false, mezzanine: false, multiSpan: true, opening: false } })
  ok(!sc.blocked && sc.issues.some((i) => i.key === 'multi') && sc.issues.some((i) => i.key === 'multiTW') === (code === 'TW'), `${code} multi: in scope with multi-span flag, warnings`)
  ok(checkScope({ ...spec, features: { crane: true, mezzanine: false, multiSpan: false, opening: false } }).issues.some((i) => i.key === 'additionInput' && i.level === 'block'), `${code} multi + crane: blocked until crane inputs are supplied and confirmed`)
  ok(checkScope(normalizeSpans({ ...spec, spanList: [36, 30] })).blocked === false && checkScope(normalizeSpans({ ...spec, spanList: [62, 24] })).blocked, `${code} multi: span limit per span (66 total ok, 62 single blocked)`)
  const vals = { ...initVals(base), frame: 'multi', spanList: '24, 30' }
  const sp2 = toSpec(base, vals, false)
  ok(sp2.frame === 'multi' && sp2.span === 54 && sp2.spanList?.join() === '24,30', `${code} multi: card → span 54 from 24 + 30`)
  const v3 = { ...initVals(base), frame: 'multi', spanList: '24, 70' }
  const cf = fieldConflicts(toSpec(base, v3, false), v3, false)
  ok(cf.some((c) => c.field.path === 'spanList'), `${code} multi: 70 m span conflict on the span list`)
}
{
  /* TW 表2.8 鋸齒狀屋頂: 4경간 = 8면, 풍상부터 D·E·D′·E′·D″·E″·D‴·E‴ → 면 4·5 = −0.5, 6·7 = −0.4, 8 = −0.3 (WX1, 면 내부 퍼린 GZ 비교) */
  const sp = normalizeSpans({ ...structuredClone(DEFAULT_SPEC), frame: 'multi' as const, spanList: [18, 18, 18, 18] })
  const G = portalGeometry(sp), m = buildPortal(sp), L = buildLoadPayloads(sp, m)
  const node = new Map(m.nodes.map((p) => [p.id, p]))
  const gz = (pl: number) => {
    const P = G.planes[pl], xm = G.xs.find((x) => x > P.xa + 1e-6 && x < P.xb - 1e-6 && !G.isRidge(x))!
    const e = m.elements.find((el) => el.role === 'purlin' && node.get(el.n1)!.x === xm && node.get(el.n1)!.y === 0)!
    return ((L.BMLD[e.id] as any).ITEMS as any[]).find((it) => it.LCNAME === 'WX1' && it.DIRECTION === 'GZ').P[0] as number
  }
  const v = Array.from({ length: 8 }, (_, i) => gz(i))
  near(v[3], v[4], 1e-12, 'TW 表2.8: E′ = D″ (−0.5)'); near(v[5], v[6], 1e-12, 'TW 表2.8: E″ = D‴ (−0.4)')
  ok(Math.abs(v[3] - v[5]) > 1e-6 && Math.abs(v[5] - v[7]) > 1e-6, `TW 表2.8: −0.5 → −0.4 → −0.3 steps (${v.map((x) => x.toFixed(3)).join(' ')})`)
  near(v[1], v[2], 1e-12, 'TW 表2.8: E = D′ (表2.5 풍하)')
}
{
  /* CN 다경간 26.6°: GB 51022 표 4.3.2 항 3 — 균일 + 골 1.4·2.0 (SV1·SV2), 불균형 SN1 없음, 적용범위 통과 */
  const steep = normalizeSpans({ ...structuredClone(CN_DEFAULT_SPEC), frame: 'multi' as const, spanList: [12, 12], eaveHeight: 6, roofSlope: 0.5, china: { ...CN_DEFAULT_SPEC.china!, snow: 0.5 } })
  const sc = Object.values(buildLoadPayloads(steep, buildPortal(steep)).STLD).map((c: any) => c.NAME)
  ok(sc.includes('SN') && sc.includes('SV1') && sc.includes('SV2') && !sc.includes('SN1') && !checkScope(steep).blocked, 'CN multi 26.6°: uniform + valley snow (GB 51022 4.3.2), not blocked')
}
console.log(`Frames: ${n} checks passed (mono-slope + multi-span + TW 表2.8: geometry, releases, loads, wind, snow, scope, quantities, inputs)`)
