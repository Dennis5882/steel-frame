/** Explicit live matrix. Run sequentially, with no other Gen automation active. */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {MidasClient} from 'midas-nx'
import {readMapiKey} from './mapi-key'
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const {S}=await import('../src/state/store')
const {defaultSpecFor,normalizeSpans}=await import('../src/domain/types')
const {sendModel}=await import('../src/actions/build')
const {analyzeCore}=await import('../src/actions/analysis')
const {fetchResults}=await import('../src/actions/results')
const {runDesign}=await import('../src/domain/design')
const {runConnections}=await import('../src/domain/connections')
const {buildReport}=await import('../src/report/report')
const {buildDxf}=await import('../src/drawing/drawings')
const {memberSchedule}=await import('../src/domain/schedule')
const key=await readMapiKey(),client=new MidasClient({mapiKey:key,product:'gen',timeout:120000})
S.mapiKey=key
const token=new Date().toISOString().replace(/[-:.TZ]/g,''),folder=`output/country-frames-live-${token}`
mkdirSync(folder,{recursive:true})
const dbs=['UNIT','MATL','SECT','NODE','ELEM','CONS','FRLS','STLD','LCOM-GEN','BODF','BMLD','CNLD']
const canonical=(x:unknown)=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
const snapshot=async()=>{const x:Record<string,string>={};for(const db of dbs)x[db]=createHash('sha256').update(canonical(await client.request('GET',`/db/${db}`))).digest('hex');return x}
const command=async(path:string,arg:string)=>{const r:any=await client.request('POST',path,{Argument:arg});assert.equal(r.message,'MIDAS GEN NX command complete',path)}
const before=await snapshot(),backup=`C:/temp/sms_frames_backup_${token}.mgbx`
await command('/doc/saveas',backup)
assert.deepEqual(await snapshot(),before,'Document changed during backup')
const state:any={version:JSON.parse(readFileSync('package.json','utf8')).version,backup,before,restored:false,cases:[]}
const save=()=>writeFileSync(`${folder}/evidence.json`,JSON.stringify(state,null,2));save()
try {
  for(const code of ['TW','CN','KR'] as const)for(const frame of ['gable','mono','multi'] as const){
    const spec=normalizeSpans({...structuredClone(defaultSpecFor(code)),frame,...(frame==='multi'?{spanList:[24,24]}:{})})
    S.code=code
    console.log(`${code}/${frame}: sending, source check and analysis`)
    await sendModel(spec);await analyzeCore()
    const b=S.built!,res=await fetchResults(b),d=runDesign(spec,b.model,b.info,res),connections=runConnections(spec,b.model,b.info,res)
    assert.equal(S.reactions?.length,b.cases.length,'Every static reaction case must be returned')
    const nodes=new Map(b.model.nodes.map(n=>[n.id,n])),applied:Record<string,number[]>={}
    for(const [id,rec] of Object.entries(b.sent!.BMLD)){
      const e=b.model.elements[+id-1],a=nodes.get(e.n1)!,z=nodes.get(e.n2)!,L=Math.hypot(z.x-a.x,z.y-a.y,z.z-a.z)
      for(const it of (rec as any).ITEMS){const v=applied[it.LCNAME]??=[0,0,0];v[['GX','GY','GZ'].indexOf(it.DIRECTION)]+=it.P[0]*L}
    }
    for(const rec of Object.values(b.sent!.CNLD))for(const it of (rec as any).ITEMS){const v=applied[it.LCNAME]??=[0,0,0];v[0]+=it.FX;v[1]+=it.FY;v[2]+=it.FZ}
    let equilibrium=0
    for(const r of S.reactions!){const name=r.lc.replace(/\(ST\)$/,'');if(name==='D')continue;const a=applied[name]??[0,0,0];equilibrium=Math.max(equilibrium,Math.max(Math.abs(r.fx+a[0]),Math.abs(r.fy+a[1]),Math.abs(r.fz+a[2]))/Math.max(1,Math.hypot(...a)))}
    assert.ok(equilibrium<=.002,`Reaction imbalance ${equilibrium}`)
    assert.ok(Number.isFinite(d.maxRatio),'Finite design result')
    const title=`${code}-${frame}`,schedule=memberSchedule(spec,b.model)
    writeFileSync(`${folder}/${title}.html`,buildReport({built:b,reactions:S.reactions,design:d,connections}))
    writeFileSync(`${folder}/${title}.dxf`,buildDxf({spec,model:b.model,connections,title}))
    writeFileSync(`${folder}/${title}-design.json`,JSON.stringify({spec,members:d.members,service:d.service,connections,schedule},null,2))
    state.cases.push({code,frame,nodes:b.model.nodes.length,elements:b.model.elements.length,cases:b.cases.length,combinations:b.combos,equilibrium,maxRatio:d.maxRatio,ng:d.ng,service:d.service,connectionNg:connections.filter(c=>c.ratio>1).length,tons:schedule.total})
    save();console.log(`${title}: integration PASS, ratio ${d.maxRatio.toFixed(3)}, NG ${d.ng}`)
  }
}catch(e){state.error=e instanceof Error?e.message:String(e);state.log=S.log.slice(-5);save();throw e}
finally{
  try{await command('/doc/saveas',`C:/temp/sms_frames_scratch_${token}.mgbx`)}
  finally{await command('/doc/open',backup);state.after=await snapshot();state.restored=canonical(state.after)===canonical(before);save();assert.ok(state.restored,'Original model restoration mismatch')}
}
console.log(`All 9 cases completed; original 12 DB hashes restored. Evidence: ${folder}`)
