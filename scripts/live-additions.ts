/** Explicit Gen integration test; always restore the original saved document. Key stays in .env. */
import {createHash} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {MidasClient} from 'midas-nx'
import {readMapiKey} from './mapi-key'
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const {S}=await import('../src/state/store')
const apiFetch=globalThis.fetch
let tables=0
globalThis.fetch=async(...args:Parameters<typeof fetch>)=>{
  const r=await apiFetch(...args)
  if(String(args[0]).includes('/post/TABLE') && ++tables%10===0)console.log(`${S.code}: ${tables} result tables returned`)
  return r
}
const {DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC}=await import('../src/domain/types')
const {sendModel}=await import('../src/actions/build')
const {analyzeCore}=await import('../src/actions/analysis')
const {fetchResults}=await import('../src/actions/results')
const {runDesign}=await import('../src/domain/design')
const {runConnections}=await import('../src/domain/connections')
const {buildReport}=await import('../src/report/report')
const {defaultAdditions,defaultOpening,defaultPlatform}=await import('../src/domain/additions')
const phase5=process.argv.includes('--phase5')
const phase6=process.argv.includes('--phase6')
const strengthened=process.argv.includes('--strengthened')
const repairTest=process.argv.includes('--repair-test')
const codesArg=process.argv.find((v)=>v.startsWith('--codes='))?.slice('--codes='.length)
const codes=codesArg?.split(',')??['TW','CN','KR']
if(!codes.length || codes.some((c)=>!['TW','CN','KR'].includes(c)) || new Set(codes).size!==codes.length)throw new Error('Use --codes=TW,CN,KR (unique supported codes)')
const {phase6Spec,strengthenedAdditionSpec}=await import('./addition-spec')
const key=await readMapiKey(),client=new MidasClient({mapiKey:key,product:'gen',timeout:120000});S.mapiKey=key
const token=new Date().toISOString().replace(/[-:.TZ]/g,''),folder=`output/additions-live-${token}`
mkdirSync(folder,{recursive:true})
const dbs=['UNIT','MATL','SECT','NODE','ELEM','CONS','FRLS','STLD','LCOM-GEN','BODF','BMLD','CNLD']
const canonical=(x:any):string=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map((k)=>[k,v[k]])):v)
const hash=(x:any)=>createHash('sha256').update(canonical(x)).digest('hex')
const original:Record<string,string>={};for(const db of dbs)original[db]=hash(await client.request('GET',`/db/${db}`))
const backup=`C:/temp/sms_additions_backup_${token}.mgbx`
const command=async(path:string,arg:string)=>{const r:any=await client.request('POST',path,{Argument:arg});if(r.message!=='MIDAS GEN NX command complete')throw new Error(`${path}: not completed`)}
await command('/doc/saveas',backup)
const state:any={backup,original,restored:false,phase:phase6?6:phase5?5:4,strengthened,codes,cases:[]}
const save=()=>writeFileSync(`${folder}/evidence.json`,JSON.stringify(state,null,2));save()
try {
  for(const base of [DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC].filter((s)=>codes.includes(s.code))) {
    let s=structuredClone(base);s.bays=2;s.baySpacing=6;s.bayList=[5,7];s.features={crane:true,mezzanine:true,multiSpan:false,opening:false}
    s.additions=defaultAdditions(s)
    s.additions.equipment=[{id:'EQ1',name:'Roof equipment',x:7.2,y:3.1,weight:40,seismicFraction:.8,source:'Integration test',confirmed:true}]
    s.additions.crane={id:'CR1',elevation:5.2,eccentricity:.3,wheelSpacing:3,maxWheel:45,minWheel:10,impactFactor:1.1,lateral:8,braking:0,seismicWeight:30,driftLimitMm:10,source:'Integration test',confirmed:true}
    s.additions.platform={...defaultPlatform(s),x0:1,x1:11,elevation:3,source:'Integration test',confirmed:true}
    s.additions.factors={...s.additions.factors,source:'Integration test',confirmed:true}
    if(phase5) {
      s.bays=3;s.bayList=[5,7,4];s.baySpacing=7
      s.features.opening=true
      s.additions.wallOpening={...defaultOpening(s),bay:s.code==='CN'?0:1,source:'Closed door project test',confirmed:true}
      s.additions.crane.lateral=0
      s.additions.crane.runway={section:s.sections.rafter,deflectionDivisor:600,source:'Runway integration test',confirmed:true}
    }
    if(phase6)s=phase6Spec(base)
    if(strengthened)s=strengthenedAdditionSpec(s)
    S.code=s.code
    console.log(`${s.code}: sending ${phase6?'platform + closed roof hatch + floor void + interface reactions':`equipment + crane + platform${phase5?' + runway + closed door':''}`}`)
    await sendModel(s);await analyzeCore()
    console.log(`${s.code}: analyzed; retrieving ${S.built!.combos} combinations`)
    const b=S.built!,res=await fetchResults(b),d=runDesign(s,b.model,b.info,res),connections=runConnections(s,b.model,b.info,res)
    const nodes=new Map(b.model.nodes.map((n)=>[n.id,n])),applied:Record<string,number[]>={}
    for(const [id,rec] of Object.entries(b.sent!.BMLD)) {
      const e=b.model.elements[+id-1],a=nodes.get(e.n1)!,z=nodes.get(e.n2)!,L=Math.hypot(z.x-a.x,z.y-a.y,z.z-a.z)
      for(const it of (rec as any).ITEMS){const v=applied[it.LCNAME]??=[0,0,0];v[['GX','GY','GZ'].indexOf(it.DIRECTION)]+=it.P[0]*L}
    }
    for(const rec of Object.values(b.sent!.CNLD))for(const it of (rec as any).ITEMS){const v=applied[it.LCNAME]??=[0,0,0];v[0]+=it.FX;v[1]+=it.FY;v[2]+=it.FZ}
    let equilibrium=0
    for(const r of S.reactions??[]){const name=r.lc.replace(/\(ST\)$/,'');if(name==='D')continue;const a=applied[name]??[0,0,0];equilibrium=Math.max(equilibrium,Math.max(Math.abs(r.fx+a[0]),Math.abs(r.fy+a[1]),Math.abs(r.fz+a[2]))/Math.max(1,Math.hypot(...a)))}
    if(equilibrium>.002)throw new Error(`${s.code}: reaction imbalance ${equilibrium}`)
    const html=buildReport({built:b,reactions:S.reactions,design:d,connections})
    writeFileSync(`${folder}/${s.code}.html`,html)
    // Keep per-member demand/capacity and exact inputs so sample NGs can be diagnosed independently of the HTML role summary.
    writeFileSync(`${folder}/${s.code}-design.json`,JSON.stringify({spec:s,members:d.members,service:d.service,connections},null,2))
    const groups=[...new Set(d.members.map((m)=>m.addition??m.role))].map((usage)=>{
      const ms=d.members.filter((m)=>(m.addition??m.role)===usage),governing=ms.reduce((a,v)=>a.ratio>=v.ratio?a:v)
      return {usage,count:ms.length,ng:ms.filter((m)=>m.ratio>1).length,maxRatio:governing.ratio,governing}
    })
    const evidence={code:s.code,nodes:b.model.nodes.length,elements:b.model.elements.length,cases:b.cases.length,combinations:b.combos,equilibrium,members:d.members.length,maxRatio:d.maxRatio,ng:d.ng,service:d.service,groups,connectionNg:connections.filter((c)=>c.ratio>1).length,sources:b.model.additions!.sources}
    state.cases.push(evidence);save();console.log(`${s.code}: PASS balance ${(equilibrium*100).toFixed(4)}%, checked ${d.members.length} members (NG ${d.ng}; sample sections)`)
    if(repairTest) {
      const {setConfirmHandler}=await import('../src/components/ConfirmDialog')
      const {prepareRepairs,applyRepairs}=await import('../src/actions/remediation')
      const {previewRepair}=await import('../src/domain/remediation')
      const {encodeResults}=await import('./tw-golden')
      S.results=res;S.design=d;S.connections=connections
      writeFileSync(`${folder}/${s.code}-repair-input.json`,JSON.stringify({spec:s,results:encodeResults(res)}))
      setConfirmHandler(()=>true)
      await prepareRepairs()
      const plan=S.repairPlan
      if(!plan||S.lastFail)throw new Error(`${s.code}: repair preparation failed`)
      const selection=Object.fromEntries(plan.groups.filter((g)=>g.candidates.length).map((g)=>[g.group,g.candidates[0].id]))
      if(!previewRepair(plan,selection))throw new Error(`${s.code}: no repair candidate`)
      console.log(`${s.code}: applying ${Object.keys(selection).join(', ')} candidates through the application action`)
      await applyRepairs(selection)
      const comparison=S.repairComparison
      if(S.lastFail||!comparison||comparison.built!==S.built)throw new Error(`${s.code}: repair application failed`)
      // Verify reanalyzed reaction equilibrium using the new transmitted loads, excluding DB self-weight D.
      const rb=S.built!,rn=new Map(rb.model.nodes.map((n)=>[n.id,n])),ra:Record<string,number[]>={}
      for(const [id,rec] of Object.entries(rb.sent!.BMLD)) {
        const e=rb.model.elements[+id-1],a=rn.get(e.n1)!,z=rn.get(e.n2)!,L=Math.hypot(z.x-a.x,z.y-a.y,z.z-a.z)
        for(const it of (rec as any).ITEMS){const v=ra[it.LCNAME]??=[0,0,0];v[['GX','GY','GZ'].indexOf(it.DIRECTION)]+=it.P[0]*L}
      }
      for(const rec of Object.values(rb.sent!.CNLD))for(const it of (rec as any).ITEMS){const v=ra[it.LCNAME]??=[0,0,0];v[0]+=it.FX;v[1]+=it.FY;v[2]+=it.FZ}
      let repairEquilibrium=0
      for(const r of S.reactions??[]){const name=r.lc.replace(/\(ST\)$/,'');if(name==='D')continue;const a=ra[name]??[0,0,0];repairEquilibrium=Math.max(repairEquilibrium,Math.max(Math.abs(r.fx+a[0]),Math.abs(r.fy+a[1]),Math.abs(r.fz+a[2]))/Math.max(1,Math.hypot(...a)))}
      if(repairEquilibrium>.002)throw new Error(`${s.code}: repair reaction imbalance ${repairEquilibrium}`)
      ;(state.repairs??=[]).push({code:s.code,selection,changes:comparison.changes,before:comparison.before,estimated:comparison.estimated,after:comparison.after,equilibrium:repairEquilibrium})
      save()
      writeFileSync(`${folder}/${s.code}-after-repair.html`,buildReport({built:S.built!,reactions:S.reactions,design:S.design,connections:S.connections}))
      writeFileSync(`${folder}/${s.code}-repair-output.json`,JSON.stringify({spec:S.built!.spec,results:encodeResults(S.results!),reactions:S.reactions,comparison:state.repairs.at(-1)}))
      console.log(`${s.code}: repair reanalysis complete; NG ${comparison.before.memberNg} -> ${comparison.after.memberNg}; source/estimate/verified comparison retained`)
      setConfirmHandler(null)
    }
  }
} catch(e) {state.log=S.log.slice(-5);state.error=e instanceof Error?e.message:String(e);save();throw e}
finally {
  // Save the test model before reopening to avoid an interactive save prompt.
  await command('/doc/saveas',`C:/temp/sms_additions_scratch_${token}.mgbx`)
  await command('/doc/open',backup)
  state.after={};for(const db of dbs)state.after[db]=hash(await client.request('GET',`/db/${db}`))
  state.restored=dbs.every((db)=>original[db]===state.after[db]);save()
  if(!state.restored)throw new Error(`Original model restoration mismatch; recovery ${folder}/evidence.json`)
  console.log(`Original model restored; 12 database hashes match. Evidence: ${folder}`)
}
