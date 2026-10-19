import assert from 'node:assert/strict'
import audit from '../src/data/section-catalog-audit.json'
import { modelingSectionChoices, sectionCatalogOptions } from '../src/domain/sectionCatalog'

assert.equal(audit.entries.length, 808)
assert.equal(audit.independentTableMatches, 808)
assert.equal(audit.originalModelRestored, true)
assert.equal(new Set(audit.entries.map((r) => `${r.code}:${r.db}:${r.name}`)).size, 808)
assert.ok(audit.entries.every((r) => r.registered))
const excluded = ['RH 918x303x19x37', 'HN 550x200x10/16', 'HW 344x348x10/16', 'HW 344x354x16/16', 'CC 100x50x15x2.5', 'P 108x5.5', 'LH 125x125x3.2/4.5', 'LH 150x150x3.2/4.5']
assert.deepEqual(audit.entries.filter((r) => r.selectionStatus === 'quarantine').map((r) => r.name).sort(), excluded.sort())
for (const code of ['TW', 'CN', 'KR'] as const) {
  const material = code === 'TW' ? 'SN400B' : code === 'CN' ? 'Q235B' : 'SS275'
  for (const role of ['column', 'rafter', 'purlin', 'girt', 'brace'] as const) {
    const options = sectionCatalogOptions(code, role, material)
    assert.ok(options.every((r) => r.code === code && r.roles.includes(role) && !excluded.includes(r.name)))
    assert.ok(sectionCatalogOptions(code, role, material, false).every((r) => r.propertyStatus === 'gen-db'))
    assert.equal(sectionCatalogOptions(code, role, 'UNKNOWN').length, 0)
  }
}
assert.ok(sectionCatalogOptions('TW', 'column', 'SN400B').some((r) => r.name === 'RH 600x200x11x17' && r.selectionStatus === 'normal'))
assert.ok(sectionCatalogOptions('TW', 'brace', 'SN400B', false).length > 0)
assert.ok(sectionCatalogOptions('CN', 'purlin', 'Q345B').every((r) => r.shape !== 'CC'))
assert.ok(sectionCatalogOptions('KR', 'purlin', 'SSC275').some((r) => r.shape === 'CC' && r.materialSupport.SSC275.status === 'preliminary'))
// The picker must use Gen's actual material and preserve edits through both editor modes.
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { defaultSpecFor, ROLES } = await import('../src/domain/types')
const { initVals, toSpec, invalidFields } = await import('../src/components/planFields')
const { buildPortal } = await import('../src/domain/portal')
const { buildGenPayloads } = await import('../src/domain/gen')
for (const code of ['TW', 'CN', 'KR'] as const) {
  const base = defaultSpecFor(code), before = JSON.stringify(base)
  for (const role of ROLES) {
    const choices = modelingSectionChoices(base, role, base.sections[role])
    assert.ok(choices.options.length > 1, `${code}/${role}: multiple choices`)
    assert.ok(choices.selected, `${code}/${role}: default stays selected`)
    for (const free of [false, true]) {
      const next = choices.options.find((o) => o.name !== base.sections[role])!
      const vals = { ...initVals(base), [`sections.${role}`]: next.name }
      const spec = toSpec(base, vals, free)
      assert.equal(invalidFields(spec, vals, free).length, 0)
      assert.equal(spec.sections[role], next.name)
      const model = buildPortal(spec), payload = buildGenPayloads(spec, model)
      assert.ok(model.elements.filter((e) => e.role === role).every((e) => e.section === next.name))
      assert.ok(Object.values(payload.SECT).some((s: any) => s.SECT_BEFORE.SECT_I.SECT_NAME === next.name))
    }
    const missing = modelingSectionChoices(base, role, 'legacy custom section')
    assert.equal(missing.selected, undefined)
    assert.equal(missing.options.length, choices.options.length)
  }
  const changed = { ...base, material: Object.keys((await import('../src/codes')).profileOf(code).materials).at(-1)! }
  assert.equal(changed.sections.column, base.sections.column)
  const changedChoices = modelingSectionChoices(changed, 'column', base.sections.column)
  assert.equal(changedChoices.material, changed.material)
  assert.ok(changedChoices.options.every((o) => o.materialSupport[changed.material]?.status !== 'blocked'))
  assert.equal(changed.sections.column, base.sections.column, 'material changes retain section values')
  assert.equal(JSON.stringify(base), before, 'catalog selection never mutates input')
  for (const role of ['purlin', 'girt'] as const) {
    const legacy = { ...base, secondaryMaterial: undefined }
    assert.equal(modelingSectionChoices(legacy, role, legacy.sections[role]).material, code === 'TW' ? base.material : code === 'KR' ? 'SS275' : 'Q235B')
  }
}
const kr = defaultSpecFor('KR')
assert.equal(modelingSectionChoices(kr, 'purlin', kr.sections.purlin).material, 'SSC275')
assert.equal(modelingSectionChoices(kr, 'purlin', kr.sections.purlin).preliminary, true)
assert.equal(modelingSectionChoices({ ...kr, material: 'UNKNOWN' }, 'column', kr.sections.column).options.length, 0)
assert.equal(modelingSectionChoices(kr, 'purlin', 'LH 125x125x3.2/4.5').excluded, true)
const quarantinedVals={...initVals(kr),'sections.purlin':'LH 125x125x3.2/4.5'}
assert.ok(invalidFields(toSpec(kr,quarantinedVals,false),quarantinedVals,false).some((f)=>f.path==='sections.purlin'))
console.log('Catalog audit + modeling selection passed: 808 registrations, 8 quarantines, TW/CN/KR × 7 roles × 2 modes → model/Gen payload, material fallbacks and retained values.')
