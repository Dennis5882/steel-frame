import {craneTravel} from './craneTravel'
import { profileOf } from '../codes'
import { capacity, check } from '../codes/twSteel'
import { cnCapacity, cnCheck } from '../codes/cnSteel'
import { krCapacity, krCheck } from '../codes/krSteel'
import type { Results } from '../actions/results'
import type { DesignResult, MemberCheck } from './design'
import type { FactoryModel, FactorySpec, ElementRole } from './types'
import type { LoadInfo } from './loads'
import { sectionProps } from './sections'
import { activeCrane, activePlatform } from './additions'
import {linkReview,simpleBeamDeflection} from './phase6'
import {buildLoadPayloads} from './loads'

/** Preliminary H-member checks. Splitting creates result stations, never lateral restraints. */
export function additionDesign(s: FactorySpec, m: FactoryModel, info: LoadInfo, res: Results, d: DesignResult, roles?: readonly ElementRole[]): DesignResult {
  if (!m.additions) return d
  const prof = profileOf(s.code), mat = prof.materials[s.material]
  const nodes = new Map(m.nodes.map((n)=>[n.id,n]))
  for (const e of m.elements.filter((e)=>e.addition && (!roles || roles.includes(e.role)))) {
    const sp = sectionProps(e.section, s.code), member = m.additions.members.find((p)=>p.key===e.physicalKey)!
    const L = member.length * 1000, K = e.addition === 'platform-column' ? 2 : 1
    const lens = {KLx:K*L,KLy:K*L,Lb:L}, fy = prof.fyAt?.(s.material,Math.max(sp.tf,sp.tw)) ?? mat.fy
    let best: MemberCheck | undefined
    for (const [combo, pts] of res.beam.get(e.id) ?? []) {
      if (info.comboKind[combo] !== 'basic') continue
      for (const [part, pt] of pts.entries()) {
        const forces = {P:pt.P,Mx:Math.abs(pt.My),My:Math.abs(pt.Mz),V:Math.abs(pt.Vz)}
        const cap = s.code==='CN' ? cnCapacity(sp,s.material,lens,Math.max(0,-pt.P)) : s.code==='KR' ? krCapacity(sp,fy,lens,1) : capacity(sp,fy,mat.E,lens,1,Math.max(0,-pt.P))
        const pe = Math.PI**2 * mat.E * Math.min(sp.Ix/lens.KLx**2,sp.Iy/lens.KLy**2) / 1000
        const B = pt.P < 0 ? 1 / Math.max(.01,1+pt.P/pe) : 1
        const result = s.code==='CN' ? cnCheck(cap as ReturnType<typeof cnCapacity>,forces,B) : s.code==='KR' ? krCheck(cap as ReturnType<typeof krCapacity>,forces,B) : check(cap,forces,B)
        const slender = {value:cap.KLr,limit:pt.P < -.001 ? 200 : 300}
        const ratio = Math.max(result.ratio,slender.value/slender.limit)
        if (best && best.ratio >= ratio) continue
        best = {addition:e.addition,physicalKey:e.physicalKey,id:e.id,role:e.role,section:e.section,ratio,combo,part,eq:ratio>result.ratio?'KL/r':result.eq,forces,cap,B,Cb:1,lengths:lens,slender,notes:cap.notes,
          issues:[{key:'addition',level:'review',detail:e.physicalKey!},...(cap.compact==='slender'?[{key:'sectionRange' as const,level:'blocked' as const,detail:e.section}]:[])]}
      }
    }
    if (!best) throw new Error(`Missing addition member force: ${e.id}`)
    d.members.push(best)
  }
  // Added intermediate floors and crane actions change the system assumptions, including base members.
  for (const member of d.members) if (!member.issues?.some((i)=>i.key==='addition')) member.issues=[...member.issues??[],{key:'addition',level:'review',detail:'load concurrency / seismic system / connections / foundations'}]
  for (const member of d.members) if (!d.byRole[member.role] || d.byRole[member.role]!.ratio < member.ratio) d.byRole[member.role]=member
  d.maxRatio = d.members.reduce((max,v)=>Math.max(max,v.ratio),0); d.ng=d.members.filter((v)=>v.ratio>1).length
  if (roles) return d
  const roof=s.additions?.roofOpening
  if(roof) {
    const loads=buildLoadPayloads(s,m),cases=['LR',...(Object.values(loads.STLD) as {NAME:string}[]).map((v)=>v.NAME).filter((n)=>/^(SN|SH)/.test(n))]
    let best={value:0,limit:1,ratio:0},lc='LR'
    for(const e of m.elements.filter((v)=>v.addition==='roof-trimmer')) {
      const a=nodes.get(e.n1)!,b=nodes.get(e.n2)!,L=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),sp=sectionProps(e.section, s.code)
      const items=(loads.BMLD[e.id] as {ITEMS:any[]}).ITEMS
      const q=(name:string)=>items.filter((v)=>v.LCNAME===name&&v.DIRECTION==='GZ').reduce((sum,v)=>sum+v.P[0],0)
      for(const name of cases) {
        const value=simpleBeamDeflection(q('D')+q(name)-mat.gamma*sp.A*1e-6,L,mat.E,sp.Ix),limit=L/roof.deflectionDivisor,ratio=value/limit
        if(ratio>best.ratio){best={value,limit,ratio};lc=name}
      }
    }
    d.service.push({key:'roofOpeningDefl',...best,case:`D + ${lc}`,clause:`Web estimate 5qL^4/(384EI); app section properties; project L/${roof.deflectionDivisor}; no shear deflection`})
  }
  const link=s.additions?.link
  if(link) {
    const r=linkReview(link)
    d.service.push({key:'linkGap',value:r.required/1000,limit:link.availableGapMm/1000,ratio:r.gapRatio,case:'PROJECT',clause:'Project |uA| + |uB| + thermal + tolerance; no coupled analysis'})
    if(link.mode==='sliding')d.service.push({key:'linkSeat',value:r.required/1000,limit:(link.seatLengthMm-link.minBearingMm)/1000,ratio:r.seatRatio,case:'PROJECT',clause:'Project residual seating length; minimum bearing by designer'})
  }
  const platform = activePlatform(s), crane = activeCrane(s)
  if (platform) {
    let best = {value:0,limit:1,ratio:0}
    for (const member of m.additions.members.filter((v)=>v.source===platform.id)) {
      const es = m.elements.filter((e)=>member.elementIds.includes(e.id) && (e.addition==='platform-beam'||e.addition==='floor-trimmer'))
      if (!es.length) continue
      const ids = [...new Set(es.flatMap((e)=>[e.n1,e.n2]))], ends = ids.filter((id)=>es.filter((e)=>e.n1===id||e.n2===id).length===1)
      if (ends.length!==2) continue
      const a=nodes.get(ends[0])!, b=nodes.get(ends[1])!, L=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)
      const dz=(id:number)=>(res.disp.get('D')!.get(id)!.dz+res.disp.get('PL')!.get(id)!.dz)
      const da=dz(a.id), db=dz(b.id)
      for (const id of ids) {
        const n=nodes.get(id)!, t=((n.x-a.x)*(b.x-a.x)+(n.y-a.y)*(b.y-a.y))/L**2
        const value=Math.abs(dz(id)-da-(db-da)*t), limit=L/platform.deflectionDivisor, ratio=value/limit
        if (ratio>best.ratio) best={value,limit,ratio}
      }
    }
    d.service.push({key:'platformDefl',...best,case:'D + PL',clause:`Project L/${platform.deflectionDivisor}; nodal relative deflection`})
  }
  if (crane) {
    if(crane.runway) {
      let best={value:0,limit:1,ratio:0}, lc=''
      for(const member of m.additions.members.filter((v)=>v.key.startsWith(`${crane.id}:runway:`))) {
        const es=m.elements.filter((e)=>member.elementIds.includes(e.id)),ids=[...new Set(es.flatMap((e)=>[e.n1,e.n2]))]
        const ends=ids.filter((id)=>es.filter((e)=>e.n1===id||e.n2===id).length===1).map((id)=>nodes.get(id)!).sort((a,b)=>a.y-b.y)
        const [a,b]=ends, L=b.y-a.y
        for(const cc of m.additions.craneCases) {
          const dz=(id:number)=>res.disp.get('D')!.get(id)!.dz+res.disp.get(cc.name)!.get(id)!.dz
          for(const id of ids) {
            const y=nodes.get(id)!.y, value=Math.abs(dz(id)-dz(a.id)-(dz(b.id)-dz(a.id))*(y-a.y)/L),limit=L/crane.runway.deflectionDivisor,ratio=value/limit
            if(ratio>best.ratio){best={value,limit,ratio};lc=cc.name}
          }
        }
      }
      d.service.push({key:'runwayDefl',...best,case:`D + ${lc}`,clause:`Project L/${crane.runway.deflectionDivisor}; impacted static samples; relative nodal deflection`})
    }
    let value=0, lc=''
    const stations=craneTravel(s).stations
    for (const c of m.additions.craneCases) for (const n of m.nodes.filter((n)=>Math.abs(n.z-crane.elevation)<1e-7 && (n.x===0||n.x===s.span) && stations.some((y)=>Math.abs(n.y-y)<1e-7))) {
      const base=res.disp.get('D')!.get(n.id)!, disp=res.disp.get(c.name)!.get(n.id)!
      const v=Math.hypot(base.dx+disp.dx,base.dy+disp.dy)
      if (v>value) {value=v;lc=c.name}
    }
    const limit=crane.driftLimitMm/1000
    d.service.push({key:'craneDefl',value,limit,ratio:value/limit,case:`D + ${lc}`,clause:'Project horizontal displacement limit; static positions'})
  }
  return d
}
