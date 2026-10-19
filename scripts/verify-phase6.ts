import assert from 'node:assert/strict'
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const {DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC}=await import('../src/domain/types')
const {buildPortal}=await import('../src/domain/portal')
const {additionErrors}=await import('../src/domain/additions')
const {buildLoadPayloads}=await import('../src/domain/loads')
const {buildGenPayloads}=await import('../src/domain/gen')
const {memberSchedule}=await import('../src/domain/schedule')
const {steelWeight}=await import('../src/domain/optimize')
const {linkReview,simpleBeamDeflection}=await import('../src/domain/phase6')
const {buildDrawingSvgs}=await import('../src/drawing/drawings')
const {checkScope}=await import('../src/domain/scope')
const {additionDesign}=await import('../src/domain/additionDesign')
const {buildReport}=await import('../src/report/report')
const {phase6Spec}=await import('./addition-spec')
let checks=0
const ok=(v:unknown,label:string)=>{checks++;assert.ok(v,label)}
const near=(a:number,b:number,label:string)=>ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${label}: ${a}/${b}`)
const sum=(a:number[])=>a.reduce((p,v)=>p+v,0)
near(simpleBeamDeflection(4,6,200000,80e6),.00421875,'uniform beam independent hand calculation, m')
function resultants(m:ReturnType<typeof buildPortal>,l:ReturnType<typeof buildLoadPayloads>) {
  const out=new Map<string,number[]>()
  const add=(lc:string,x:number,y:number,z:number,F:number[])=>{
    const a=out.get(lc)??[0,0,0,0,0,0];out.set(lc,a)
    const [fx,fy,fz,mx,my,mz]=F,d=[fx,fy,fz,mx+y*fz-z*fy,my+z*fx-x*fz,mz+x*fy-y*fx];d.forEach((v,i)=>a[i]+=v)
  }
  for(const [id,rec] of Object.entries(l.BMLD) as [string,any][]) {
    const e=m.elements[+id-1];ok(!!e,'physical load element exists')
    const a=m.nodes[e.n1-1],b=m.nodes[e.n2-1],L=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)
    for(const it of rec.ITEMS){ok(it.P[0]===it.P[1],'uniform source strip');const F=[0,0,0,0,0,0];F[['GX','GY','GZ'].indexOf(it.DIRECTION)]=it.P[0]*L;add(it.LCNAME,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,F)}
  }
  for(const [id,rec] of Object.entries(l.CNLD) as [string,any][])for(const it of rec.ITEMS){const n=m.nodes[+id-1];add(it.LCNAME,n.x,n.y,n.z,['FX','FY','FZ','MX','MY','MZ'].map((k)=>it[k]??0))}
  return out
}
for(const base of [DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC]) {
  const s=phase6Spec(base)
  ok(!additionErrors(s).length,`${s.code} valid closed hatch / floor void / interface inputs`)
  ok(!checkScope(s).blocked,'valid scope with review')
  const plain=structuredClone(s);plain.additions!.roofOpening=undefined;plain.additions!.floorOpening=undefined;plain.additions!.link=undefined
  const b=buildPortal(plain),bl=buildLoadPayloads(plain,b),r0=resultants(b,bl)
  const roofOnly=structuredClone(plain);roofOnly.additions!.roofOpening=s.additions!.roofOpening
  const rm=buildPortal(roofOnly),rl=buildLoadPayloads(roofOnly,rm),rr=resultants(rm,rl)
  for(const [lc,values] of r0)if(!/^(E|N)/.test(lc))values.forEach((v,i)=>near(rr.get(lc)?.[i]??0,v,`${s.code} closed roof ${lc} force/moment ${i}`))
  near(rl.info.seismic.W-bl.info.seismic.W,(memberSchedule(s,rm).total-memberSchedule(s,b).total)*9.80665,'roof steel change only; cover weight retained')
  const roof=s.additions!.roofOpening!,collectors=rm.additions!.roofCollectors!
  ok(collectors.length>=3,'interior and boundary purlin collectors')
  ok(!rm.elements.some((e)=>e.role==='purlin'&&rm.nodes[e.n1-1].x>roof.x0&&rm.nodes[e.n1-1].x<roof.x1&&Math.abs(rm.nodes[e.n1-1].y-rm.additions!.voids![0].y0)<1e-7),'interrupted interior purlins removed')
  ok(rm.elements.filter((e)=>e.addition==='roof-trimmer').length===2,'two physical H trimmers')
  const floorOnly=structuredClone(plain);floorOnly.additions!.floorOpening=s.additions!.floorOpening
  const fm=buildPortal(floorOnly),fl=buildLoadPayloads(floorOnly,fm),fr=resultants(fm,fl)
  const floor=fm.additions!.voids!.find((v)=>v.kind==='floor')!,p=s.additions!.platform!
  near(fr.get('PL')![2]-r0.get('PL')![2],floor.area*p.live,'actual floor live area excluded')
  near(fr.get('D')![2]-r0.get('D')![2],floor.area*p.dead,'actual floor dead area excluded')
  near(fr.get('PL')![3]-r0.get('PL')![3],floor.area*p.live*(floor.y0+floor.y1)/2,'floor void Y moment')
  near(fr.get('PL')![4]-r0.get('PL')![4],-floor.area*p.live*(floor.x0+floor.x1)/2,'floor void X moment')
  near(fl.info.seismic.W-bl.info.seismic.W,(memberSchedule(s,fm).total-memberSchedule(s,b).total)*9.80665-floor.area*(p.dead+p.live*p.liveMassFraction),'void mass and removed steel exactly once')
  ok(!fm.elements.some((e)=>e.addition&&(e.addition==='platform-beam'||e.addition==='floor-trimmer')&&e.physicalKey!.includes(':secondary:')&&fm.nodes[e.n1-1].x>floor.x0&&fm.nodes[e.n1-1].x<floor.x1&&fm.nodes[e.n1-1].y>=floor.y0&&fm.nodes[e.n2-1].y<=floor.y1),'no internal beam across floor void')
  const linkOnly=structuredClone(plain);linkOnly.additions!.link=s.additions!.link
  const lm=buildPortal(linkOnly),ll=buildLoadPayloads(linkOnly,lm),lr=resultants(lm,ll),link=s.additions!.link!
  near(ll.info.seismic.W,bl.info.seismic.W,'external reactions do not become mass')
  for(const [i,c] of link.cases.entries()) {
    const rows=lm.additions!.nodal.filter((v)=>v.case===`LK00${i+1}`)
    ok(rows.length===1,'one simultaneous interface vector per state')
    for(const k of ['fx','fy','fz','mx','my','mz'] as const)near(rows[0][k],c[k],`signed ${k} kept`)
    const n=lm.nodes[rows[0].node-1]
    const expected=[c.fx,c.fy,c.fz,c.mx+n.y*c.fz-n.z*c.fy,c.my+n.z*c.fx-n.x*c.fz,c.mz+n.x*c.fy-n.y*c.fx]
    expected.forEach((v,j)=>near(lr.get(`LK00${i+1}`)![j],v,'global interface wrench conserved'))
  }
  const combos=Object.values(ll['LCOM-GEN']) as any[]
  ok(combos.some((v)=>v.NAME==='AD_LK001')&&combos.some((v)=>v.NAME==='AU_LK001'),'project gravity/interface combinations')
  ok(combos.filter((v)=>v.NAME.endsWith('LK001')).every((v)=>v.vCOMB.some((p:any)=>p.LCNAME==='LK001'&&p.FACTOR===link.loadFactor)),'project factor applied once')
  const rev=linkReview(link);near(rev.required,35,'conservative relative movement');near(rev.gapReserve,25,'gap reserve');near(rev.seatReserve,90,'seat reserve')
  const combined=buildPortal(s),load=buildLoadPayloads(s,combined),gen=buildGenPayloads(s,combined)
  ok(combined.elements.every((e,i)=>e.id===i+1),'contiguous IDs')
  const used=new Set(combined.elements.flatMap((e)=>[e.n1,e.n2])),edges=new Set<string>()
  ok(combined.nodes.every((n)=>used.has(n.id)),'no orphan nodes')
  for(const e of combined.elements){const key=[e.n1,e.n2].sort((a,b)=>a-b).join(':');ok(!edges.has(key),'no duplicate edges');edges.add(key)}
  ok(Object.keys(gen.ELEM).length===combined.elements.length,'only real steel sent')
  ok(combined.elements.every((e)=>!e.loadOnly),'no virtual structural steel')
  near(steelWeight(s,combined),memberSchedule(s,combined).total,'optimization and takeoff agree')
  for(const e of combined.elements.filter((v)=>v.addition==='roof-trimmer'))ok(!!gen.FRLS[e.id],'roof trimmer support ends pinned')
  const res:any={beam:new Map(),disp:new Map()}
  for(const e of combined.elements.filter((v)=>v.addition))res.beam.set(e.id,new Map([['AD_FLOOR',Array.from({length:5},()=>({P:0,Vy:0,Vz:0,My:0,Mz:0}))]]))
  for(const lc of ['D','PL'])res.disp.set(lc,new Map(combined.nodes.map((n)=>[n.id,{dx:0,dy:0,dz:0}])))
  const d=additionDesign(s,combined,load.info,res,{members:[],byRole:{},service:[],maxRatio:0,ng:0} as any)
  near(d.service.find((v)=>v.key==='linkGap')!.ratio,35/60,'movement check in design result')
  ok(d.service.some((v)=>v.key==='roofOpeningDefl'&&v.value>0),'roof gravity deflection web estimate included')
  const report=buildReport({built:{spec:s,model:combined,info:load.info,cases:Object.values(load.STLD).map((v:any)=>v.NAME),comboNames:Object.keys(load.info.comboKind),combos:Object.keys(load.info.comboKind).length},reactions:null,design:d,connections:null})
  ok(report.includes('<td>35.0 mm</td><td>60.0 mm</td>'),'gap demand and capacity are lengths, not drift ratios, in calculation report')
  const small=structuredClone(s);small.additions!.link!.availableGapMm=10
  ok(linkReview(small.additions!.link!).gapRatio>1,'insufficient gap fails numerically')
  for(const [kind,patch] of [['roofOpening',{bay:1}],['roofOpening',{x0:0}],['roofOpening',{confirmed:false}],['floorOpening',{x0:p.x0}],['floorOpening',{x1:99}],['floorOpening',{bay:s.bays}],['link',{mode:'integral'}],['link',{confirmed:false}],['link',{frame:99}],['link',{cases:[{name:'Zero',fx:0,fy:0,fz:0,mx:0,my:0,mz:0}]}]] as const) {
    const bad=structuredClone(s);Object.assign(bad.additions![kind]!,patch)
    ok(additionErrors(bad).some((v)=>v.path===kind),`invalid ${kind} ${JSON.stringify(patch)}`)
    assert.throws(()=>buildLoadPayloads(bad,combined));checks++
  }
  const separate=structuredClone(s);separate.additions!.link!.mode='separate'
  const sm=buildPortal(separate),sl=buildLoadPayloads(separate,sm)
  ok(!sm.additions!.linkCases?.length&&!Object.values(sl.STLD).some((v:any)=>v.NAME.startsWith('LK')),'separate mode never creates force coupling')
  ok(buildDrawingSvgs({spec:s,model:combined,connections:null,title:'Phase6'}).some((v)=>v.name.startsWith('S9')),'opening/interface plan sheet')
}
console.log(`phase 6: ${checks} checks passed`)
