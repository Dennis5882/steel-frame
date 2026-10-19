/** Publish reproducible Gen properties; SDB layout is verified against all live rows before use. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import audit from '../src/data/section-catalog-audit.json'
import { dimensionSectionProps as dimensions } from '../src/domain/sections'

const folder = process.argv[2]
if (!folder) throw Error('Supply a completed capture-gen-section-source directory')
const load = (file: string) => JSON.parse(readFileSync(`${folder}/${file}`, 'utf8'))
assert.ok(load('recovery.json').restored, 'Restore the original document before publishing')
const mm = load('properties-mm.json').SECTPROP, cm = load('properties-cm.json').SECTPROP
const sections = load('sections.json').SECT, table = load('table-mm.json').GenSource
assert.equal(Object.keys(mm).length, 808)
assert.equal(table.DATA.length, 808)
const fields = (v: any) => Object.fromEntries(v.DATA.map((r: string[]) => [r[0], Number(r[1])])) as Record<string, number>
const near = (a: number, b: number, what: string, tol = 2e-6) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= Math.max(0.001, Math.abs(b)*tol), `${what}: ${a} vs ${b}`)
const dbs = new Map<string, Buffer>()
for (const db of audit.sourceDatabases) {
  const bytes = readFileSync(`E:/MIDAS PROGRAM/MIDAS GEN NX/Dbase/${db.db}.sdb`)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), db.sha256, `${db.db}: DB version changed since initial audit`)
  dbs.set(db.db, bytes)
}
const rows = table.DATA.map((row: string[]) => Object.fromEntries(table.HEAD.map((h: string, i: number) => [h, row[i]])))
let excluded = 0
const entries = audit.entries.map((r, i) => {
  const id = String(i+1), live = sections[id]?.SECT_BEFORE
  assert.equal(live?.SECT_I?.DB_NAME, r.db)
  assert.equal(live?.SECT_I?.SECT_NAME, r.name)
  assert.equal(live?.SHAPE, r.shape)
  const v = fields(mm[id]), c = fields(cm[id]), row = rows.find((t: any) => t.ID === id)!
  for (const k of ['Area','Asy','Asz','Ixx','Iyy','Izz']) near(v[k], Number(row[k]), `${r.name} table ${k}`)
  // Check dimensional powers, ignoring the API's incorrect Iw unit text.
  for (const [k, power] of [['Area',2],['Asy',2],['Asz',2],['Ixx',4],['Iyy',4],['Izz',4],['Cyp',1],['Cym',1],['Czp',1],['Czm',1],['Iw',6]] as const) {
    if (v[k] === undefined && r.shape === 'P' && k === 'Iw') continue
    const scale = 10**power
    assert.ok(Math.abs(v[k]/scale-c[k]) <= Math.max(.0000011, Math.abs(c[k])*1e-8), `${r.name} ${k}: MM/CM scaling`)
  }
  const b = dbs.get(r.db)!, index = b.indexOf(Buffer.from(r.name.padEnd(24)))
  assert.ok(index >= 0, r.name)
  const page = b.readUInt16LE(index+26), item = b.readUInt16LE(index+28), offset = (page-1)*608+(item-1)*152
  assert.ok(item >= 1 && item <= 4 && offset+152 <= b.length, 'Invalid SDB record address')
  const db = Array.from({length:38}, (_,j)=>b.readFloatLE(offset+4*j))
  for (const [k,j,power] of [['Area',8,2],['Asy',9,2],['Asz',10,2],['Ixx',11,4],['Iyy',12,4],['Izz',13,4],['Cyp',16,1],['Cym',17,1],['Czp',18,1],['Czm',19,1]] as const) near(db[j]*10**power,v[k],`${r.name} SDB ${k}`)
  const geometry = dimensions(r.name)
  const Sx = v.Iyy/Math.max(v.Czp,v.Czm), Sy = v.Izz/Math.max(v.Cyp,v.Cym)
  // Gen DB plastic moduli are centimetre cubed float32 values; 7 significant digits avoid false precision.
  const Zx = r.shape === 'CC' ? Sx : Number((db[26]*1000).toPrecision(7))
  const Zy = r.shape === 'CC' ? Sy : Number((db[27]*1000).toPrecision(7))
  if(r.selectionStatus === 'quarantine') excluded++
  else {
    for(const x of [v.Area,v.Iyy,v.Izz,v.Ixx,Sx,Sy,Zx,Zy])assert.ok(Number.isFinite(x)&&x>0,`${r.name}: nonpositive property`)
    assert.ok(Zx>=Sx*.97 && Zy>=Sy*.97, `${r.name}: plastic < elastic beyond DB rounding`)
    near(geometry.d,v.Czp+v.Czm,`${r.name} height`,.001)
    near(geometry.bf,v.Cyp+v.Cym,`${r.name} width`,.001)
  }
  return {code:r.code,db:r.db,name:r.name,excluded:r.selectionStatus==='quarantine',
    A:v.Area,Ix:v.Iyy,Iy:v.Izz,J:v.Ixx,Cw:r.shape==='P'?0:v.Iw,Sx,Sy,Zx,Zy,
    Asy:v.Asy,Asz:v.Asz,perimeter:v['Peri:O'],r1:Number((db[6]*10).toPrecision(7)),
    plasticSource:r.shape==='CC'?'elastic-only':'Gen SDB fields 26/27 (cm3)',sdbAddress:{page,item}}
})
const result={version:1,extractedAt:new Date().toISOString(),source:'MIDAS Gen NX',
  sourceDatabases:audit.sourceDatabases,apiEvidence:folder,registered:808,excluded,
  units:{A:'mm2',Ix:'mm4',Iy:'mm4',J:'mm4',Cw:'mm6',Sx:'mm3',Sy:'mm3',Zx:'mm3',Zy:'mm3'},
  axes:'App Ix/Sx/Zx = Gen Iyy/Syy/Zyy; Iy/Sy/Zy = Izz/Szz/Zzz; J = Ixx.',
  provenance:{elastic:'API I/c (larger extreme distance)',plastic:'Installed SDB, 608-byte pages and 152-byte float32 records; address and 10 property mappings checked against all 808 API rows.',warping:'API Iw, independently checked by MM/CM sixth-power scaling. Raw unit labels are unreliable.',coldFormed:'Gross properties only; elastic moduli retained as Z placeholders. Effective-width calculations remain separate and preliminary.'},entries}
writeFileSync('src/data/gen-section-properties.json',JSON.stringify(result,null,2)+'\n')
console.log(`Published Gen properties: ${entries.length} records, ${excluded} excluded; API table, SDB mapping and dimensional scaling verified.`)
