import { useEffect, useId, useState } from 'react'
import { t, type I18nKey } from '../i18n'
import { additionErrors, cranePositions, defaultAdditions, defaultOpening, defaultPlatform, openingBayOptions } from '../domain/additions'
import { portalGeometry } from '../domain/portal'
import {Phase6Editor} from './Phase6Editor'
import type { FactoryAdditions } from '../domain/additionTypes'
import type { FactorySpec } from '../domain/types'
import { inputNumberText, NumericInput } from './NumericInput'
import { sectionCatalogOptions } from '../domain/sectionCatalog'
import { additionPartForPath, type AdditionPart } from './modelingFlow'
import {craneInputIssues,type CraneInputIssue} from '../domain/craneInput'
import {craneTravel} from '../domain/craneTravel'

function craneIssueText(issue:CraneInputIssue,spec:FactorySpec):string {
  const key=issue.field.replace(/^(runway|travel)\./,''),label=key==='confirmed'?t(issue.field.startsWith('runway.')?'add_runway':'ms_crane'):(issue.field.startsWith('runway.')?t('add_runway')+' · ':'')+t((key==='section'?'add_beamSection':key==='configuration'?'add_crane':`add_${key}`) as I18nKey)
  switch(issue.kind){
    case 'travel':return t('crane_travel_error',spec.bays)
    case 'positiveBelow':case 'nonnegativeBelow':return t(`ms_crane_${issue.kind}`,label,inputNumberText(issue.max!))
    case 'range':return t('ms_crane_range',label,issue.min!,issue.max!)
    case 'minimum':return t('ms_crane_minimum',label,issue.min!)
    case 'positive':case 'nonnegative':case 'source':case 'confirm':return t(issue.kind==='confirm'?'ms_crane_error_confirm':`ms_crane_${issue.kind}`,label)
    default:return t(`ms_crane_${issue.kind}`)
  }
}

export function AdditionNumber({value,onValueChange,...props}: Omit<Parameters<typeof NumericInput>[0],'value'|'onValueChange'> & {value:number;onValueChange(v:number):void}) {
  const [raw,setRaw]=useState(inputNumberText(value))
  useEffect(()=>{if(!Object.is(raw.trim()===''?NaN:Number(raw),value))setRaw(inputNumberText(value))},[value])
  return <NumericInput {...props} value={raw} onValueChange={(v)=>{setRaw(v);onValueChange(v.trim()===''?NaN:Number(v))}}/>
}

export function AdditionEditor({spec, value, onChange, disabled, attempted = false, idPrefix, part}: {
  spec: FactorySpec; value?: FactoryAdditions; onChange(v: FactoryAdditions): void; disabled: boolean; attempted?: boolean; idPrefix?:string; part?:AdditionPart
}) {
  const id = useId(), a = value ?? defaultAdditions(spec)
  const craneIssues=craneInputIssues(spec),showCraneErrors=attempted||disabled
  const cranePath=(o:{id?:string},key:string)=>a.crane&&o.id===a.crane.id?key:a.crane&&o.id===a.crane.id+'-runway'?'runway.'+key:a.crane&&o.id===a.crane.id+'-travel'?'travel.'+key:undefined
  const update = (v: FactoryAdditions) => {
    const craneBasis=(c:FactoryAdditions['crane'])=>c && Object.fromEntries(Object.entries(c).filter(([k])=>!['runway','confirmed','source'].includes(k)))
    if(v.crane?.runway && JSON.stringify(craneBasis(v.crane))!==JSON.stringify(craneBasis(a.crane))) v={...v,crane:{...v.crane,runway:{...v.crane.runway,confirmed:false}}}
    // The single crane confirmation also covers the runway model
    const runwayBasis=(c:FactoryAdditions['crane'])=>JSON.stringify(c?.runway&&{...c.runway,confirmed:undefined,source:undefined})
    if(v.crane&&a.crane&&runwayBasis(v.crane)!==runwayBasis(a.crane)) v={...v,crane:{...v.crane,confirmed:false}}
    const platformBasis=(p:FactoryAdditions['platform'])=>p&&Object.fromEntries(Object.entries(p).filter(([k])=>!['confirmed','source'].includes(k)))
    if(v.floorOpening&&JSON.stringify(platformBasis(v.platform))!==JSON.stringify(platformBasis(a.platform)))v={...v,floorOpening:{...v.floorOpening,confirmed:false}}
    onChange(v)
  }
  const input = (o: Record<string, any>, k: string, change: (v: any) => void, unit = '', label: I18nKey = `add_${k}` as I18nKey) => {
    const num = typeof o[k] === 'number', fid = `${id}-${o.id ?? 'factors'}-${k}`
    const craneField=cranePath(o,k),issues=showCraneErrors?craneIssues.filter(e=>e.field===craneField):[],bad=issues.length>0||(attempted&&k==='source'&&!craneField&&!String(o[k]).trim())
    const errorProps={'aria-invalid':bad||undefined,'aria-describedby':bad?`${fid}-error`:undefined}
    return <div className="pe-f" key={k} data-crane-field={craneField}><label htmlFor={fid}>{t(label)}</label><div className="pe-in">
      {['beamSection','columnSection','headerSection','section'].includes(k) ? <select {...errorProps} id={fid} value={o[k]} disabled={disabled} onChange={(e)=>change(e.target.value)}>
        {sectionCatalogOptions(spec.code,k==='beamSection'?'rafter':'column',spec.material).filter((v)=>v.shape==='H').map((v)=><option key={v.name} value={v.name}>{v.name}{v.selectionStatus==='normal'?'':' ⚠'}</option>)}
      </select> : num ? <AdditionNumber {...errorProps} id={fid} value={o[k]} disabled={disabled} step={(/Bay$/.test(k)||k==='bay') ? 1 : .1} min={(/Bay$/.test(k)||k==='bay')?1:0} onValueChange={change}/>
        : <input {...errorProps} id={fid} value={o[k]} disabled={disabled} onChange={(e)=>change(e.target.value)} />}
      {unit && <span className="pe-u">{unit}</span>}
    </div>{bad&&<small className="mw-error" id={`${fid}-error`}>{issues.length?issues.map(e=>craneIssueText(e,spec)).join(' '):t('mw_required')}</small>}{(k==='beamSection'||k==='columnSection') && <small>{t('add_catalog_note')}</small>}</div>
  }
  const confirm = (o: {id?:string;source:string;confirmed:boolean}, change: (patch: Partial<typeof o>)=>void) => <>
    {input(o,'source',(v)=>change({source:v,confirmed:false}))}
    <label className="pe-f pe-full" data-crane-field={cranePath(o,'confirmed')}><span><input type="checkbox" checked={o.confirmed} disabled={disabled || !o.source.trim()} aria-invalid={attempted&&!o.confirmed||undefined} onChange={(e)=>change({confirmed:e.target.checked})}/> {t('add_confirm')}</span>{attempted&&!o.confirmed&&<small className="mw-error">{!o.source.trim()?t('ms_crane_source',t('add_source')):t('ms_confirm_needed')}</small>}</label>
  </>
  const c = a.crane, p = a.platform, f = a.factors
  const travel=craneTravel(spec)
  const craneCases=c&&travel.valid&&c.wheelSpacing>0&&c.wheelSpacing<travel.length?cranePositions(travel.stations,c.wheelSpacing,!!c.runway).length*2*(c.lateral?2:1)*(c.braking?2:1):0
  const show = (name: AdditionPart) => !part || part === name
  return <section className="mw-group addition-editor">{!part && <><h4>{t('add_title')}</h4><p className="mw-note">{t('add_note')}</p></>}
    {show('equipment') && <div id={`${idPrefix??id}.equipment`} tabIndex={-1}>{a.equipment.map((e, i) => {
      const change = (patch: object) => update({...a,equipment:a.equipment.map((v,j)=>j===i?{...v,...patch}:v)})
      return <fieldset key={e.id} disabled={disabled}><legend>{t('add_equipment')} {i+1}</legend><div className="pe-grid">
        {(['name','x','y','weight','seismicFraction'] as const).map((k)=>input(e,k,(v)=>change({[k]:v,confirmed:false}),k==='x'||k==='y'?'m':k==='weight'?'kN':'',k==='seismicFraction'?'add_mass':`add_${k}`))}
        {confirm(e,change)}
      </div><button type="button" className="btn btn-s" disabled={disabled} onClick={()=>update({...a,equipment:a.equipment.filter((_,j)=>j!==i)})}>{t('add_remove')}</button></fieldset>
    })}
    <button type="button" className="btn btn-s" disabled={disabled} onClick={()=>update({...a,equipment:[...a.equipment,{id:crypto.randomUUID(),name:`${t('add_equipment')} ${a.equipment.length+1}`,x:spec.span/2,y:0,weight:0,seismicFraction:1,source:'',confirmed:false}]})}>{t('add_add')}</button></div>}
    {show('crane') && spec.features?.crane && c && <fieldset id={`${idPrefix??id}.crane`} tabIndex={-1} disabled={disabled}><legend>{t('add_crane')}</legend><p className="mw-note">{t('add_crane_note')}</p>
      {showCraneErrors&&craneIssues.length>0&&<div className="crane-error-summary" role="alert"><strong>{t('ms_crane_errors',craneIssues.length)}</strong><ul>{craneIssues.map((issue,i)=><li key={i}><button type="button" data-error-target disabled={disabled} onClick={e=>{
        const fieldKey=issue.field
        const field=e.currentTarget.closest('fieldset')?.querySelector<HTMLElement>(`[data-crane-field="${fieldKey}"]`),target=field?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled)')??field
        if(target){if(target===field)target.setAttribute('tabindex','-1');target.focus();target.scrollIntoView({block:'center',behavior:'smooth'})}
      }}>{craneIssueText(issue,spec)}</button></li>)}</ul></div>}
      {craneCases>0&&<p className="mw-note">{t('crane_case_count',craneCases)}</p>}
      <section className="crane-step"><header><span>01</span><h5>{t('ms_crane_loads')}</h5></header><div className="pe-grid">
        {(['maxWheel','minWheel','impactFactor','lateral','braking','seismicWeight'] as const).map((k)=>input(c,k,(v)=>update({...a,crane:{...c,[k]:v,confirmed:false}}),k==='impactFactor'?'':'kN'))}
      </div></section>
      <section className="crane-step"><header><span>02</span><h5>{t('ms_crane_placement')}</h5></header>
        <div className="crane-model-options" role="group" aria-label={t('crane_travel_title')}>
          {[false,true].map(partial=><label key={String(partial)} className="crane-model-option" data-selected={!!c.travel===partial}><input type="radio" name={`${id}-travel-mode`} disabled={disabled} checked={!!c.travel===partial} onChange={()=>update({...a,crane:{...c,travel:partial?{firstBay:0,lastBay:spec.bays-1}:undefined,confirmed:false}})}/><span>{t(partial?'crane_travel_partial':'crane_travel_all')}</span></label>)}
        </div>
        {c.travel&&<div className="pe-grid">{(['firstBay','lastBay'] as const).map(k=>input({id:c.id+'-travel',...c.travel,[k]:c.travel![k]+1},k,v=>update({...a,crane:{...c,travel:{...c.travel!,[k]:v-1},confirmed:false}}),'',k==='firstBay'?'crane_travel_first':'crane_travel_last'))}</div>}
        {travel.valid&&<p className="mw-note">{t('crane_travel_summary',travel.firstBay+1,travel.lastBay+1,inputNumberText(travel.length))}</p>}
        <div className="pe-grid">
        {(['elevation','eccentricity','wheelSpacing','driftLimitMm'] as const).map((k)=>input(c,k,(v)=>update({...a,crane:{...c,[k]:v,confirmed:false}}),k==='driftLimitMm'?'mm':'m'))}
      </div></section>
      <section className="crane-step"><header><span>03</span><h5>{t('ms_crane_runway')}</h5></header>
        <div className="crane-model-options" role="group" aria-label={t('ms_crane_runway')}>
          {[false,true].map((runway)=><label key={String(runway)} className="crane-model-option" data-selected={!!c.runway===runway}>
            <input type="radio" name={`${id}-runway-mode`} disabled={disabled} checked={!!c.runway===runway} onChange={()=>update({...a,crane:{...c,confirmed:false,runway:runway?{section:spec.sections.rafter,deflectionDivisor:600,source:'',confirmed:false}:undefined}})}/>
            <span>{t(runway?'ms_crane_with_runway':'ms_crane_frame_only')}</span>
          </label>)}
        </div>
      {c.runway && <><p className="mw-note">{t('add_runway_note')}</p><div className="pe-grid">
        {input({...c.runway,id:c.id+'-runway'},'section',(v)=>update({...a,crane:{...c,runway:{...c.runway!,section:v,confirmed:false}}}))}
        {input({...c.runway,id:c.id+'-runway'},'deflectionDivisor',(v)=>update({...a,crane:{...c,runway:{...c.runway!,deflectionDivisor:v,confirmed:false}}}))}
      </div></>}
      </section>
      <section className="crane-step"><header><span>04</span><h5>{t('ms_crane_confirm')}</h5></header><div className="pe-grid">
        <div className="pe-f"><label htmlFor={`${id}-crane-maker`}>{t('add_manufacturer')}</label><div className="pe-in">
          <input id={`${id}-crane-maker`} value={c.manufacturer??''} placeholder={t('add_manufacturer_unset')} disabled={disabled} onChange={(e)=>update({...a,crane:{...c,manufacturer:e.target.value,confirmed:false}})}/></div>
          {!c.manufacturer?.trim()&&<small className="section-picker-warning">{t('add_manufacturer_note')}</small>}</div>
        <div className="pe-f"><label htmlFor={`${id}-crane-basis`}>{t('add_crane_basis')}</label><div className="pe-in">
          <input id={`${id}-crane-basis`} value={c.source} placeholder={t('add_crane_basis_ph')} disabled={disabled} onChange={(e)=>update({...a,crane:{...c,source:e.target.value,confirmed:false}})}/></div></div>
        <label className="pe-f pe-full" data-crane-field="confirmed"><span><input type="checkbox" checked={c.confirmed} disabled={disabled} aria-invalid={showCraneErrors&&!c.confirmed||undefined} onChange={(e)=>update({...a,crane:{...c,confirmed:e.target.checked}})}/> {t('add_crane_confirm')}</span></label>
      </div></section>
    </fieldset>}
    {show('opening') && spec.features?.opening && a.wallOpening && (()=>{
      const o=a.wallOpening!, change=(patch:object)=>update({...a,wallOpening:{...o,...patch,confirmed:false}})
      return <fieldset id={`${idPrefix??id}.wallOpening`} tabIndex={-1} disabled={disabled}><legend>{t('add_wallOpening')}</legend><p className="mw-note">{t('add_opening_note')}</p><div className="pe-grid">
        <div className="pe-f"><label htmlFor={`${id}-face`}>{t('add_face')}</label><select id={`${id}-face`} value={o.face} onChange={(e)=>change({face:e.target.value})}><option value="x0">X = 0</option><option value="xL">X = {spec.span} m</option></select></div>
        <div className="pe-f"><label htmlFor={`${id}-bay`}>{t('add_bay')}</label><select id={`${id}-bay`} value={o.bay} onChange={(e)=>change({bay:Number(e.target.value)})}>{openingBayOptions(spec).map((v)=><option key={v.bay} value={v.bay} disabled={v.braced}>{v.bay+1} · {v.width} m{v.braced?` · ${t('role_brace')}`:''}</option>)}</select></div>
        <div className="pe-f"><label htmlFor={`${id}-height`}>{t('add_height')}</label><select id={`${id}-height`} value={o.height} onChange={(e)=>change({height:Number(e.target.value)})}>{portalGeometry(spec).girtZsAt(o.face==='x0'?0:spec.span).filter((z)=>z>0 && z<portalGeometry(spec).zAt(o.face==='x0'?0:spec.span)).map((z)=><option key={z} value={z}>{+z.toFixed(3)} m</option>)}</select></div>
        {input(o,'headerSection',(v)=>change({headerSection:v}))}
        {confirm(o,(patch)=>update({...a,wallOpening:{...o,...patch}}))}
      </div></fieldset>
    })()}
    {show('platform') && spec.features?.mezzanine && p && <fieldset id={`${idPrefix??id}.platform`} tabIndex={-1} disabled={disabled}><legend>{t('add_platform')}</legend><p className="mw-note">{t('add_platform_note')}</p><div className="pe-grid">
      {(['elevation','x0','x1','firstBay','lastBay','beamSpacing','beamSection','columnSection','dead','live','liveMassFraction','deflectionDivisor'] as const).map((k)=>input(/Bay$/.test(k)?{...p,[k]:p[k as 'firstBay'|'lastBay']+1}:p,k,(v)=>update({...a,platform:{...p,[k]:/Bay$/.test(k)?v-1:v,confirmed:false}}),['elevation','x0','x1','beamSpacing'].includes(k)?'m':['dead','live'].includes(k)?'kN/m²':''))}
      {confirm(p,(patch)=>update({...a,platform:{...p,...patch}}))}
    </div></fieldset>}
    {(!part || part === 'opening' || part === 'link') && <Phase6Editor spec={spec} value={a} onChange={update} disabled={disabled} idPrefix={idPrefix??id} part={part === 'opening' ? 'openings' : part}/>}
    {show('factors') && (spec.features?.crane || spec.features?.mezzanine || a.link?.mode==='sliding') && <fieldset id={`${idPrefix??id}.factors`} tabIndex={-1} disabled={disabled}><legend>{t('add_factors')}</legend><div className="pe-grid">
      {(['dead','live','crane','accompanyingLive'] as const).map((k)=>input(f,k,(v)=>update({...a,factors:{...f,[k]:v,confirmed:false}}),'',`add_${k}`))}
      {confirm(f,(patch)=>update({...a,factors:{...f,...patch}}))}
    </div></fieldset>}
    {(attempted || disabled) && additionErrors(spec).filter((e)=>(!part || additionPartForPath(e.path)===part)&&!(e.path==='crane'&&craneIssues.length)).map((e,i)=><p className="mw-error" role="alert" key={i}>{t(e.key)} {e.name}</p>)}
  </section>
}

/** Features can be chosen before loads are known. Never manufacture rated-capacity wheel loads. */
export function initializeAdditions(spec: FactorySpec, a = spec.additions ?? defaultAdditions(spec)): FactoryAdditions {
  return {...a,
    crane: spec.features?.crane && !a.crane ? {id:'crane-1',elevation:Math.min(5,spec.eaveHeight*.65),eccentricity:.3,wheelSpacing:3,maxWheel:0,minWheel:0,impactFactor:1.1,lateral:0,braking:0,seismicWeight:0,driftLimitMm:10,source:'',confirmed:false} : a.crane,
    platform: spec.features?.mezzanine && !a.platform ? defaultPlatform(spec) : a.platform,
    wallOpening: spec.features?.opening && !a.wallOpening ? defaultOpening(spec) : a.wallOpening,
  }
}
