/** Ten-bay crane integration. Run alone; restores the original document and verifies all 12 DBs. */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {MidasClient} from 'midas-nx'
import {readMapiKey} from './mapi-key'
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const {S}=await import('../src/state/store')
const {defaultSpecFor}=await import('../src/domain/types')
const {defaultAdditions}=await import('../src/domain/additions')
const {craneTravel}=await import('../src/domain/craneTravel')
const {sendModel}=await import('../src/actions/build')
const {analyzeCore}=await import('../src/actions/analysis')
const {fetchResults}=await import('../src/actions/results')
const {runDesign}=await import('../src/domain/design')
const {runConnections}=await import('../src/domain/connections')
const {buildReport}=await import('../src/report/report')
const {buildDxf}=await import('../src/drawing/drawings')
const codesArg=process.argv.find(v=>v.startsWith('--codes='))?.slice(8)
const codes=codesArg?.split(',')??['TW','CN','KR']
assert.ok(codes.length&&codes.every(c=>['TW','CN','KR'].includes(c))&&new Set(codes).size===codes.length,'Use --codes=TW,CN,KR')
const rangesArg=process.argv.find(v=>v.startsWith('--ranges='))?.slice(9)
const ranges=rangesArg?.split(',')??['full','partial']
assert.ok(ranges.length&&ranges.every(r=>['full','partial'].includes(r))&&new Set(ranges).size===ranges.length,'Use --ranges=full,partial')
const key=await readMapiKey(),client=new MidasClient({mapiKey:key,product:'gen',timeout:120000})
S.mapiKey=key
const token=new Date().toISOString().replace(/[-:.TZ]/g,''),folder=`output/crane-travel-live-${token}`
mkdirSync(folder,{recursive:true})
const dbs=['UNIT','MATL','SECT','NODE','ELEM','CONS','FRLS','STLD','LCOM-GEN','BODF','BMLD','CNLD']
const canonical=(x:unknown)=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
const snapshot=async()=>{const x:Record<string,string>={};for(const db of dbs)x[db]=createHash('sha256').update(canonical(await client.request('GET',`/db/${db}`))).digest('hex');return x}
const command=async(path:string,arg:string)=>{const r:any=await client.request('POST',path,{Argument:arg});assert.equal(r.message,'MIDAS GEN NX command complete',path)}
const before=await snapshot(),backup=`C:/temp/sms_travel_backup_${token}.mgbx`
await command('/doc/saveas',backup)
assert.deepEqual(await snapshot(),before,'Document changed during backup')
const state:any={backup,before,restored:false,codes,ranges,cases:[]}
const save=()=>writeFileSync(`${folder}/evidence.json`,JSON.stringify(state,null,2));save()
const apiFetch=globalThis.fetch;let tables=0,interrupted=false
process.on('SIGINT',()=>{interrupted=true;console.log('Stopping at the next result request, then restoring the original document')})
globalThis.fetch=async(...args:Parameters<typeof fetch>)=>{const isTable=String(args[0]).includes('/post/TABLE');if(interrupted&&isTable)throw new Error('Live run cancelled');const r=await apiFetch(...args);if(isTable&&++tables%10===0)console.log(`${S.code}: ${tables} result tables`);return r}
try {
  for(const code of (['TW','CN','KR'] as const).filter(c=>codes.includes(c)))for(const partial of [false,true].filter(p=>ranges.includes(p?'partial':'full'))){
    const spec=structuredClone(defaultSpecFor(code))
    spec.span=36;spec.bays=10;spec.baySpacing=8;spec.bayList=undefined;spec.eaveHeight=11
    spec.features={crane:true,mezzanine:false,multiSpan:false,opening:false}
    spec.additions=defaultAdditions(spec)
    spec.additions.crane={id:'CR1',elevation:5.2,eccentricity:.3,wheelSpacing:3,maxWheel:45,minWheel:10,impactFactor:1.1,lateral:0,braking:0,seismicWeight:30,driftLimitMm:10,source:'Crane travel integration example',confirmed:true,...(partial?{travel:{firstBay:2,lastBay:5}}:{}),runway:{section:spec.sections.rafter,deflectionDivisor:600,source:'Integration example',confirmed:true}}
    spec.additions.factors={...spec.additions.factors,source:'Integration example',confirmed:true}
    const name=`${code}-${partial?'partial':'full'}`,travel=craneTravel(spec)
    S.code=code;console.log(`${name}: ten bays retained; crane bays ${travel.firstBay+1}-${travel.lastBay+1}; sending and analyzing`)
    await sendModel(spec);await analyzeCore()
    const b=S.built!;assert.equal(b.spec.bays,10)
    const rails=b.model.elements.filter(e=>e.addition==='runway-beam')
    assert.ok(rails.length>0,'Runway elements must exist')
    console.log(`${name}: ${b.model.elements.length} elements, ${b.cases.length} cases, ${b.combos} combinations; retrieving all results`)
    const res=await fetchResults(b),design=runDesign(spec,b.model,b.info,res),connections=runConnections(spec,b.model,b.info,res)
    assert.equal(S.reactions?.length,b.cases.length)
    const nodes=new Map(b.model.nodes.map(n=>[n.id,n])),applied:Record<string,number[]>={}
    for(const [id,rec] of Object.entries(b.sent!.BMLD)){
      const e=b.model.elements[+id-1],a=nodes.get(e.n1)!,z=nodes.get(e.n2)!,L=Math.hypot(z.x-a.x,z.y-a.y,z.z-a.z)
      for(const it of (rec as any).ITEMS){const v=applied[it.LCNAME]??=[0,0,0];v[['GX','GY','GZ'].indexOf(it.DIRECTION)]+=it.P[0]*L}
    }
    for(const rec of Object.values(b.sent!.CNLD))for(const it of (rec as any).ITEMS){const v=applied[it.LCNAME]??=[0,0,0];v[0]+=it.FX;v[1]+=it.FY;v[2]+=it.FZ}
    let equilibrium=0
    for(const r of S.reactions??[]){const lc=r.lc.replace(/\(ST\)$/,'');if(lc==='D')continue;const a=applied[lc]??[0,0,0];equilibrium=Math.max(equilibrium,Math.max(Math.abs(r.fx+a[0]),Math.abs(r.fy+a[1]),Math.abs(r.fz+a[2]))/Math.max(1,Math.hypot(...a)))}
    assert.ok(equilibrium<=.002,`Reaction imbalance ${equilibrium}`)
    for(const e of rails)for(const id of [e.n1,e.n2])assert.ok(nodes.get(id)!.y>=travel.start-1e-7&&nodes.get(id)!.y<=travel.end+1e-7)
    writeFileSync(`${folder}/${name}.html`,buildReport({built:b,reactions:S.reactions,design,connections}))
    writeFileSync(`${folder}/${name}.dxf`,buildDxf({spec,model:b.model,connections,title:name}))
    state.cases.push({name,spec,travel,elements:b.model.elements.length,railElements:rails.length,cases:b.cases.length,combinations:b.combos,equilibrium,memberNg:design.ng,maxRatio:design.maxRatio,service:design.service,sources:b.model.additions!.sources})
    save();console.log(`${name}: PASS complete results; balance ${(equilibrium*100).toFixed(5)}%; sample member NG ${design.ng}`)
    S.results=null;S.design=null;S.connections=null
  }
} catch(e){state.error=e instanceof Error?e.message:String(e);state.log=S.log.slice(-5);save();throw e}
finally {
  try {await command('/doc/saveas',`C:/temp/sms_travel_scratch_${token}.mgbx`)}
  finally {await command('/doc/open',backup);state.after=await snapshot();state.restored=dbs.every(db=>before[db]===state.after[db]);save();assert.ok(state.restored,`Restore mismatch; see ${folder}`);console.log(`Original restored; 12 DB hashes match. Evidence: ${folder}`)}
}
