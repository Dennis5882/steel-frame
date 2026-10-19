import assert from 'node:assert/strict'
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const {DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC}=await import('../src/domain/types')
const {defaultAdditions,defaultOpening,additionErrors,cranePositions}=await import('../src/domain/additions')
const {buildPortal}=await import('../src/domain/portal')
const {buildLoadPayloads}=await import('../src/domain/loads')
const {buildGenPayloads}=await import('../src/domain/gen')
const {checkScope}=await import('../src/domain/scope')
const {sectionProps}=await import('../src/domain/sections')
const {profileOf}=await import('../src/codes')
const {memberSchedule}=await import('../src/domain/schedule')
const {steelWeight}=await import('../src/domain/optimize')
const {additionDesign}=await import('../src/domain/additionDesign')
const {buildDrawingSvgs}=await import('../src/drawing/drawings')
let checks=0
const ok=(v:unknown,label:string)=>{checks++;assert.ok(v,label)}
const near=(a:number,b:number,label:string)=>ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${label}: ${a} / ${b}`)
const sum=(a:number[])=>a.reduce((p,v)=>p+v,0)
const samples=cranePositions([0,5,12],3,true)
ok(samples.includes(2.5) && samples.includes(1) && samples.includes(7),'interior and paired-wheel moment samples')
for(const base of [DEFAULT_SPEC,CN_DEFAULT_SPEC,KR_DEFAULT_SPEC]) {
  const s=structuredClone(base);s.bays=4;s.bayList=[5,7,6,4];s.baySpacing=7
  s.features={crane:false,mezzanine:false,multiSpan:false,opening:true};s.additions=defaultAdditions(s)
  s.additions.wallOpening={...defaultOpening(s),source:'Closed door load transfer project basis',confirmed:true}
  ok(!additionErrors(s).length,`${s.code} confirmed full-bay closed door`)
  ok(!checkScope(s).blocked,'door allowed with expert review')
  const m=buildPortal(s),l=buildLoadPayloads(s,m),g=buildGenPayloads(s,m)
  const plain=structuredClone(s);plain.features!.opening=false
  const m0=buildPortal(plain),l0=buildLoadPayloads(plain,m0)
  const header=m.elements.find((e)=>e.addition==='opening-header')!
  ok(!!header && m.additions!.removedGirts!.length>0,'header created, girts removed')
  ok(m.elements.every((e,i)=>e.id===i+1),'contiguous element IDs after removal')
  ok(Object.keys(g.ELEM).length===m.elements.length,'virtual members never sent to Gen')
  ok(!m.elements.some((e)=>e.loadOnly),'no virtual steel in physical model')
  near(steelWeight(s,m),memberSchedule(s,m).total,'optimization/takeoff consistency')
  const length=(e:typeof header)=>{const a=m.nodes[e.n1-1],b=m.nodes[e.n2-1];return Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)}
  const removedSteel=sum(m.additions!.removedGirts!.map((e)=>sectionProps(e.section,s.code).A*1e-6*length(e)))*profileOf(s.code).materials[s.material].gamma/9.80665
  const headerSteel=sectionProps(header.section,s.code).A*1e-6*length(header)*profileOf(s.code).materials[s.material].gamma/9.80665
  near(memberSchedule(s,m).total,memberSchedule(plain,m0).total-removedSteel+headerSteel,'removed girts not in takeoff')
  // Compare independent global force and moment sums, with D self-weight excluded from BODF.
  const resultants=(model:typeof m,load:typeof l)=>{
    const out=new Map<string,number[]>()
    const add=(lc:string,x:number,y:number,z:number,fx:number,fy:number,fz:number,mx=0,my=0,mz=0)=>{
      const v=out.get(lc)??[0,0,0,0,0,0];out.set(lc,v)
      const dv=[fx,fy,fz,mx+y*fz-z*fy,my+z*fx-x*fz,mz+x*fy-y*fx];dv.forEach((n,i)=>v[i]+=n)
    }
    for(const [eid,rec] of Object.entries(load.BMLD) as [string,any][]) {
      const e=model.elements[+eid-1];ok(!!e,'no virtual load ID remains')
      const a=model.nodes[e.n1-1],b=model.nodes[e.n2-1],L=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)
      for(const it of rec.ITEMS){const f=[0,0,0];f[['GX','GY','GZ'].indexOf(it.DIRECTION)]=it.P[0]*L;add(it.LCNAME,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,...f as [number,number,number])}
    }
    for(const [nid,rec] of Object.entries(load.CNLD) as [string,any][])for(const it of rec.ITEMS){const n=model.nodes[+nid-1];add(it.LCNAME,n.x,n.y,n.z,it.FX??0,it.FY??0,it.FZ??0,it.MX??0,it.MY??0,it.MZ??0)}
    return out
  }
  const r=resultants(m,l),r0=resultants(m0,l0)
  for(const [lc,v] of r0) if(!/^(E|N)/.test(lc)) v.forEach((n,i)=>near(r.get(lc)?.[i]??0,n,`${s.code} closed-door ${lc} component ${i}`))
  const gamma=profileOf(s.code).materials[s.material].gamma
  near(l.info.seismic.W-l0.info.seismic.W,(headerSteel-removedSteel)*9.80665,'seismic change only actual steel; no ghost steel')
  for(const patch of [{bay:1},{bay:4},{height:2.123},{confirmed:false},{headerSection:'invalid'}]) {
    const bad=structuredClone(s);Object.assign(bad.additions!.wallOpening!,patch)
    ok(!!additionErrors(bad).length,`invalid opening ${JSON.stringify(patch)}`)
  }
  const both=structuredClone(s);both.features!.crane=true
  both.additions!.crane={id:'CR1',elevation:5.2,eccentricity:.3,wheelSpacing:3,maxWheel:45,minWheel:10,impactFactor:1.1,lateral:8,braking:5,seismicWeight:30,driftLimitMm:10,source:'Manufacturer',confirmed:true,runway:{section:s.sections.rafter,deflectionDivisor:600,source:'Runway project',confirmed:true}}
  both.additions!.factors={...both.additions!.factors,source:'Project load basis',confirmed:true}
  ok(!additionErrors(both).length,'combined runway + door')
  const b=buildPortal(both),bl=buildLoadPayloads(both,b),bg=buildGenPayloads(both,b)
  const runway=b.elements.filter((e)=>e.addition==='runway-beam'),meta=b.additions!
  ok(runway.length>8,'wheel/result stations split the eight physical runway beams')
  near(sum(meta.members.filter((v)=>v.key.includes(':runway:')).map((v)=>v.length)),44,'runway physical length')
  const used=new Set(b.elements.flatMap((e)=>[e.n1,e.n2]));ok(b.nodes.every((n)=>used.has(n.id)),'no orphan wheel nodes')
  const edges=new Set<string>()
  for(const e of b.elements){const key=[e.n1,e.n2].sort((a,b)=>a-b).join(':');ok(!edges.has(key),'no duplicate physical edges');edges.add(key)}
  for(const e of runway) {
    const group=meta.members.find((v)=>v.key===e.physicalKey)!,es=runway.filter((v)=>group.elementIds.includes(v.id))
    const end=(id:number)=>es.filter((v)=>v.n1===id||v.n2===id).length===1
    const release=(bg.FRLS[e.id] as any)?.ITEMS[0]
    if(end(e.n1)||end(e.n2)){ok(!!release,'physical span ends released');ok((release.FLAG_I==='0000110')===end(e.n1),'I release only at physical end');ok((release.FLAG_J==='0000110')===end(e.n2),'J release only at physical end')}
    else ok(!release,'no hinge at a wheel station')
  }
  for(const c of meta.craneCases) {
    const rows=meta.nodal.filter((v)=>v.case===c.name)
    near(sum(rows.map((v)=>v.fz)),-121,'wheel vertical force once')
    near(sum(rows.map((v)=>v.fx)),c.lateralSign*8,'lateral force once')
    near(sum(rows.map((v)=>v.fy)),c.brakingSign*5,'braking force once')
    const xmax=c.maxRail==='left'?.3:both.span-.3,xmin=both.span-xmax
    near(sum(rows.map((v)=>v.my-b.nodes[v.node-1].x*v.fz)),2*1.1*(45*xmax+10*xmin),'eccentric bracket moment conserved')
    ok(rows.filter((v)=>v.fz).every((v)=>[c.position,c.position+3].some((y)=>Math.abs(b.nodes[v.node-1].y-y)<1e-7)),'wheel loads on wheel nodes, no doubled support reactions')
  }
  const res:any={beam:new Map(),disp:new Map()}
  const force={P:0,Vy:0,Vz:0,My:0,Mz:0}
  for(const e of b.elements.filter((e)=>e.addition))res.beam.set(e.id,new Map([['AD_CR001',Array.from({length:5},()=>({...force,My:e.addition==='runway-beam'?10:0}))]]))
  for(const lc of ['D',...meta.craneCases.map((v)=>v.name)])res.disp.set(lc,new Map(b.nodes.map((n)=>[n.id,{dx:lc==='D'&&Math.abs(n.y-2.5)<1e-7?1:0,dy:0,dz:lc==='D'&&Math.abs(n.y-2.5)<1e-7?-.01:0}])))
  const design=additionDesign(both,b,bl.info,res,{members:[],byRole:{},service:[],maxRatio:0,ng:0} as any)
  for(const c of design.members.filter((v)=>v.addition==='runway-beam'))near(c.lengths!.Lb,meta.members.find((v)=>v.key===c.physicalKey)!.length*1000,'full unsupported length in strength check')
  near(design.service.find((v)=>v.key==='runwayDefl')!.ratio,1.2,'10 mm relative deflection vs 5m/600')
  near(design.service.find((v)=>v.key==='craneDefl')!.ratio,0,'interior wheel nodes are not crane support drift stations')
  ok(buildDrawingSvgs({spec:both,model:b,connections:null,title:'Phase5'}).some((v)=>v.name.startsWith('S8')),'side elevation sheet')
  // One crane confirmation covers the runway model as well
  const unconfirmed=structuredClone(both);unconfirmed.additions!.crane!.confirmed=false
  assert.throws(()=>buildLoadPayloads(unconfirmed,b));checks++
}
console.log(`phase 5: ${checks} checks passed`)
