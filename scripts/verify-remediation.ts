import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const {DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC}=await import('../src/domain/types')
const {additionSpec}=await import('./addition-spec')
const {buildPortal}=await import('../src/domain/portal')
const {buildLoadPayloads}=await import('../src/domain/loads')
const {runDesign}=await import('../src/domain/design')
const {runConnections}=await import('../src/domain/connections')
const {createRepairPlan,previewRepair,repairMetrics,diagnoseRepairs,applySectionChanges}=await import('../src/domain/remediation')
const {encodeResults}=await import('./tw-golden')
const {S}=await import('../src/state/store')
const {applyRepairs,prepareRepairs}=await import('../src/actions/remediation')
const {setConfirmHandler}=await import('../src/components/ConfirmDialog')
import type {Results} from '../src/actions/results'
import type {Built} from '../src/state/store'
let checks=0
function ok(value:unknown,label:string){assert.ok(value,label);checks++}
for(const base of [DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC]) {
  const spec=additionSpec(base)
  spec.features!.crane=false;spec.additions!.crane=undefined;spec.additions!.equipment=[]
  const model=buildPortal(spec),loads=buildLoadPayloads(spec,model),comboNames=Object.keys(loads.info.comboKind),cases=Object.values<any>(loads.STLD).map((c)=>c.NAME as string)
  const b:Built={spec,model,info:loads.info,comboNames,combos:comboNames.length,cases}
  const res:Results={beam:new Map(),truss:new Map(),sway:new Map(),disp:new Map(),combos:comboNames}
  for(const e of model.elements) {
    if(e.role==='brace'){res.truss.set(e.id,new Map(comboNames.map((c)=>[c,0])));continue}
    res.beam.set(e.id,new Map(comboNames.map((c)=>[c,Array.from({length:5},()=>({P:0,Vy:0,Vz:0,My:e.addition==='platform-beam'?420:0,Mz:0}))])))
  }
  for(const c of comboNames)res.sway.set(c,{X:{sumPu:0,sumH:1,drift:0},Y:{sumPu:0,sumH:1,drift:0}})
  for(const c of cases)res.disp.set(c,new Map(model.nodes.map((n)=>[n.id,{dx:0,dy:0,dz:0}])))
  const beforeRaw=JSON.stringify(encodeResults(res)),beforeSpec=JSON.stringify(spec)
  const d=runDesign(spec,model,b.info,res),cs=runConnections(spec,model,b.info,res)
  const diagnosis=diagnoseRepairs(d,cs)
  ok(diagnosis.some((g)=>g.group==='platformBeam'),'added beam NG is distinct from base struts')
  const plan=await createRepairPlan(b,res,d,cs)
  const platform=plan.groups.find((g)=>g.group==='platformBeam')!
  ok(platform.candidates.length>0,`${spec.code} added-member candidates exist`)
  ok(platform.candidates.some((c)=>c.strength<platform.maxRatio),`${spec.code} a supported candidate reduces the actual addition ratio`)
  const candidate=platform.candidates[0],preview=previewRepair(plan,{platformBeam:candidate.id})!
  ok(preview.changes.every((c)=>c.target==='platformBeam'),'changing floor beams never rewrites roof/strut sections')
  assert.deepEqual(preview.spec.sections,spec.sections);checks++
  assert.deepEqual(preview.spec.additions!.factors,spec.additions!.factors);checks++
  ok(preview.metrics.memberMax<d.maxRatio,'combined estimate includes added members')
  ok(previewRepair(plan,{})===null,'empty selection produces no change')
  assert.throws(()=>previewRepair(plan,{platformBeam:'forged'}));checks++
  assert.throws(()=>previewRepair(plan,{frame:candidate.id}));checks++
  const linked={...d,service:[...d.service,{key:'linkGap' as const,value:.1,limit:.05,ratio:2,case:'PROJECT',clause:'project movement'}]}
  const manual=await createRepairPlan(b,res,linked,cs)
  ok(manual.groups.find((g)=>g.group==='link')?.candidates.length===0,'external gap never becomes a section repair')
  ok(repairMetrics(d,[{...cs[0],ratio:1.4}]).connectionNg===1,'connection NG cannot be hidden by member pass')
  ok(platform.candidates.every((c)=>Number.isNaN(c.connection)),'added-member candidates carry no unrelated connection ratio')
  ok(platform.candidates.every((c)=>c.weight>0),'candidate weight is the added tonnage')
  const rankedW=platform.candidates.filter((c)=>c.ranked).slice(0,3).map((c)=>c.weight)
  ok(rankedW.every((w,i)=>i===0||w>=rankedW[i-1]),'preferred candidates are ordered by added tonnage')
  ok(platform.candidates.some((c)=>c.ranked),'added-member candidates can be preferred independent of frame connection ratios')
  ok(preview.selectedBlocked===0,'only the changed groups gate applying the repair')
  const ngMember=d.members.find((m)=>m.ratio>1)!
  const dup=diagnoseRepairs({...d,members:d.members.map((m)=>m===ngMember?{...m,issues:[...m.issues??[],{level:'blocked',code:'test'} as any]}:m)},cs)
  const dupGroup=dup.flatMap((g)=>g.problems).filter((p)=>p.member?.id===ngMember.id)
  ok(dupGroup.length===1&&dupGroup[0].kind==='limit','an NG member with a method limit is counted once')
  ok(JSON.stringify(spec)===beforeSpec,'source spec is immutable')
  ok(JSON.stringify(encodeResults(res))===beforeRaw,'candidate evaluation never mutates source forces/deflections')
  if(spec.code==='TW') {
    const coupled=structuredClone(res),column=model.elements.find((e)=>!e.addition&&e.role==='column')!,strut=model.elements.find((e)=>!e.addition&&e.role==='strut')!
    for(const [,ps] of coupled.beam.get(column.id)!)for(const p of ps){p.My=700;p.P=-200}
    for(const [,ps] of coupled.beam.get(strut.id)!)for(const p of ps)p.P=-1000
    const cd=runDesign(spec,model,b.info,coupled),cc=runConnections(spec,model,b.info,coupled),cp=await createRepairPlan(b,coupled,cd,cc)
    for(const group of ['frame','longitudinal'] as const) {
      const row=cp.groups.find((g)=>g.group===group)!
      ok(!!row&&row.candidates.length>0,`${group}: coupled candidates are offered`)
      ok(row.candidates.every((c)=>c.changes.every((p)=>(group==='frame'?['column','rafter']:['strut','brace']).includes(p.target))),'coupled group cannot overwrite another section target')
      ok(row.candidates.filter((c)=>c.ranked).every((c)=>c.connection<=1),'ranked coupled candidates satisfy the available connection layout')
    }
    const chosen=Object.fromEntries(cp.groups.filter((g)=>g.candidates.length).map((g)=>[g.group,g.candidates[0].id]))
    ok(previewRepair(cp,chosen)!.changes.some((p)=>p.target==='platformBeam'),'combined preview includes independent additional-member repair')
  }
  S.built=b;S.results=res;S.design=d;S.connections=cs;S.draftSpec=spec;S.draftInvalid=false;S.analyzed=true;S.mapiKey='test-only';S.repairPlan=plan;S.busy=false;S.confirm=null;S.genChanged=0
  let requests=0
  const originalFetch=globalThis.fetch
  globalThis.fetch=async()=>{requests++;throw new Error('Unexpected network')}
  setConfirmHandler(()=>false)
  await applyRepairs({platformBeam:candidate.id})
  ok(requests===0&&S.built===b,'declining confirmation preserves the model')
  setConfirmHandler(()=>{S.design={...d};return true})
  await applyRepairs({platformBeam:candidate.id})
  ok(requests===0,'a result changed while confirming prevents all network calls')
  S.design=d;S.draftInvalid=true
  await applyRepairs({platformBeam:candidate.id})
  ok(requests===0,'invalid draft blocks repair')
  S.draftInvalid=false;S.repairPlan=null
  await applyRepairs({platformBeam:candidate.id})
  ok(requests===0,'old plan cannot apply to a new result')
  S.repairPlan=plan;setConfirmHandler(()=>true)
  await applyRepairs({platformBeam:candidate.id})
  ok(!!S.lastFail?.repair&&!S.busy,'failed repair retains its own recovery path, not automatic optimization')
  ok(S.built===b&&S.design===d,'network failure before replacement preserves source results')
  S.lastFail=null
  const preparing=prepareRepairs()
  S.job!.cancel=true
  await preparing
  ok(!S.lastFail&&!S.busy,'cancelled candidate generation leaves no failed stage or restore prompt (Gen untouched)')
  ok(S.built===b&&S.design===d,'cancelling candidate generation preserves the analyzed model')
  globalThis.fetch=originalFetch;setConfirmHandler(null)
  const next=applySectionChanges(spec,candidate.changes)
  ok(next.additions!.platform!.beamSection===preview.spec.additions!.platform!.beamSection,'explicit changes reproduce chosen section')
  if(process.argv.includes('--ui-fixture')&&spec.code==='TW')writeFileSync('output/repair-ui-fixture.json',JSON.stringify({spec,results:encodeResults(res)}))
  console.log(`${spec.code}: diagnosis, additional-member sizing, immutable results, stale/confirmation guards passed`)
}
console.log(`Section repair: ${checks} checks passed (TW/CN/KR)`)
