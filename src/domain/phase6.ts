import {portalGeometry} from './portal'
import {baySpans,type FactorySpec} from './types'
import {sectionCatalogOptions} from './sectionCatalog'
import type {FloorOpeningOptions,LinkOptions,RoofOpeningOptions} from './additionTypes'

export const activeFloorOpening=(s:FactorySpec)=>s.features?.mezzanine?s.additions?.floorOpening:undefined
export const hasPhase6=(s:FactorySpec)=>!!(s.additions?.roofOpening || activeFloorOpening(s) || s.additions?.link)
export const near=(a:number,b:number)=>Math.abs(a-b)<1e-7
/** The exact secondary-beam grid, including existing columns and gable posts. */
export function platformGridXs(s:FactorySpec):number[] {
  const p=s.additions?.platform
  if(!p || !(p.beamSpacing>0) || !(p.x1>p.x0) || (p.x1-p.x0)/p.beamSpacing>40)return []
  const g=portalGeometry(s),count=Math.ceil((p.x1-p.x0)/p.beamSpacing)
  const supports=[...g.eaveXs,...g.leanXs,...(p.firstBay===0 || p.lastBay===s.bays?g.postXs:[])]
  return [...Array.from({length:count+1},(_,i)=>p.x0+(p.x1-p.x0)*i/count),...supports.filter((x)=>x>=p.x0 && x<=p.x1)].sort((a,b)=>a-b).filter((v,i,all)=>i===0||!near(v,all[i-1]))
}
export function roofBayOptions(s:FactorySpec) {
  const spans=baySpans(s),L=spans.reduce((a,b)=>a+b,0)
  const wall=s.code==='CN'?(L>60?[Math.floor(s.bays/3),Math.floor(2*s.bays/3)]:[Math.floor((s.bays-1)/2)]):s.bays>=4?[1,s.bays-2]:[0,s.bays-1]
  const braced=s.code==='CN'?[0,...wall,s.bays-1]:wall
  return spans.map((width,bay)=>({bay,width,braced:braced.includes(bay)}))
}
export function defaultRoofOpening(s:FactorySpec):RoofOpeningOptions {
  const g=portalGeometry(s),plane=g.planes[0],xs=g.xs.filter((x)=>x>plane.xa && x<plane.xb)
  return {id:'roof-opening-1',bay:roofBayOptions(s).find((v)=>!v.braced)?.bay??0,x0:xs[0]??1,x1:xs[2]??3,section:s.sections.rafter,deflectionDivisor:360,source:'',confirmed:false}
}
export function defaultFloorOpening(s:FactorySpec):FloorOpeningOptions {
  const xs=platformGridXs(s),p=s.additions?.platform
  return {id:'floor-opening-1',bay:p?.firstBay??0,x0:xs[1]??1,x1:xs[3]??3,source:'',confirmed:false}
}
export function defaultLink(s:FactorySpec):LinkOptions {
  return {id:'link-1',mode:'sliding',face:'xL',frame:1,elevation:Math.min(4,s.eaveHeight*.5),aMovementMm:0,bMovementMm:0,thermalMovementMm:0,toleranceMm:0,availableGapMm:50,seatLengthMm:200,minBearingMm:75,loadFactor:1.5,cases:[{name:'CASE 1',fx:0,fy:0,fz:0,mx:0,my:0,mz:0}],source:'',confirmed:false}
}
export function linkReview(l:LinkOptions) {
  const required=l.aMovementMm+l.bMovementMm+l.thermalMovementMm+l.toleranceMm
  return {required,gapReserve:l.availableGapMm-required,seatReserve:l.seatLengthMm-l.minBearingMm-required,
    gapRatio:required/l.availableGapMm,seatRatio:required/(l.seatLengthMm-l.minBearingMm)}
}
/** Uniform-load, simply supported Euler-Bernoulli beam; returns m. App section approximation. */
export const simpleBeamDeflection=(q:number,L:number,E:number,I:number)=>5*Math.abs(q)*L**4/(384*(E*1000)*(I*1e-12))
export interface Phase6Error {path:'roofOpening'|'floorOpening'|'link';key:'p6_invalidRoof'|'p6_invalidFloor'|'p6_invalidLink';name:string}
export function phase6Errors(s:FactorySpec,requireConfirmation=true):Phase6Error[] {
  const out:Phase6Error[]=[],g=portalGeometry(s),r=s.additions?.roofOpening,f=activeFloorOpening(s),l=s.additions?.link,p=s.features?.mezzanine?s.additions?.platform:undefined
  const confirmed=(o:{source:string;confirmed:boolean})=>!requireConfirmation || o.confirmed&&!!o.source.trim()
  const ids=[...(s.additions?.equipment.map((v)=>v.id)??[]),...(s.features?.crane&&s.additions?.crane?[s.additions.crane.id]:[]),...(p?[p.id]:[]),...(s.features?.opening&&s.additions?.wallOpening?[s.additions.wallOpening.id]:[])]
  const unique=(id:string)=>{const valid=!!id&&!ids.includes(id);ids.push(id);return valid}
  if(r) {
    const plane=g.planes.find((v)=>r.x0>v.xa+1e-7 && r.x1<v.xb-1e-7)
    const xs=g.xs.filter((x)=>x>=r.x0-1e-7&&x<=r.x1+1e-7)
    const ys=baySpans(s).reduce((a,v)=>[...a,a.at(-1)!+v],[0])
    const equip=s.additions?.equipment.some((e)=>e.x>=r.x0&&e.x<=r.x1&&e.y>=ys[r.bay]&&e.y<=ys[r.bay+1])
    if(!unique(r.id)||!Number.isInteger(r.bay)||!roofBayOptions(s).some((v)=>v.bay===r.bay&&!v.braced)||!plane||xs.length<3||!near(xs[0],r.x0)||!near(xs.at(-1)!,r.x1)||!sectionCatalogOptions(s.code,'rafter',s.material).some((v)=>v.name===r.section&&v.shape==='H')||!(Number.isFinite(r.deflectionDivisor)&&r.deflectionDivisor>=100)||!confirmed(r)||equip)
      out.push({path:'roofOpening',key:'p6_invalidRoof',name:r.id})
  }
  if(f) {
    const xs=platformGridXs(s)
    if(!unique(f.id)||!p||!Number.isInteger(f.bay)||f.bay<p.firstBay||f.bay>=p.lastBay||!(f.x1>f.x0)||!xs.some((x)=>near(x,f.x0))||!xs.some((x)=>near(x,f.x1))||!(f.x0>p.x0&&f.x1<p.x1)||!confirmed(f))
      out.push({path:'floorOpening',key:'p6_invalidFloor',name:f.id})
  }
  if(l) {
    const movement=[l.aMovementMm,l.bMovementMm,l.thermalMovementMm,l.toleranceMm]
    const cases=l.cases??[]
    const forces=cases.flatMap((v)=>[v.fx,v.fy,v.fz,v.mx,v.my,v.mz])
    const collision=s.features?.crane && s.additions?.crane && near(s.additions.crane.elevation,l.elevation)
    if(!unique(l.id)||!['sliding','separate'].includes(l.mode)||!['x0','xL'].includes(l.face)||!Number.isInteger(l.frame)||l.frame<0||l.frame>s.bays||!(l.elevation>0&&l.elevation<g.zAt(l.face==='x0'?0:s.span))||!movement.every((v)=>Number.isFinite(v)&&v>=0)||!(Number.isFinite(l.availableGapMm)&&l.availableGapMm>0&&Number.isFinite(l.minBearingMm)&&l.minBearingMm>0&&Number.isFinite(l.seatLengthMm)&&l.seatLengthMm>l.minBearingMm)||!confirmed(l)||collision||!(l.loadFactor>=1&&l.loadFactor<=3)||!Number.isFinite(l.loadFactor)||
      (l.mode==='sliding'&&(!cases.length||cases.length>8||!cases.every((v)=>v.name.trim())||new Set(cases.map((v)=>v.name.trim())).size!==cases.length||!forces.every((v)=>Number.isFinite(v)&&Math.abs(v)<=1e6)||!forces.some((v)=>v!==0))))
      out.push({path:'link',key:'p6_invalidLink',name:l.id})
  }
  return out
}
