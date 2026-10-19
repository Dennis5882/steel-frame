import './_dom-stub'
import assert from 'node:assert/strict'
import { defaultSpecFor, normalizeSpans } from '../src/domain/types'
import { portalGeometry } from '../src/domain/portal'
import { roofDeflection } from '../src/domain/roofDeflection'
import { serviceNodes } from '../src/domain/resultValidation'
import { runDesign } from '../src/domain/design'
import { runConnections } from '../src/domain/connections'
import { blockedMembers } from '../src/domain/validity'
import { memberGrade } from '../src/domain/status'
import { pickBest, type OptIter } from '../src/domain/optimize'
import { S } from '../src/state/store'
import { unavailable } from '../src/state/taskFlow'
import { initVals, toSpec, groupsFor } from '../src/components/planFields'
import { standardHoleCN, netHoleCN, effectiveWidthCN, blockTearCN, filletCN, gussetStabilityCN } from '../src/codes/cnConnection'
import { quantities } from '../src/domain/quantities'
import { krSynthetic } from './kr-synth'
import { auditKrLengths, compareKrMembers } from './kr-comparison'
import { lateralSwayKr } from '../src/domain/krSway'
import { sizeCnBrace } from '../src/domain/cnConnections'

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
for (const code of ['TW', 'KR', 'CN'] as const) {
  const spec = normalizeSpans({ ...structuredClone(defaultSpecFor(code)), frame: 'multi', spanList: [18, 30] })
  const { model, results, loads } = krSynthetic(spec), G = portalGeometry(spec)
  const nodes = serviceNodes(spec, model).nodes
  const internal = model.nodes.filter((n) => Math.abs(n.x - 18) < 1e-8 && Math.abs(n.z - G.zAt(n.x)) < 1e-8)
  assert.equal(internal.length, spec.bays + 1)
  assert.ok(internal.every((n) => nodes.some((x) => x.id === n.id)))
  // Uniform vertical translation is zero relative deflection. Tilted supports
  // (left +20, internal -20 mm) and a -100 mm short-span mid-point => 100 mm.
  for (const m of results.disp.values()) for (const v of m.values()) v.dz = 0
  results.disp.set('D', new Map(nodes.map((n) => [n.id, { dx: 0, dy: 0, dz: -.01 }])))
  const mid = model.nodes.find((n) => G.isDeflNode(n) && n.x < 18)!
  const lr = results.disp.get('LR')!
  for (const n of nodes.filter((n) => n.y === mid.y)) {
    if (n.x === 0) lr.get(n.id)!.dz = .02
    if (n.x === 18) lr.get(n.id)!.dz = -.02
  }
  lr.get(mid.id)!.dz = -.1
  const div = code === 'TW' ? 360 : code === 'KR' ? 240 : 180
  const r = roofDeflection(spec, model, results, ['LR'], div, code === 'CN')
  near(r.value, .1); near(r.limit, 18 / div); near(r.ratio, .1 / (18 / div))
  const d = runDesign(spec, model, loads.info, results)
  near(d.service.find((s) => s.key === 'rafterDefl')!.ratio, r.ratio)
  assert.ok(d.members.some((m) => m.issues?.some((i) => i.key === 'restraint')))
  const absent = { ...spec, restraints: { flyBraces: 'none', sagRods: 'none', braceCrossing: 'none' } as const }
  const da = runDesign(absent, model, loads.info, results)
  for (const role of ['column', 'rafter', 'purlin', 'girt', 'brace'] as const) {
    const a = da.members.find((m) => m.role === role)!, b = d.members.find((m) => m.id === a.id)!
    assert.ok(a.lengths.Lb >= b.lengths.Lb)
    assert.ok(a.lengths.KLy >= b.lengths.KLy)
    if (role === 'brace' && code !== 'CN') near(a.lengths.KLx, 2 * b.lengths.KLx)
  }
  const confirmed = runDesign({ ...spec, restraints: { flyBraces: 'confirmed', sagRods: 'confirmed', braceCrossing: 'confirmed' } }, model, loads.info, results)
  assert.ok(confirmed.members.every((m) => !m.issues?.some((i) => i.key === 'restraint')))
  assert.equal(toSpec(spec, initVals(spec), false).restraints, undefined)
  const id = internal[0].id; lr.delete(id)
  assert.throws(() => roofDeflection(spec, model, results, ['LR'], div), /missing displacement/)
}
assert.ok(!groupsFor('CN').flatMap((g) => g.fields).some((f) => f.path === 'restraints.braceCrossing'))
const sp = structuredClone(defaultSpecFor('KR')), syn = krSynthetic(sp)
assert.equal(memberGrade({ ratio: .8, section: 'LC-150x65x20x3.2' }).grade, 'prelim')
assert.equal(memberGrade({ ratio: 1.1, section: 'LC-150x65x20x3.2' }).grade, 'fail')
for (const v of syn.results.sway.values()) v.X = { sumPu: 900, sumH: 100, drift: .4 }
const invalid = runDesign(sp, syn.model, syn.loads.info, syn.results)
assert.ok(blockedMembers(invalid) > 0)
assert.ok(invalid.members.filter((m) => m.role === 'column').every((m) => memberGrade(m).grade === 'fail'))
assert.equal(unavailable({ ...S, built: { spec: sp } as any, design: invalid, draftSpec: null, draftInvalid: false, busy: false, confirm: null, genChanged: 0 }, 'outputs'), 'flow_invalid_design')
const cold = { ...sp, sections: { ...sp.sections, purlin: 'LC-300x60x10x1' } }, csyn = krSynthetic(cold)
const cd = runDesign(cold, csyn.model, csyn.loads.info, csyn.results)
assert.ok(cd.members.some((m) => m.issues?.some((i) => i.key === 'coldFormedRange' && i.level === 'blocked')))
const it = { it: 1, sections: sp.sections, weight: 10, plateT: 1, maxRatio: .8, svcMax: .8, ng: 0, connMax: .8, connNg: 0 } satisfies OptIter
assert.equal(pickBest([{ ...it, invalid: 1 }, { ...it, it: 2, weight: 20 }]).best.it, 2)
assert.equal(pickBest([{ ...it, invalid: 1 }]).valid, false)
near(standardHoleCN(24), 26); near(netHoleCN(24), 28); near(netHoleCN(30), 34)
assert.ok(Math.abs(effectiveWidthCN(500, 78, 234) - 267.08427) < 1e-5)
near(effectiveWidthCN(200, 78, 234), 200)
assert.throws(() => standardHoleCN(36))
near(blockTearCN(12, 50, 160, 295), (50 + 160 / Math.sqrt(3)) * 12 * 295 / 1000)
near(filletCN(6, 200, 200, 4), .7 * 6 * 188 * 200 * 4 / 1000)
near(filletCN(6, 10, 200), 0)
assert.equal(gussetStabilityCN(200, 10, 100, 345, 305).applicable, false)
assert.equal(gussetStabilityCN(200, 10, 75, 345, 305).applicable, true)
const cn = structuredClone(defaultSpecFor('CN')), cns = krSynthetic(cn)
cns.results.disp.set('D', new Map(serviceNodes(cn, cns.model).nodes.map((n) => [n.id, { dx: 0, dy: 0, dz: 0 }])))
const conns = runConnections(cn, cns.model, cns.loads.info, cns.results), brace = conns.find((c) => c.type === 'brace')!
const missingSnow = structuredClone(cns.results)
missingSnow.disp.delete('SH1')
assert.throws(() => runDesign(cn, cns.model, cns.loads.info, missingSnow), /DISPLACEMENT/)
for (const item of ['blockTear', 'gussetStability', 'netSection', 'weldBrace']) assert.ok(brace.checks.some((c) => c.item === item && Number.isFinite(c.ratio)))
assert.ok(quantities(cn, cns.model, conns).welds.some((w) => w.type === 'brace' && w.fillet > 0))
assert.ok(quantities(cn, cns.model, conns).excluded.includes('sag rods and anchors'))
const kd = runDesign(sp, syn.model, syn.loads.info, krSynthetic(sp).results)
const rows = kd.members.filter((m) => !['purlin', 'girt'].includes(m.role)).map((m) => ({ ELEM: m.id, RAT: m.strengthRatio ?? m.ratio }))
const comp = compareKrMembers(kd, rows)
near(comp.maxAbsoluteDelta, 0); assert.equal(comp.missing.length, 0)
assert.equal(compareKrMembers(kd, rows.slice(1)).missing.length, 1)
assert.throws(() => compareKrMembers(kd, [rows[0], rows[0]]), /duplicate/)
assert.throws(() => compareKrMembers(kd, []), /no steel/)
const sample = kd.members[0]
const lengthTable = { HEAD: ['MEMB', 'Ly', 'Lz', 'Lb', 'Ky', 'Kz'], DATA: [[sample.id, sample.lengths.KLx / 1000, sample.lengths.KLy / 1000, sample.lengths.Lb / 1000, 1, 1]] }
assert.equal(auditKrLengths(kd, lengthTable).checked, 1)
assert.throws(() => auditKrLengths(kd, { ...lengthTable, DATA: [[sample.id, 1, 1, 1, 1, 1]] }), /Gen/)
assert.throws(() => auditKrLengths(kd, { ...lengthTable, DATA: [] }), /no auditable/)
assert.throws(() => auditKrLengths(kd, { ...lengthTable, DATA: [...lengthTable.DATA, ...lengthTable.DATA] }), /duplicate/)
// EX/EY stiffness excludes gravity and vertical wind drift in combinations.
// Opposite-signed column responses must not cancel in a mean.
const sx = krSynthetic(sp), tops = serviceNodes(sp, sx.model).tops.map((n) => n.id), combo = sx.combos[0]
for (const id of tops) sx.results.disp.get('EX')!.get(id)!.dx = .02
sx.results.disp.get('EX')!.get(tops[0])!.dx = -.03
sx.results.sway.get(combo)!.X.drift = .4
const refs = { X: { V: 100 }, Y: { V: 120 } }
lateralSwayKr(sx.results, tops, refs)
near(sx.results.sway.get(combo)!.X.drift, .03)
near(sx.results.sway.get(combo)!.X.sumH, 100)
near(sx.results.sway.get(combo)!.X.sumPu, 900)
near(sx.results.sway.get(sx.combos[1])!.X.drift, .03)
sx.results.disp.get('EX')!.delete(tops[0])
assert.throws(() => lateralSwayKr(sx.results, tops, refs), /missing/)
assert.throws(() => lateralSwayKr(sx.results, tops, { ...refs, X: { V: 0 } }), /invalid/)
// Governing 24+24m live brace: 144.76837 kN actual force, P203x6 Q235B.
// Effective width is 393.14046 mm (22-degree spread), so PL14 stability
// is inadequate and the detailed sizing must select PL16.
const cb = sizeCnBrace({ ...cn, sections: { ...cn.sections, brace: 'P 203x6' } }, 144.76837, 1, 'live-envelope')
assert.equal(cb.parts!.plates[0].thickness, 16)
assert.ok(cb.checks.every((c) => c.ratio <= 1))
console.log('Review fixes passed: three-code unequal spans, moving supports, missing nodes, validity gates, restraint lengths, GB connections, quantities, KR element comparison')
