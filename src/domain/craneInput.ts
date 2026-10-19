import type { FactorySpec } from './types'
import { baySpans } from './types'
import { portalGeometry } from './portal'
import { sectionCatalogOptions } from './sectionCatalog'
import {craneTravel} from './craneTravel'

export interface CraneInputIssue {
  field:string
  kind:'positive'|'nonnegative'|'positiveBelow'|'nonnegativeBelow'|'range'|'minimum'|'minWheel'|'source'|'confirm'|'travel'|'section'|'elevationConflict'|'missing'
  min?:number; max?:number
}
/** Shared by model validation and field-level UI; these are existing model limits. */
export function craneInputIssues(s:FactorySpec,requireConfirmation=true):CraneInputIssue[] {
  if(!s.features?.crane)return []
  const c=s.additions?.crane
  if(!c)return [{field:'configuration',kind:'missing'}]
  const out:CraneInputIssue[]=[],g=portalGeometry(s),height=Math.min(...g.eaveXs.map(g.zAt)),length=baySpans(s).reduce((a,b)=>a+b,0)
  const travel=craneTravel(s)
  if(!travel.valid){
    if(!Number.isInteger(travel.firstBay)||travel.firstBay<0||travel.firstBay>=s.bays)out.push({field:'travel.firstBay',kind:'travel'})
    if(!Number.isInteger(travel.lastBay)||travel.lastBay<travel.firstBay||travel.lastBay>=s.bays||travel.lastBay<0)out.push({field:'travel.lastBay',kind:'travel'})
  }
  const below=(field:'elevation'|'eccentricity'|'wheelSpacing',max:number,positive:boolean)=>{
    if(!Number.isFinite(c[field]) || (positive?c[field]<=0:c[field]<0) || c[field]>=max)out.push({field,kind:positive?'positiveBelow':'nonnegativeBelow',max})
  }
  below('elevation',height,true);below('eccentricity',s.span/4,false);below('wheelSpacing',travel.valid?travel.length:length,true)
  for(const field of ['maxWheel','driftLimitMm'] as const)if(!Number.isFinite(c[field])||c[field]<=0)out.push({field,kind:'positive'})
  if(!Number.isFinite(c.minWheel)||c.minWheel<0||(Number.isFinite(c.maxWheel)&&c.minWheel>c.maxWheel))out.push({field:'minWheel',kind:'minWheel'})
  if(!Number.isFinite(c.impactFactor)||c.impactFactor<1||c.impactFactor>3)out.push({field:'impactFactor',kind:'range',min:1,max:3})
  for(const field of ['lateral','braking','seismicWeight'] as const)if(!Number.isFinite(c[field])||c[field]<0)out.push({field,kind:'nonnegative'})
  // One confirmation covers loads, placement and the runway model. The basis text and maker are optional:
  // an undecided maker is reported as an assumption (scope warning) instead of blocking the model.
  if(requireConfirmation&&!c.confirmed)out.push({field:'confirmed',kind:'confirm'})
  if(c.runway){
    const r=c.runway
    if(!sectionCatalogOptions(s.code,'rafter',s.material).some(v=>v.name===r.section&&v.shape==='H'))out.push({field:'runway.section',kind:'section'})
    if(!Number.isFinite(r.deflectionDivisor)||r.deflectionDivisor<100)out.push({field:'runway.deflectionDivisor',kind:'minimum',min:100})
    if([0,s.span].some(x=>g.girtZsAt(x).some(z=>Math.abs(z-c.elevation)<1e-7)))out.push({field:'elevation',kind:'elevationConflict'})
  }
  return out
}
