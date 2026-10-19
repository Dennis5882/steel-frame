import assert from 'node:assert/strict'
import data from '../src/data/gen-section-properties.json'
import { dimensionSectionProps, genSectionRecord, sectionProps } from '../src/domain/sections'
import { sectionSourceDifferences } from '../src/domain/genSectionSync'

assert.equal(data.entries.length,808)
assert.equal(data.entries.filter((r)=>r.excluded).length,8)
assert.equal(new Set(data.entries.map((r)=>`${r.code}:${r.db}:${r.name}`)).size,808)
for(const r of data.entries) {
  const code=r.code as 'TW'|'CN'|'KR'
  if(r.excluded){assert.throws(()=>sectionProps(r.name,code),/excluded/);continue}
  const p=sectionProps(r.name,code)
  assert.equal(p.source,'gen-db');assert.equal(p.db,r.db)
  for(const x of [p.A,p.Ix,p.Iy,p.J,p.Sx,p.Sy,p.Zx,p.Zy,p.rx,p.ry])assert.ok(Number.isFinite(x)&&x>0)
  assert.ok(p.Cw>=0)
  assert.ok(Math.abs(p.rx*p.rx*p.A-p.Ix)<p.Ix*1e-12)
}
// Fixed API/installed-DB reference values, independent of the old sharp-corner formulas.
const h=sectionProps('H 600x200x11/17','KR')
assert.equal(h.A,13440);assert.equal(h.Ix,776000000);assert.equal(h.Iy,22800000)
assert.equal(h.Zx,2980000);assert.equal(h.Zy,361000)
assert.equal(h.Cw,1924353642016.6328)
assert.notEqual(h.A,dimensionSectionProps(h.name).A)
assert.equal(sectionProps('P 60.5x2.3','TW').A,421)
assert.equal(sectionProps('P 60.5x2.3','KR').A,420.5) // Same name, different DB: never infer country from the name.
assert.equal(sectionProps('BH 613x217x9x14','KR').source,'dimensions')
const source=genSectionRecord(h.name,'KR')!
const sent={'1':{SECT_BEFORE:{SECT_I:{DB_NAME:'KS21',SECT_NAME:h.name}}}}
const table={DIST:'MM',HEAD:['ID','Area','Iyy','Izz','Ixx'],DATA:[['1','13440','776000000','22800000','906000']]}
assert.deepEqual(sectionSourceDifferences('KR',sent,table),[])
assert.ok(sectionSourceDifferences('KR',sent,{...table,DIST:'M'}).length)
assert.ok(sectionSourceDifferences('KR',sent,{...table,DATA:[['1','13026','776000000','22800000','906000']]}).length)
assert.ok(sectionSourceDifferences('KR',sent,{...table,DATA:[]}).length)
assert.ok(sectionSourceDifferences('KR',sent,undefined).length)
assert.equal(source.db,'KS21')
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const {defaultSpecFor}=await import('../src/domain/types')
const {buildPortal}=await import('../src/domain/portal')
const {memberSchedule}=await import('../src/domain/schedule')
const {steelWeight}=await import('../src/domain/optimize')
const {profileOf}=await import('../src/codes')
for(const code of ['TW','CN','KR'] as const) {
  const spec=defaultSpecFor(code),model=buildPortal(spec),schedule=memberSchedule(spec,model)
  assert.ok(Math.abs(schedule.total-steelWeight(spec,model))<1e-9)
  for(const row of schedule.rows)assert.equal(row.kgPerM,profileOf(code).materials[spec.material].gamma*sectionProps(row.section,code).A*1e-6*1000/9.80665)
  for(const r of data.entries.filter((r)=>r.code===code))assert.equal(profileOf(code).gen.sectionDbOf?.(r.name)??profileOf(code).gen.sectionDb,r.db)
}
console.log('Gen section source: 808 records, 8 exclusions, independent KR values, country collisions, source mismatch gates and takeoff/optimization consistency passed.')
