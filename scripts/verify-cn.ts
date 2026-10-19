import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CN, cnStrength } from '../src/codes/cn'
import { muZ, spectrum, effectiveWidth, roofShape } from '../src/codes/cnLateral'
import { bucklingPhi, cnCapacity, cnCheck } from '../src/codes/cnSteel'
import { coldPhi } from '../src/codes/cnColdTable'
import { CN_DEFAULT_SPEC, DEFAULT_SPEC } from '../src/domain/types'
import { buildPortal } from '../src/domain/portal'
import { buildGenPayloads } from '../src/domain/gen'
import { buildLoadPayloads } from '../src/domain/loads'
import { sectionProps } from '../src/domain/sections'
import { CN_CATALOG } from '../src/domain/cnCatalog'
import { frictionBolt, tensileArea } from '../src/domain/cnConnections'
import { validateCnSpec, snowShapeCN } from '../src/domain/cnLoads'
import { ccRoofCN, ccWallCN, edgeACN, effAreaCN, leanEtaCN, mwLongCN, mwTransCN, slenderLimitCN, verticalRatioCN, zone2LenCN } from '../src/codes/cnPortal'
import { cnCCLoads } from '../src/domain/cnSecondary'
import { portalGeometry } from '../src/domain/portal'

const near = (a: number, b: number, tol = 1e-8) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`)
// Independent tabulated anchors: GB 50017 table 4.4.1, D.0.1/D.0.2.
assert.deepEqual(cnStrength('Q235B', 16), { fy: 235, f: 215, fv: 125, fu: 370 })
assert.equal(cnStrength('Q235B', 16.01).f, 205)
assert.equal(cnStrength('Q345B', 40).f, 295)
assert.equal(cnStrength('Q345B', 40.01).f, 290)
near(bucklingPhi(100, 235, 206000, 'a'), .637, .001)
near(bucklingPhi(100, 235, 206000, 'b'), .555, .001)
near(bucklingPhi(50, 235, 206000, 'b'), .856, .001)
near(coldPhi(100), .588); near(coldPhi(150), .308)
near(muZ(10, 'A'), 1.28); near(muZ(10, 'B'), 1); near(muZ(20, 'C'), .74)
near(spectrum(.1, .08, .35, .05), .08)
near(spectrum(.35, .08, .35, .05), .08)
near(spectrum(1.75, .08, .35, .05), .08 * .2 ** .9)
near(roofShape(15), -.6); near(roofShape(60), .8)
assert.ok(effectiveWidth(200, 2, 205, 4) < effectiveWidth(200, 3, 205, 4))
near(frictionBolt(24).tension, 180); near(frictionBolt(24).shear, 81)
assert.ok(tensileArea(24) > 350 && tensileArea(24) < 355)
const unbraced = cnCapacity(sectionProps('HN 300x150x6.5/9'), 'Q235B', { KLx: 6000, KLy: 6000, Lb: 6000 })
assert.ok(unbraced.phiMnx < unbraced.elasticX)
assert.ok(cnCheck(unbraced, { P: 0, Mx: unbraced.phiMnx, My: 0, V: 0 }).ratio >= 1)
const spec = structuredClone(CN_DEFAULT_SPEC), model = buildPortal(spec)
const gen = buildGenPayloads(spec, model), loads = buildLoadPayloads(spec, model)
const node = new Map(model.nodes.map((n) => [n.id, n]))
const totals: Record<string, number[]> = {}
for (const [id, record] of Object.entries(loads.BMLD)) {
  const e = model.elements.find((x) => x.id === +id)!, a = node.get(e.n1)!, b = node.get(e.n2)!
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  for (const p of (record as { ITEMS: any[] }).ITEMS) { const out = totals[p.LCNAME] ??= [0, 0, 0]; out[['GX', 'GY', 'GZ'].indexOf(p.DIRECTION)] += p.P[0] * L }
}
near(-totals.LR[2], .5 * 24 * 36, .0001)
near(-totals.SN[2], .3 * 24 * 36, .0001)
for (const lc of ['EX', 'EY']) {
  const d = lc === 'EX' ? 0 : 1, sum = Object.values(loads.CNLD).reduce((s, r: any) => s + r.ITEMS.filter((x: any) => x.LCNAME === lc).reduce((a: number, x: any) => a + (d ? x.FY : x.FX), 0), 0)
  near(sum, loads.info.seismic[d ? 'Y' : 'X'].V, .0001)
}
const cases = new Set(Object.values(loads.STLD).map((x: any) => x.NAME))
assert.ok(!cases.has('WLX') && !cases.has('ETX'))
for (const cb of Object.values(loads['LCOM-GEN']) as any[]) {
  assert.ok(cb.NAME.startsWith('GB '))
  for (const p of cb.vCOMB) assert.ok(cases.has(p.LCNAME), p.LCNAME)
  if (cb.vCOMB.some((x: any) => x.LCNAME.startsWith('E'))) for (const p of cb.vCOMB.filter((x: any) => x.LCNAME.startsWith('E'))) near(Math.abs(p.FACTOR), 1.4)
}
for (const list of Object.values(CN_CATALOG)) for (const name of list) {
  const s = sectionProps(name); assert.ok(s.A > 0 && Number.isFinite(s.Ix) && s.Ix > 0, name)
}
for (const x of Object.values(gen.SECT) as any[]) assert.equal(x.SECT_BEFORE.SECT_I.DB_NAME, CN.gen.sectionDbOf!(x.SECT_BEFORE.SECT_I.SECT_NAME))
for (const e of model.elements) assert.equal((gen.ELEM[e.id] as any).MATL, ['purlin', 'girt'].includes(e.role) ? 2 : 1)
const twModel = buildPortal(DEFAULT_SPEC), tw = buildLoadPayloads(DEFAULT_SPEC, twModel)
// Country-specific bracing must not silently move the Taiwan frame bracing.
const wallBays = (m: typeof model) => [...new Set(m.elements.filter((e) => e.role === 'brace' && e.face !== 'roof').map((e) => Math.min(...[e.n1, e.n2].map((id) => m.nodes.find((n) => n.id === id)!.y)) / 6))].sort()
assert.deepEqual(wallBays(model), [2])
assert.deepEqual(wallBays(twModel), [1, 4])
// GB 51022-2015 (2026-10-16): 표 4.2.2-1·2 원본 이미지 대조값, 보간, 가장자리 폭, 외장재 면적식
near(mwTransCN(0, '+i', '1E'), .43); near(mwTransCN(10.5, '-i', '4'), -.15); near(mwTransCN(20, '+i', '3E'), -.87); near(mwTransCN(40, '-i', '2'), .39)
near(mwTransCN(7.75, '+i', '1'), .24); near(mwTransCN(25, '+i', '2'), (-.87 + .03) / 2); near(mwLongCN('-i', '1E'), .79); near(mwLongCN('+i', '5'), -.63)
near(edgeACN(24, 8.6), 2.4); near(edgeACN(10, 2), 1); near(zone2LenCN(-.87, 24, 8.6, 24), 12); near(zone2LenCN(-.87, 36, 3, 36), 7.5)
near(ccRoofCN('gable', 5, '3', 1).neg, -2.98); near(ccRoofCN('gable', 5, '3', 10).neg, -1.28); near(ccRoofCN('gable', 5, '3', Math.sqrt(10)).neg, -2.13)
near(ccRoofCN('gable', 10, '1', 20).neg, -1.08); near(ccRoofCN('gable', 10, '1', 20).pos, .48) // 경계 각: 4a·4d 불리한 값
near(ccRoofCN('multi', 20, '2', 10).neg, -1.88); near(ccRoofCN('mono', 6, "3'", 1).neg, -2.78); near(ccRoofCN('mono', 2, '1', 10).neg, -1.08)
near(ccWallCN('5', 50).neg, -.98); near(ccWallCN('5', Math.sqrt(50)).neg, -1.28); near(ccWallCN('4', 1).pos, 1.18); near(effAreaCN(6, 1.5), 12)
near(verticalRatioCN(.12), 0); near(verticalRatioCN(.16), .1); near(verticalRatioCN(.24), .15); near(verticalRatioCN(.32), .2)
near(leanEtaCN(10, 10), Math.sqrt(1 + 1 / 1.1)); near(leanEtaCN(0, 5), 1)
assert.equal(slenderLimitCN(true, true), 180); assert.equal(slenderLimitCN(false, true), 220); assert.equal(slenderLimitCN(false, false), 400)
{ // 기본 모델 하중 적용 — 손계산 β·μw·μz·w0 (h 8.6 m < 10 → μz(10) = 1.0, qF = 1.1 × 0.45)
  const G = portalGeometry(spec), qF = 1.1 * .45, deg = Math.atan(.1) * 180 / Math.PI, cos = Math.cos(Math.atan(.1))
  near(loads.info.wind.qh, .45); near(loads.info.cn!.endZone, 4.8)
  const bm = (id: number, lc: string, dir: string) => ((loads.BMLD[id] as any)?.ITEMS ?? []).filter((x: any) => x.LCNAME === lc && x.DIRECTION === dir).reduce((a: number, x: any) => a + x.P[0], 0)
  const mid = (e: typeof model.elements[number]) => (node.get(e.n1)!.y + node.get(e.n2)!.y) / 2
  const girt = (y: number) => model.elements.find((e) => e.role === 'girt' && e.face === 'x0' && Math.abs(mid(e) - y) < .01)!
  near(bm(girt(15).id, 'WX1', 'GX'), qF * mwTransCN(deg, '+i', '1') * G.gWallAt(0), 1e-9) // 가운데 베이 = 1
  near(bm(girt(3).id, 'WX1', 'GX'), qF * mwTransCN(deg, '+i', '1E') * G.gWallAt(0), 1e-9) // 끝 베이 (중점 3 m < 2a 4.8) = 1E
  near(bm(girt(15).id, 'WX2', 'GX'), qF * mwTransCN(deg, '-i', '1') * G.gWallAt(0), 1e-9)
  near(bm(girt(15).id, 'WY1', 'GX'), qF * mwLongCN('+i', '5') * G.gWallAt(0), 1e-9) // 종방향 측벽 5 (−0.63 흡인 → −X)
  const xIn = G.xs.find((x) => x > 4.8 + 1e-6 && x < 12 - 1e-6)!
  const pur = model.elements.find((e) => e.role === 'purlin' && Math.abs(node.get(e.n1)!.x - xIn) < 1e-9 && Math.abs(mid(e) - 15) < .01)!
  near(bm(pur.id, 'WX1', 'GZ'), -qF * mwTransCN(deg, '+i', '2') * G.sRoof * cos, 1e-9) // 풍상 경사면 2
  near(bm(pur.id, 'WY1', 'GZ'), -qF * mwLongCN('+i', '2') * G.sRoof * cos, 1e-9) // 종방향 y 15 < L/2 = 18, x > 2a → 2
}
{ // 적설 (표 4.3.2): 쌍坡 0.75/1.25 는 모든 경사, 합계 = 균일, 반경간 = 절반, 1.3D+1.5S 에만
  for (const n of ['SN1', 'SN2', 'SH1', 'SH2']) assert.ok(cases.has(n), n)
  near(-totals.SN1[2], .3 * 24 * 36, 1e-6); near(-totals.SH1[2], .3 * 24 * 36 / 2, 1e-6)
  const sh = (Object.values(loads['LCOM-GEN']) as any[]).filter((c) => c.vCOMB.some((p: any) => p.LCNAME === 'SH1'))
  assert.equal(sh.length, 1); assert.deepEqual(sh[0].vCOMB.map((p: any) => [p.LCNAME, p.FACTOR]), [['D', 1.3], ['SH1', 1.5]])
  near(loads.info.snowPeak!, .3 * 1.25)
  const mSpec = { ...spec, frame: 'multi' as const, spanList: [24, 24], span: 48 }, mModel = buildPortal(mSpec), mLoads = buildLoadPayloads(mSpec, mModel)
  const mt: Record<string, number> = {}
  for (const [id, r] of Object.entries(mLoads.BMLD)) { const e = mModel.elements.find((x) => x.id === +id)!, a = mModel.nodes.find((n) => n.id === e.n1)!, b = mModel.nodes.find((n) => n.id === e.n2)!; for (const p of (r as any).ITEMS) if (p.DIRECTION === 'GZ') mt[p.LCNAME] = (mt[p.LCNAME] ?? 0) - p.P[0] * Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) }
  const plane = 12 * 36 * .3 // 지붕면 투영 면적 × s0
  near(mt.SN, 4 * plane, 1e-6); near(mt.SV1, plane * (2 + 2 * 1.4), 1e-6); near(mt.SV2, plane * (2 + 2 * 1.5), 1e-6)
  assert.ok(!('SN1' in mt) && mt.SH4 > 0)
  near(snowShapeCN(mSpec).peak, 2)
  assert.ok(!snowShapeCN({ ...mSpec, roofSlope: .05 }).cases.some((c) => c.name.startsWith('SV'))) // 경사 ≤ 1/20 → 골 적설 없음 (주 1)
  const mono = { ...spec, frame: 'mono' as const }, monoL = buildLoadPayloads(mono, buildPortal(mono))
  assert.ok(!Object.values(monoL.STLD).some((x: any) => x.NAME === 'SN1') && Object.values(monoL.STLD).some((x: any) => x.NAME === 'SH2'))
}
{ // 4.4.2-3 수직지진 (8도 0.20g → 10%) + GB 55002 조합, 이전 차단 해제
  const v = { ...spec, span: 30, china: { ...spec.china!, alphaMax: .16 } }
  validateCnSpec(v)
  const vl = buildLoadPayloads(v, buildPortal(v))
  const fz = Object.values(vl.CNLD).reduce((s, r: any) => s + r.ITEMS.filter((x: any) => x.LCNAME === 'EV').reduce((a: number, x: any) => a + x.FZ, 0), 0)
  near(fz, -.1 * vl.info.seismic.W, 1e-6)
  const ev = (Object.values(vl['LCOM-GEN']) as any[]).filter((c) => c.vCOMB.some((p: any) => p.LCNAME === 'EV'))
  assert.equal(ev.length, 10)
  assert.ok(ev.some((c) => c.vCOMB.some((p: any) => p.LCNAME === 'EV' && p.FACTOR === 1.4)) && ev.some((c) => c.vCOMB.some((p: any) => p.LCNAME === 'EV' && p.FACTOR === .5)))
  assert.ok((Object.values(vl['LCOM-GEN']) as any[]).every((c) => c.NAME.length <= 20), 'Gen combo name ≤ 20')
  assert.ok(!Object.values(loads.STLD).some((x: any) => x.NAME === 'EV'))
}
{ // 외장재 (표 4.2.2-3·4a): 가운데 퍼린 zone 1, A = 6 × max(s, 2), β 1.5 / 모서리 퍼린 zone 3
  const cc = cnCCLoads(spec, model, loads.info), G = portalGeometry(spec)
  const xIn = G.xs.find((x) => x > 2.4 + 1e-6 && x < 12 - 2.4)!
  const pur = model.elements.find((e) => e.role === 'purlin' && Math.abs(node.get(e.n1)!.x - xIn) < 1e-9 && Math.min(node.get(e.n1)!.y, node.get(e.n2)!.y) === 12)!
  const c1 = cc.get(pur.id)!
  assert.equal(c1.zone, '1'); near(c1.A, 6 * Math.max(G.sRoof, 2)); near(c1.pNeg, 1.5 * .45 * ccRoofCN('gable', Math.atan(.1) * 180 / Math.PI, '1', c1.A).neg)
  const corner = model.elements.find((e) => e.role === 'purlin' && Math.abs(node.get(e.n1)!.x - G.xs[1]) < 1e-9 && Math.min(node.get(e.n1)!.y, node.get(e.n2)!.y) === 0)!
  assert.equal(cc.get(corner.id)!.zone, '3')
}
assert.throws(() => validateCnSpec({ ...spec, eaveHeight: 17.5, roofSlope: .2 }), /≤18 m/)
assert.throws(() => validateCnSpec({ ...spec, span: 8, eaveHeight: 9 }), /height\/width/)
assert.throws(() => validateCnSpec({ ...spec, frame: 'mono', span: 12, roofSlope: .6, eaveHeight: 4 }), /< 30°/)
assert.throws(() => validateCnSpec({ ...spec, bays: 16 }), /90 m/)
assert.throws(() => validateCnSpec({ ...spec, wind: { ...spec.wind, enclosure: 'partial' } }), /closed buildings/)
const steepSnow = buildLoadPayloads({ ...spec, roofSlope: Math.tan(37 * Math.PI / 180) }, buildPortal({ ...spec, roofSlope: Math.tan(37 * Math.PI / 180) }))
near(steepSnow.info.snow!, .3 * .64)
const uneven = buildLoadPayloads({ ...spec, roofSlope: Math.tan(25 * Math.PI / 180) }, buildPortal({ ...spec, roofSlope: Math.tan(25 * Math.PI / 180) }))
assert.ok(Object.values(uneven.STLD).some((x: any) => x.NAME === 'SN1'))
assert.ok(Object.values(uneven.STLD).some((x: any) => x.NAME === 'SN2'))
assert.equal(Object.keys(tw.STLD).length, 15)
assert.equal(Object.keys(tw['LCOM-GEN']).length, 55)
assert.ok(Object.values(tw['LCOM-GEN']).every((x: any) => x.NAME.startsWith('LRFD')))
const path = join(tmpdir(), 'smart-midas-cn-live.json')
writeFileSync(path, JSON.stringify({ spec, model, gen, loads, totals }))
console.log(JSON.stringify({ checks: 'passed', nodes: model.nodes.length, elements: model.elements.length, cases: cases.size, combos: Object.keys(loads['LCOM-GEN']).length, LR: -totals.LR[2], snow: -totals.SN[2], fixture: path }, null, 2))
