/** Re-capture TW/CN/KR references after the Gen property migration, with original-document restoration. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'

;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const { S }=await import('../src/state/store')
const { defaultSpecFor }=await import('../src/domain/types')
const { sendModel }=await import('../src/actions/build')
const { analyzeCore }=await import('../src/actions/analysis')
const { fetchResults }=await import('../src/actions/results')
const { fixtureFor,encodeResults,golden }=await import('./tw-golden')
const { memberSchedule }=await import('../src/domain/schedule')
const { dimensionSectionProps }=await import('../src/domain/sections')
const { profileOf }=await import('../src/codes')
const key=await readMapiKey(),client=new MidasClient({mapiKey:key,product:'gen',timeout:120000})
S.mapiKey=key
const folder=`output/gen-section-live-${new Date().toISOString().replace(/[:.]/g,'-')}`
mkdirSync(folder,{recursive:true})
const dbs=['UNIT','MATL','SECT','NODE','ELEM','CONS','FRLS','STLD','LCOM-GEN','BODF','BMLD','CNLD']
const canonical=(x:unknown)=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map((k)=>[k,v[k]])):v)
const snapshot=async()=>{const out:Record<string,string>={};for(const db of dbs)out[db]=createHash('sha256').update(canonical(await client.request('GET',`/db/${db}`))).digest('hex');return out}
const before=await snapshot(),backup=`C:/temp/sms_section_baseline_backup_${Date.now()}.mgbx`
const state:any={backup,before,restored:false,cases:[]}
const save=()=>writeFileSync(`${folder}/evidence.json`,JSON.stringify(state,null,2))
const command=async(path:string,arg:string)=>{const j:any=await client.request('POST',path,{Argument:arg});assert.equal(j.message,'MIDAS GEN NX command complete',path)}
await command('/doc/saveas',backup);save()
assert.deepEqual(await snapshot(),before,'Document changed during backup')
try {
  for(const code of ['TW','CN','KR'] as const) {
    S.code=code
    const previous=readFileSync(fixtureFor(code)),old=JSON.parse(gunzipSync(previous).toString())
    writeFileSync(`${folder}/${code}-previous.json.gz`,previous)
    const spec=structuredClone(defaultSpecFor(code))
    console.log(`${code}: sending Gen-source model`)
    await sendModel(spec);await analyzeCore()
    const b=S.built!,res=await fetchResults(b),answer=golden(spec,res)
    const reaction=(lc:string)=>S.reactions!.find((r)=>r.lc.replace(/\(ST\)$/,'')===lc)!
    const near=(a:number,v:number,label:string)=>assert.ok(Math.abs(a-v)<=Math.max(.01,Math.abs(v)*.0001),`${code} ${label}: ${a} / ${v}`)
    near(Math.abs(reaction('EX').fx),b.info.seismic.X.V,'EX reaction')
    near(Math.abs(reaction('EY').fy),b.info.seismic.Y.V,'EY reaction')
    near(Math.abs(reaction('LR').fz),b.info.roofLive*spec.span*spec.bays*spec.baySpacing,'LR reaction')
    const fixture={captured:new Date().toISOString(),spec,reactions:S.reactions,results:encodeResults(res),golden:answer,propertySource:'gen-section-properties.json'}
    writeFileSync(`${folder}/${code}-updated.json.gz`,gzipSync(JSON.stringify(fixture)))
    const sch=memberSchedule(spec,b.model),gamma=profileOf(code).materials[spec.material].gamma
    const dimensionalTons=sch.rows.reduce((sum,r)=>sum+gamma*dimensionSectionProps(r.section).A*1e-6*r.length/9.80665,0)
    state.cases.push({code,oldSummary:old.golden.summary,newSummary:answer.summary,dimensionalTons,genTons:sch.total,reactions:S.reactions})
    save();console.log(`${code}: max ${answer.summary.maxRatio}; ${dimensionalTons.toFixed(3)} -> ${sch.total.toFixed(3)} t`)
  }
} finally {
  try{await command('/doc/saveas',`C:/temp/sms_section_baseline_scratch_${Date.now()}.mgbx`)}
  finally{await command('/doc/open',backup);state.after=await snapshot();state.restored=JSON.stringify(state.after)===JSON.stringify(before);save();assert.ok(state.restored,'Original document restoration mismatch')}
}
assert.equal(state.cases.length,3)
for(const code of ['TW','CN','KR'] as const)writeFileSync(fixtureFor(code),readFileSync(`${folder}/${code}-updated.json.gz`))
console.log(`Three live fixtures updated; original 12 DB hashes restored. ${folder}`)
