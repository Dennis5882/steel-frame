import assert from 'node:assert/strict'
import {defaultSpecFor} from '../src/domain/types'
import {TEMPLATES} from '../src/domain/templates'
import {defaultAdditions,additionErrors} from '../src/domain/additions'
import {craneTravel} from '../src/domain/craneTravel'
import {craneInputIssues} from '../src/domain/craneInput'
import {buildPortal} from '../src/domain/portal'
import {buildLoadPayloads} from '../src/domain/loads'
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} / ${b}`)
let cases=0
for(const code of ['TW','CN','KR'] as const){
  const s={...structuredClone(defaultSpecFor(code)),...TEMPLATES.logistics,bayList:undefined,features:{crane:true,mezzanine:false,multiSpan:false,opening:false}}
  s.additions=defaultAdditions(s)
  s.additions.factors={...s.additions.factors,source:'Project load basis',confirmed:true}
  s.additions.crane={id:'crane-travel',elevation:5.2,eccentricity:.3,wheelSpacing:3,maxWheel:45,minWheel:10,impactFactor:1.1,lateral:8,braking:5,seismicWeight:30,driftLimitMm:10,source:'Manufacturer',confirmed:true,runway:{section:s.sections.rafter,deflectionDivisor:600,source:'Runway basis',confirmed:true}}
  assert.deepEqual(additionErrors(s),[])
  const all=buildPortal(s),explicit=structuredClone(s)
  explicit.additions!.crane!.travel={firstBay:0,lastBay:9}
  assert.deepEqual(buildPortal(explicit),all,'Omitted travel preserves legacy full-building geometry and loads')
  for(const unequal of [false,true])for(const partial of [false,true])for(const runway of [false,true]){
    const spec=structuredClone(s),c=spec.additions!.crane!
    if(unequal)spec.bayList=[3,4,4,3,8,7,6,5,9,6]
    if(partial)c.travel={firstBay:2,lastBay:5}
    if(!runway)c.runway=undefined
    const r=craneTravel(spec),before=JSON.stringify(spec),m=buildPortal(spec),loads=buildLoadPayloads(spec,m)
    assert.equal(JSON.stringify(spec),before,'Generation does not change the building or selected operating range')
    assert.equal(spec.bays,10);assert.equal(spec.span,36)
    assert.equal(m.nodes.reduce((max,n)=>Math.max(max,n.y),0),unequal?55:80)
    const nodes=new Map(m.nodes.map(n=>[n.id,n]))
    for(const cc of m.additions!.craneCases){
      cases++
      assert.ok(cc.position>=r.start-1e-7&&cc.position+c.wheelSpacing<=r.end+1e-7,'Both wheels stay inside the selected range')
      const ns=m.additions!.nodal.filter(n=>n.case===cc.name)
      for(const n of ns)assert.ok(nodes.get(n.node)!.y>=r.start-1e-7&&nodes.get(n.node)!.y<=r.end+1e-7,'No crane reaction outside the selected range')
      near(ns.reduce((v,n)=>v+n.fz,0),-2*(c.maxWheel+c.minWheel)*c.impactFactor)
      near(ns.reduce((v,n)=>v+n.fx,0),cc.lateralSign*c.lateral)
      near(ns.reduce((v,n)=>v+n.fy,0),cc.brakingSign*c.braking)
      near(ns.reduce((v,n)=>v+n.fz*nodes.get(n.node)!.y,0),-2*(c.maxWheel+c.minWheel)*c.impactFactor*(cc.position+c.wheelSpacing/2))
      assert.ok(Object.values(loads.STLD).some((v:any)=>v.NAME===cc.name))
      assert.ok(Object.values(loads['LCOM-GEN']).some((v:any)=>v.NAME===`AD_${cc.name}`))
    }
    const rails=m.additions!.members.filter(v=>v.key.includes(':runway:'))
    assert.equal(rails.length,runway?2*(r.lastBay-r.firstBay+1):0)
    near(rails.reduce((v,n)=>v+n.length,0),runway?2*r.length:0)
    const source=m.additions!.sources.find(v=>v.id===c.id)!
    near(source.seismic-source.dead,c.seismicWeight)
    for(const weight of m.additions!.seismicWeights.filter(w=>w.source===c.id))assert.ok(nodes.get(weight.node)!.y>=r.start-1e-7&&nodes.get(weight.node)!.y<=r.end+1e-7)
  }
  for(const travel of [{firstBay:-1,lastBay:3},{firstBay:3,lastBay:2},{firstBay:0,lastBay:10},{firstBay:.5,lastBay:5}]){
    const bad=structuredClone(s);bad.additions!.crane!.travel=travel
    assert.ok(craneInputIssues(bad).some(e=>e.kind==='travel'));assert.throws(()=>buildPortal(bad))
  }
  const short=structuredClone(s);short.additions!.crane!.travel={firstBay:2,lastBay:2};short.additions!.crane!.wheelSpacing=8
  assert.ok(craneInputIssues(short).some(e=>e.field==='wheelSpacing'))
}
console.log(`Crane travel: TW/CN/KR ten-bay full/partial ranges, unequal bays, runway/frame loads, ${cases} static cases, force and moment balance, mass and physical lengths passed`)
