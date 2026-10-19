import {useId} from 'react'
import {t,type I18nKey} from '../i18n'
import type {FactorySpec} from '../domain/types'
import type {FactoryAdditions} from '../domain/additionTypes'
import {defaultRoofOpening,defaultFloorOpening,defaultLink,linkReview,platformGridXs,roofBayOptions} from '../domain/phase6'
import {portalGeometry} from '../domain/portal'
import {sectionCatalogOptions} from '../domain/sectionCatalog'
import {AdditionNumber} from './AdditionEditor'

export function Phase6Editor({spec,value:a,onChange,disabled,idPrefix,part}:{spec:FactorySpec;value:FactoryAdditions;onChange(v:FactoryAdditions):void;disabled:boolean;idPrefix:string;part?:'openings'|'link'}) {
  const id=useId(),g=portalGeometry(spec)
  const change=(kind:'roofOpening'|'floorOpening'|'link',patch:object)=>onChange({...a,[kind]:{...a[kind],...patch,confirmed:false}})
  const num=(key:string,value:number,update:(v:number)=>void,unit='mm',label:I18nKey=`p6_${key}` as I18nKey)=><div className="pe-f" key={key}><label htmlFor={`${id}-${key}`}>{t(label)}</label><div className="pe-in"><AdditionNumber id={`${id}-${key}`} value={value} disabled={disabled} min={0} step={1} onValueChange={update}/><span className="pe-u">{unit}</span></div></div>
  const select=(key:string,value:string|number,options:{value:string|number;label:string;disabled?:boolean}[],update:(v:string)=>void,label:I18nKey=`p6_${key}` as I18nKey)=><div className="pe-f" key={key}><label htmlFor={`${id}-${key}`}>{t(label)}</label><select id={`${id}-${key}`} value={value} disabled={disabled} onChange={(e)=>update(e.target.value)}>{options.map((v)=><option key={v.value} value={v.value} disabled={v.disabled}>{v.label}</option>)}</select></div>
  const confirm=(kind:'roofOpening'|'floorOpening'|'link')=>{
    const o=a[kind]!
    return <><div className="pe-f"><label htmlFor={`${id}-${kind}-source`}>{t('add_source')}</label><input id={`${id}-${kind}-source`} disabled={disabled} value={o.source} onChange={(e)=>change(kind,{source:e.target.value})}/></div><label className="pe-f pe-full"><span><input type="checkbox" checked={o.confirmed} disabled={disabled||!o.source.trim()} onChange={(e)=>onChange({...a,[kind]:{...o,confirmed:e.target.checked}})}/> {t('add_confirm')}</span></label></>
  }
  const toggle=(kind:'roofOpening'|'floorOpening'|'link',label:I18nKey,make:()=>unknown)=><label className="pe-f"><span><input type="checkbox" disabled={disabled} checked={!!a[kind]} onChange={(e)=>onChange({...a,[kind]:e.target.checked?make():undefined})}/> {t(label)}</span></label>
  const coords=(xs:number[])=>xs.map((x)=>({value:x,label:`${+x.toFixed(4)} m`}))
  const r=a.roofOpening,f=spec.features?.mezzanine?a.floorOpening:undefined,l=a.link
  return <section className="phase6-editor">{!part && <h4>{t('p6_title')}</h4>}
    {part !== 'link' && <>
    {toggle('roofOpening','p6_roof',()=>defaultRoofOpening(spec))}
    {r&&<fieldset id={`${idPrefix}.roofOpening`} tabIndex={-1} disabled={disabled}><legend>{t('p6_roof')}</legend><p className="mw-note">{t('p6_roofNote')}</p><div className="pe-grid">
      {select('roofBay',r.bay,roofBayOptions(spec).map((v)=>({value:v.bay,label:`${v.bay+1} · ${v.width} m${v.braced?` · ${t('role_brace')}`:''}`,disabled:v.braced})),(v)=>change('roofOpening',{bay:Number(v)}),'add_bay')}
      {(['x0','x1'] as const).map((k)=>select(`roof-${k}`,r[k],coords(g.xs.filter((x)=>g.planes.some((p)=>x>p.xa&&x<p.xb))),(v)=>change('roofOpening',{[k]:Number(v)}),`add_${k}`))}
      {select('roofSection',r.section,sectionCatalogOptions(spec.code,'rafter',spec.material).filter((v)=>v.shape==='H').map((v)=>({value:v.name,label:`${v.name}${v.selectionStatus==='normal'?'':' ⚠'}`})),(v)=>change('roofOpening',{section:v}),'p6_roofBeam')}
      {num('roofDeflectionDivisor',r.deflectionDivisor,(v)=>change('roofOpening',{deflectionDivisor:v}),'','add_deflectionDivisor')}
      {confirm('roofOpening')}
    </div><p className="mw-note">{t('p6_roofDeflNote')}</p></fieldset>}
    {spec.features?.mezzanine&&a.platform&&toggle('floorOpening','p6_floor',()=>defaultFloorOpening(spec))}
    {f&&a.platform&&<fieldset id={`${idPrefix}.floorOpening`} tabIndex={-1} disabled={disabled}><legend>{t('p6_floor')}</legend><p className="mw-note">{t('p6_floorNote')}</p><div className="pe-grid">
      {select('floorBay',f.bay,g.spans.map((width,bay)=>({value:bay,label:`${bay+1} · ${width} m`})).filter((v)=>v.value>=a.platform!.firstBay&&v.value<a.platform!.lastBay),(v)=>change('floorOpening',{bay:Number(v)}),'add_bay')}
      {(['x0','x1'] as const).map((k)=>select(`floor-${k}`,f[k],coords(platformGridXs(spec).filter((x)=>x>a.platform!.x0&&x<a.platform!.x1)),(v)=>change('floorOpening',{[k]:Number(v)}),`add_${k}`))}
      {confirm('floorOpening')}
    </div></fieldset>}
    </>}
    {part !== 'openings' && <>{toggle('link','p6_link',()=>defaultLink(spec))}
    {l&&<fieldset id={`${idPrefix}.link`} tabIndex={-1} disabled={disabled}><legend>{t('p6_link')}</legend><p className="mw-note">{t('p6_linkNote')}</p><div className="pe-grid">
      {select('mode',l.mode,(['sliding','separate','integral'] as const).map((v)=>({value:v,label:t(`p6_${v}`)})),(v)=>change('link',{mode:v}))}
      {select('linkFace',l.face,[{value:'x0',label:'X = 0'},{value:'xL',label:`X = ${spec.span} m`}],(v)=>change('link',{face:v}),'add_face')}
      {select('frame',l.frame,Array.from({length:spec.bays+1},(_,i)=>({value:i,label:String(i+1)})),(v)=>change('link',{frame:Number(v)}),'p6_frame')}
      {num('linkElevation',l.elevation,(v)=>change('link',{elevation:v}),'m','add_elevation')}
      {(['aMovementMm','bMovementMm','thermalMovementMm','toleranceMm','availableGapMm','seatLengthMm','minBearingMm'] as const).map((k)=>num(k,l[k],(v)=>change('link',{[k]:v})))}
      {l.mode==='sliding'&&num('loadFactor',l.loadFactor,(v)=>change('link',{loadFactor:v}),'')}
    </div>
    <p className="mw-note">{t('p6_required',linkReview(l).required.toFixed(2),linkReview(l).gapReserve.toFixed(2),linkReview(l).seatReserve.toFixed(2))}</p>
    {l.mode==='integral'&&<p className="mw-error" role="alert">{t('p6_integralNote')}</p>}
    {l.mode==='sliding'&&<><p className="mw-note">{t('p6_reactionNote')}</p>{l.cases.map((v,i)=><fieldset key={i}><legend>{t('p6_case')} {i+1}</legend><div className="pe-grid"><div className="pe-f"><label htmlFor={`${id}-case-${i}`}>{t('add_name')}</label><input id={`${id}-case-${i}`} value={v.name} onChange={(e)=>change('link',{cases:l.cases.map((c,j)=>j===i?{...c,name:e.target.value}:c)})}/></div>{(['fx','fy','fz','mx','my','mz'] as const).map((k)=><div className="pe-f" key={k}><label htmlFor={`${id}-${i}-${k}`}>{k.toUpperCase()} ({k.startsWith('m')?'kN·m':'kN'})</label><AdditionNumber id={`${id}-${i}-${k}`} value={v[k]} disabled={disabled} step={1} onValueChange={(n)=>change('link',{cases:l.cases.map((c,j)=>j===i?{...c,[k]:n}:c)})}/></div>)}</div><button type="button" className="btn btn-s" disabled={disabled||l.cases.length<=1} onClick={()=>change('link',{cases:l.cases.filter((_,j)=>j!==i)})}>{t('add_remove')}</button></fieldset>)}<button type="button" className="btn btn-s" disabled={disabled||l.cases.length>=8} onClick={()=>change('link',{cases:[...l.cases,{name:`CASE ${l.cases.length+1}`,fx:0,fy:0,fz:0,mx:0,my:0,mz:0}]})}>{t('p6_addCase')}</button></>}
    <div className="pe-grid">{confirm('link')}</div></fieldset>}</>}
  </section>
}
