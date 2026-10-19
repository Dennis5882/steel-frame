import assert from 'node:assert/strict'
;(globalThis as any).document = {documentElement:{lang:'ko',dataset:{}}}
const {DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC}=await import('../src/domain/types')
const {defaultAdditions,additionErrors,factoryOnly}=await import('../src/domain/additions')
const {buildPortal,portalGeometry}=await import('../src/domain/portal')
const {buildLoadPayloads}=await import('../src/domain/loads')
const {buildGenPayloads}=await import('../src/domain/gen')
const {nodeWeights}=await import('../src/domain/weights')
const {checkScope}=await import('../src/domain/scope')
const {sectionProps}=await import('../src/domain/sections')
const {profileOf}=await import('../src/codes')
const {steelWeight}=await import('../src/domain/optimize')
const {memberSchedule}=await import('../src/domain/schedule')
const {buildDrawingSvgs}=await import('../src/drawing/drawings')
const {runDesign}=await import('../src/domain/design')
const {memberGrade}=await import('../src/domain/status')
import {additionSpec} from './addition-spec'
import type {Results} from '../src/actions/results'
let checks=0
const near=(a:number,b:number,label:string)=>{checks++;assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${label}: ${a} / ${b}`)}
const ok=(v:unknown,label:string)=>{checks++;assert.ok(v,label)}

for (const base of [DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC]) {
  const s=additionSpec(base),m=buildPortal(s),a=m.additions!,l=buildLoadPayloads(s,m),g=buildGenPayloads(s,m)
  const sheets=buildDrawingSvgs({spec:s,model:m,connections:null,title:'Test additions'})
  const plain=structuredClone(s);plain.additions=undefined;plain.features=undefined
  const roof=buildDrawingSvgs({spec:plain,model:buildPortal(plain),connections:null,title:'Test additions'})[0]
  ok(sheets.length===7 && sheets[5].name.startsWith('S6') && sheets[6].name.startsWith('S7'),'separate addition plan and elevation sheets')
  ok(sheets[0].svg===roof.svg,'platform beams do not appear in roof framing plan')
  ok(!additionErrors(s).length,`${s.code} valid inputs`);ok(!checkScope(s).blocked,'supported scope after confirmation')
  ok(checkScope(s).issues.some((i)=>i.key==='additionReview'),'expert scope retained')
  const combosSent=Object.values(l['LCOM-GEN']) as any[]
  const originalCombos=combosSent.filter((v)=>!/^A[DPUL]_/.test(v.NAME) && !/^AP\d/.test(v.NAME))
  const withLive=combosSent.filter((v)=>/^AP\d/.test(v.NAME))
  ok(originalCombos.length===withLive.length,'keep both original and accompanying floor live variants')
  ok(originalCombos.every((v)=>v.vCOMB.every((p:any)=>p.LCNAME!=='PL')),'zero floor live alternatives retained for uplift and force reversal')
  ok(withLive.every((v)=>v.vCOMB.filter((p:any)=>p.LCNAME==='PL').length===1),'accompanying floor live included exactly once')
  ok(combosSent.every((v)=>v.NAME.length<=20),'Gen combination names within 20 chars')
  for(const v of withLive) {
    const original=originalCombos.find((o)=>v.DESC===`${o.NAME} + project accompanying PL`)!
    ok(!!original,'additional combination records its original source')
    assert.deepEqual(v.vCOMB.slice(0,-1),original.vCOMB);checks++
    ok(l.info.comboKind[v.NAME]===l.info.comboKind[original.NAME],'amplified and gravity classifications preserved')
    const dir=(name:string)=>name.match(/(?:W|E|N)([XY])/)?.[1]
    ok(dir(v.NAME)===dir(original.NAME),'primary lateral direction preserved')
    const seismic=(name:string)=>/(^| )-?E[XYV]( |$)/.test(name)
    if(s.code==='CN')ok(seismic(v.NAME)===seismic(original.NAME),'CN seismic resistance/detail classification preserved')
  }
  const nodes=new Map(m.nodes.map((n)=>[n.id,n])), len=(e:typeof m.elements[number])=>{const a=nodes.get(e.n1)!,b=nodes.get(e.n2)!;return Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)}
  const edgeKeys=new Set<string>()
  for (const e of m.elements) {ok(len(e)>1e-7,'no zero length');const key=[e.n1,e.n2].sort((a,b)=>a-b).join(':');ok(!edgeKeys.has(key),'no duplicate element');edgeKeys.add(key)}
  const used=new Set(m.elements.flatMap((e)=>[e.n1,e.n2]));ok(m.nodes.every((n)=>used.has(n.id)),'no orphan nodes')
  const sum=(items:number[])=>items.reduce((a,b)=>a+b,0)
  const eq=a.nodal.filter((n)=>n.source==='EQ1');near(sum(eq.map((n)=>n.fz)),-40,'equipment vertical conservation')
  near(sum(eq.map((n)=>-n.fz*nodes.get(n.node)!.x)),40*7.2,'equipment X moment conservation')
  near(sum(eq.map((n)=>-n.fz*nodes.get(n.node)!.y)),40*3.1,'equipment Y moment conservation')
  for (const c of a.craneCases) {
    const ns=a.nodal.filter((n)=>n.case===c.name)
    near(sum(ns.map((n)=>n.fz)),-2*(45+10)*1.1,'wheel load total')
    near(sum(ns.map((n)=>n.fx)),8*c.lateralSign,'crane lateral total')
    near(sum(ns.map((n)=>n.fy)),5*c.brakingSign,'crane braking total')
    const xMax=c.maxRail==='left'?.3:s.span-.3,xMin=s.span-xMax
    near(sum(ns.map((n)=>n.my-nodes.get(n.node)!.x*n.fz)),2*1.1*(45*xMax+10*xMin),'bracket + nodal global moment')
  }
  const p=s.additions!.platform!,area=(p.x1-p.x0)*12
  near(sum(a.beam.filter((v)=>v.case==='PL').map((v)=>v.q*len(m.elements[v.element-1]))),area*p.live,'floor area live load')
  near(sum(a.beam.filter((v)=>v.case==='D').map((v)=>v.q*len(m.elements[v.element-1]))),area*p.dead,'floor area dead load')
  const gamma=profileOf(s.code).materials[s.material].gamma
  const structural=sum(m.elements.filter((e)=>e.addition).map((e)=>gamma*sectionProps(e.section,s.code).A*1e-6*len(e)))
  near(a.sources.find((v)=>v.id===p.id)!.dead,area*p.dead+structural,'floor ownweight counted once')
  const baseModel=factoryOnly(m);delete baseModel.additions
  const baseWeight=sum([...nodeWeights(s,baseModel,()=>0).values()])
  near(sum([...nodeWeights(s,m,()=>0).values()]),baseWeight+sum(a.sources.map((v)=>v.seismic)),'seismic ledger once')
  near(steelWeight(s,m),memberSchedule(s,m).total,'optimization weight uses actual added sections')
  for (const v of a.members.filter((v)=>v.key.startsWith('column:'))) near(v.length,s.eaveHeight,'physical column full height')
  for (const e of m.elements.filter((v)=>v.role==='column')) ok(e.designLength!>=len(e)-1e-7,'split does not shorten restraint length')
  const force={P:0,Vy:0,Vz:0,My:0,Mz:0},combos=Object.keys(l.info.comboKind)
  const res:Results={combos,beam:new Map(),truss:new Map(),disp:new Map(),sway:new Map()}
  for (const e of m.elements) if(e.role==='brace')res.truss.set(e.id,new Map(combos.map((c)=>[c,0])));else res.beam.set(e.id,new Map(combos.map((c)=>[c,Array.from({length:5},()=>({...force}))])))
  for (const c of combos)res.sway.set(c,{X:{sumPu:0,sumH:1,drift:0},Y:{sumPu:0,sumH:1,drift:0}})
  for (const c of Object.values(l.STLD) as any[])res.disp.set(c.NAME,new Map(m.nodes.map((n)=>[n.id,{dx:0,dy:0,dz:0}])))
  const d=runDesign(s,m,l.info,res)
  ok(d.members.length===m.elements.length,'all base and added members checked')
  ok(d.members.every((v)=>memberGrade(v).grade!=='pass'),'expert review never silently passes')
  ok(d.service.some((v)=>v.key==='platformDefl')&&d.service.some((v)=>v.key==='craneDefl'),'added service checks present')
  const secondary=a.members.find((v)=>v.key.includes(':secondary:'))!
  const secondaryEs=m.elements.filter((e)=>secondary.elementIds.includes(e.id))
  const mid=secondaryEs[0].n2
  res.disp.get('PL')!.get(mid)!.dz=-.01
  res.disp.get(a.craneCases[0].name)!.get(a.nodal.find((n)=>n.case===a.craneCases[0].name)!.node)!.dx=.02
  const defl=runDesign(s,m,l.info,res)
  ok(defl.service.find((v)=>v.key==='platformDefl')!.ratio>0,'platform support-relative displacement actually evaluated')
  near(defl.service.find((v)=>v.key==='craneDefl')!.ratio,2,'project crane drift limit actually evaluated')
  const pc=m.elements.find((e)=>e.addition==='platform-column')!,pcSection=sectionProps(pc.section,s.code),pcLength=a.members.find((v)=>v.key===pc.physicalKey)!.length
  const baseCombo=combos.find((c)=>l.info.comboKind[c]==='basic')!
  res.beam.get(pc.id)!.set(baseCombo,Array.from({length:5},()=>({...force,P:-100,Mz:10})))
  const compressed=runDesign(s,m,l.info,res).members.find((v)=>v.id===pc.id)!
  const weakEuler=Math.PI**2*profileOf(s.code).materials[s.material].E*pcSection.Iy/(2*pcLength*1000)**2/1000
  near(compressed.B,1/Math.max(.01,1-100/weakEuler),'additional column amplification includes weak-axis Euler critical load')
  const missing={...res,disp:new Map(res.disp)};missing.disp.delete('PL')
  assert.throws(()=>runDesign(s,m,l.info,missing),/DISPLACEMENT missing/);checks++
  for (const e of m.elements.filter((v)=>v.addition==='platform-beam')) {
    const es=m.elements.filter((v)=>v.physicalKey===e.physicalKey),deg=(id:number)=>es.filter((v)=>v.n1===id||v.n2===id).length
    const flags=(g.FRLS[e.id] as any)?.ITEMS[0]
    ok((flags?.FLAG_I==='0000110')===(deg(e.n1)===1),'release only physical I end')
    ok((flags?.FLAG_J==='0000110')===(deg(e.n2)===1),'release only physical J end')
  }
  const bad=structuredClone(s);bad.additions!.equipment[0].confirmed=false
  ok(checkScope(bad).blocked,'unconfirmed input gate');assert.throws(()=>buildLoadPayloads(bad,buildPortal(bad)));checks++
  const empty=structuredClone(base);empty.additions=defaultAdditions(empty)
  assert.deepEqual(buildPortal(empty),buildPortal(base));checks++
  const invalid=structuredClone(s);invalid.additions!.crane!.wheelSpacing=1000
  assert.throws(()=>buildPortal(invalid));checks++
  const duplicate=structuredClone(s);duplicate.additions!.crane!.id='EQ1'
  ok(additionErrors(duplicate).length,'duplicate provenance rejected')
  const reuse=structuredClone(s);reuse.baseFixity='pinned';reuse.additions!.platform!.x0=portalGeometry(s).postXs[0]
  const connected=buildPortal(reuse),cp=reuse.additions!.platform!
  for (const n of connected.nodes.filter((n)=>Math.abs(n.x-cp.x0)<1e-7 && (n.y===0||n.y===12) && n.z===0)) {
    ok(!connected.additions!.fixedBases.includes(n.id),'reuse gable post without fixing its pinned base')
    ok(!connected.elements.some((e)=>e.addition==='platform-column' && e.n1===n.id),'no overlapping new column on existing post axis')
  }
  for (const n of connected.nodes.filter((n)=>Math.abs(n.x-cp.x0)<1e-7 && (n.y===0||n.y===12) && Math.abs(n.z-cp.elevation)<1e-7)) {
    ok(connected.elements.some((e)=>e.role==='post' && !e.addition && (e.n1===n.id||e.n2===n.id)),'floor intersects existing vertical post')
    ok(connected.elements.some((e)=>e.addition==='platform-beam' && (e.n1===n.id||e.n2===n.id)),'same node connects floor beam')
  }
}
console.log(`Factory additions: ${checks} checks passed (TW/CN/KR geometry, loads, mass, physical lengths, releases, design and confirmation)`)
