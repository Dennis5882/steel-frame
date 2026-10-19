import { Construction, Layers, PanelTop, Link2, Package, ChevronDown } from 'lucide-react'
import type { FactorySpec } from '../domain/types'
import type { FactoryAdditions } from '../domain/additionTypes'
import type { ScopeFeatures } from '../domain/scope'
import { additionErrors } from '../domain/additions'
import { t, type I18nKey } from '../i18n'
import { AdditionEditor } from './AdditionEditor'
import { inputNumberText } from './NumericInput'
import {craneTravel} from '../domain/craneTravel'
import { ADDITION_PARTS, additionPartActive, additionPartForPath, type AdditionPart } from './modelingFlow'

const titles:Record<AdditionPart,I18nKey>={crane:'ms_crane',platform:'ms_platform',opening:'ms_openings',link:'ms_link',equipment:'ms_equipment',factors:'add_factors'}
const icons={crane:Construction,platform:Layers,opening:PanelTop,link:Link2,equipment:Package}
const stateKey=(active:boolean,bad:boolean)=>!active?'ms_none':bad?'ms_needs':'ms_checked'

export function StructureEditor({spec,onFeaturesChange,onChange,disabled,attempted=false,idPrefix}:{
  spec:FactorySpec;onFeaturesChange(v:ScopeFeatures):void;onChange(v:FactoryAdditions):void;disabled:boolean;attempted?:boolean;idPrefix:string
}) {
  const errors=additionErrors(spec)
  const editor=(part:AdditionPart)=><AdditionEditor spec={spec} value={spec.additions} onChange={onChange} disabled={disabled} attempted={attempted} idPrefix={idPrefix} part={part}/>
  const enable=(key:'crane'|'mezzanine'|'opening',label:I18nKey)=><label className="structure-enable">
    <input type="checkbox" checked={!!spec.features?.[key]} disabled={disabled} onChange={(e)=>onFeaturesChange({...spec.features!,[key]:e.target.checked})}/>{t(label)}
  </label>
  return <div className="structure-editor">
    <p className="mw-note">{t('ms_optional_note')}</p>
    <div className="structure-cards">{ADDITION_PARTS.map((part)=>{
      const active=additionPartActive(spec,part),bad=errors.some((e)=>additionPartForPath(e.path)===part),Icon=icons[part]
      return <details key={part} className={`structure-card structure-card-${part}`} id={`${idPrefix}-${part}`} open={attempted&&bad || undefined}>
        <summary><Icon size={19}/><span><strong>{t(titles[part])}</strong><small>{t(`ms_${part}_hint`)}</small></span><span className="structure-status" data-state={!active?'none':bad?'needs':'checked'}>{t(stateKey(active,bad))}</span><ChevronDown className="structure-chevron" size={15}/></summary>
        <div className="structure-card-body">
          {part==='crane'&&enable('crane','ms_enable_crane')}
          {part==='platform'&&enable('mezzanine','ms_enable_platform')}
          {part==='opening'&&enable('opening','ms_enable_wall')}
          {editor(part)}
          {part==='opening'&&!spec.features?.mezzanine&&<p className="mw-note">{t('ms_floor_dependency')}</p>}
        </div>
      </details>
    })}</div>
    {additionPartActive(spec,'factors')&&<div className="structure-factors"><p className="mw-note">{t('ms_factors_hint')}</p>{editor('factors')}</div>}
  </div>
}

/** Compact review of the same inputs; loads and final review never duplicate the editor. */
export function StructureSummary({spec,onEdit,disabled=false}:{spec:FactorySpec;onEdit?:()=>void;disabled?:boolean}) {
  const errors=additionErrors(spec),a=spec.additions
  const parts=ADDITION_PARTS.filter((p)=>additionPartActive(spec,p))
  const n=(x:number|undefined)=>x!==undefined&&Number.isFinite(x)?inputNumberText(x):'—'
  const travel=craneTravel(spec)
  const detail=(part:AdditionPart)=>{
    switch(part) {
      case 'crane':return `${travel.valid?t('crane_travel_summary',travel.firstBay+1,travel.lastBay+1,n(travel.length)):'—'} · ${t('add_elevation')} ${n(a?.crane?.elevation)} m · ${t('add_maxWheel')} ${n(a?.crane?.maxWheel)} kN${a?.crane?.runway?` · ${a.crane.runway.section}`:''}`
      case 'platform':return `${t('add_elevation')} ${n(a?.platform?.elevation)} m · ${a?.platform?.beamSection??'—'} / ${a?.platform?.columnSection??'—'} · D ${n(a?.platform?.dead)} / L ${n(a?.platform?.live)} kN/m²`
      case 'opening':return [spec.features?.opening?t('add_wallOpening'):null,a?.roofOpening?t('p6_roof'):null,spec.features?.mezzanine&&a?.floorOpening?t('p6_floor'):null].filter(Boolean).join(' · ')
      case 'link':return a?.link?t(`p6_${a.link.mode}`):'—'
      case 'equipment':return `${t('ms_equipment_count',a?.equipment.length??0)} · ${n(a?.equipment.reduce((sum,e)=>sum+e.weight,0))} kN`
      default:return ''
    }
  }
  return <section className="structure-summary"><header><h4>{t('mw_additions')}</h4>{onEdit&&<button type="button" className="btn btn-ghost btn-s" disabled={disabled} onClick={onEdit}>{t('edit_btn')}</button>}</header>
    {parts.length?<><ul>{parts.map((part)=><li key={part}><strong>{t(titles[part])}</strong><span>{detail(part)}</span><small>{t(stateKey(true,errors.some((e)=>additionPartForPath(e.path)===part)))}</small></li>)}</ul><p className="mw-note">{t('ms_summary_note')}</p></>:<p className="mw-note">{t('ms_none_summary')}</p>}
  </section>
}
