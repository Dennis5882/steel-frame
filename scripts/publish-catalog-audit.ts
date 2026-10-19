/** Offline evidence processing. No API requests or changes to engineering properties. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { sectionProps } from '../src/domain/sections'
import { capacity } from '../src/codes/twSteel'
import { cfCapacity } from '../src/codes/twColdFormed'
import { krCapacity } from '../src/codes/krSteel'
import { krCfCapacity } from '../src/codes/krColdFormed'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { profileOf } = await import('../src/codes')
const { cnCapacity } = await import('../src/codes/cnSteel')
const folder = process.argv[2]
if (!folder) throw new Error('Supply a completed audit directory')
const load = (file: string) => JSON.parse(readFileSync(`${folder}/${file}`, 'utf8'))
const report = load('comparison.json'), recovery = load('recovery.json'), confirmation = load('confirmation-recovery.json')
assert.ok(recovery.restored && confirmation.restored, 'Both live runs must restore the original document')
const table = load('section-table.json').CatalogAudit
const repeat = load('section-properties-repeat.json').SECTPROP
const first = load('section-properties-mm.json').SECTPROP
const byId = new Map(table.DATA.map((row: string[]) => [Number(row[1]), Object.fromEntries(table.HEAD.map((k: string, i: number) => [k, row[i]]))]))
assert.equal(table.DATA.length, report.entries.length)
let verified = 0
for (const r of report.entries) {
  const row: any = byId.get(r.id)
  assert.ok(row, `Table missing ID ${r.id}`)
  assert.deepEqual(repeat[r.id], first[r.id], `Repeat query changed ID ${r.id}`)
  for (const [metric, heading] of Object.entries({ A: 'Area', Ix: 'Iyy', Iy: 'Izz', J: 'Ixx' })) {
    const a = r.metrics[metric].gen, b = Number(row[heading])
    assert.ok(Math.abs(a - b) <= Math.max(0.000051, Math.abs(a) * 1e-12), `Independent table mismatch ${r.code} ${r.name} ${metric}`)
  }
  verified++
}
const L = { KLx: 1000, KLy: 1000, Lb: 1000 }, cfL = { Lx: 1000, Ly: 1000, Lt: 1000, Lb: 1000, Lm: 1000 }
function materialSupport(r: any) {
  const p = profileOf(r.code), sp = sectionProps(r.name)
  return Object.fromEntries(Object.entries(p.materials).map(([material, m]) => {
    const reasons: string[] = []
    try {
      const fy = p.fyAt?.(material, Math.max(sp.tw, sp.tf)) ?? m.fy
      let cap: any
      if (r.code === 'TW') {
        cap = sp.kind === 'CC' ? cfCapacity(r.name, sp, fy, m.E, cfL, 1) : capacity(sp, fy, m.E, L, 1, 0)
        reasons.push(...cap.notes.filter((n: string) => n.startsWith('TW applicability:')))
      } else if (r.code === 'KR') {
        cap = sp.kind === 'CC' ? krCfCapacity(r.name, sp, fy, cfL, 1) : krCapacity(sp, fy, L, 1)
        reasons.push(...cap.notes.filter((n: string) => n.startsWith('web slender') || n.startsWith('D/t ≥')))
      } else cap = cnCapacity(sp, material, L)
      if (cap.applicable === false) reasons.push('Cold-formed dimensional/material limits')
      const keys = sp.kind === 'CC' && r.code !== 'CN'
        ? ['phiPnc', 'phiPnt', 'phiMnxBraced', 'phiMnxLTB', 'phiMny', 'phiVn']
        : ['phiPnc', 'phiPnt', 'phiMnx', 'phiMny', 'phiVn']
      if (!keys.every((k) => Number.isFinite(cap[k]) && cap[k] > 0)) reasons.push('Nonpositive or nonfinite reference capacity')
    } catch (e) { reasons.push(e instanceof Error ? e.message : 'Unsupported calculation') }
    return [material, { status: reasons.length ? 'blocked' : sp.kind === 'CC' ? 'preliminary' : 'implemented', reasons }]
  }))
}
const entries = report.entries.map((r: any) => {
  const support = materialSupport(r)
  const reasons = []
  if (!r.registered || !r.parserSupported) reasons.push('Registration or parser not supported')
  if (r.maxDifference > 0.10) reasons.push('At least one compared property differs by more than 10%')
  if (Object.values<any>(support).every((s) => s.status === 'blocked')) reasons.push('No implemented material combination')
  const selectionStatus = reasons.length ? 'quarantine' : r.propertyStatus === 'close' ? 'normal' : 'review'
  return { code: r.code, name: r.name, db: r.db, shape: r.shape, roles: r.roles, registered: r.registered,
    propertyStatus: r.propertyStatus, selectionStatus, maxRelativeDifference: r.maxDifference,
    relativeDifferences: Object.fromEntries(Object.entries<any>(r.metrics).map(([k, v]) => [k, v.relative])), materialSupport: support, reasons }
})
const counts = Object.fromEntries(['TW', 'CN', 'KR'].map((code) => { const e = entries.filter((r: any) => r.code === code); return [code, {
  total: e.length, registered: e.filter((r: any) => r.registered).length,
  normal: e.filter((r: any) => r.selectionStatus === 'normal').length,
  review: e.filter((r: any) => r.selectionStatus === 'review').length,
  quarantine: e.filter((r: any) => r.selectionStatus === 'quarantine').length,
}] }))
const files = [...new Set(entries.map((r: any) => r.db))].map((db) => { const b = readFileSync(`E:/MIDAS PROGRAM/MIDAS GEN NX/Dbase/${db}.sdb`); return { db, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') } })
const published = { version: 1, auditedAt: report.auditedAt, scope: report.scope, comparedProperties: ['A', 'Ix', 'Iy', 'J', 'd', 'bf'],
  independentTableMatches: verified, originalModelRestored: true, sourceDatabases: files,
  policy: {
    normal: 'All compared properties within 0.5%; registration and parser confirmed. Still requires project-specific code checks.',
    review: 'A property differs by >0.5% and <=10%. Display a review warning; never mark the properties as identical.',
    quarantine: 'Difference >10%, registration/parser failure, or no supported material. Exclude from normal selection pending review.',
    materialSupport: 'Implementation range screening at 1000 mm reference lengths for each available material; not design adequacy or member/connection approval.',
    engineeringProperties: 'No Gen property is substituted for the current application formulas. Cold-formed shapes retain preliminary status.'
  }, counts, entries }
writeFileSync('src/data/section-catalog-audit.json', JSON.stringify(published, null, 2) + '\n')
const header = ['code', 'name', 'db', 'shape', 'selectionStatus', 'registered', 'A_diff_pct', 'Ix_diff_pct', 'Iy_diff_pct', 'J_diff_pct', 'd_diff_pct', 'bf_diff_pct']
const csv = [header, ...entries.map((r: any) => [r.code, r.name, r.db, r.shape, r.selectionStatus, r.registered, ...['A', 'Ix', 'Iy', 'J', 'd', 'bf'].map((k) => (r.relativeDifferences[k] * 100).toFixed(6))])]
writeFileSync(`${folder}/comparison.csv`, '\uFEFF' + csv.map((row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n'))
console.log(JSON.stringify({ independentTableMatches: verified, counts, quarantined: entries.filter((r: any) => r.selectionStatus === 'quarantine').map((r: any) => `${r.code}: ${r.name}`) }, null, 2))
