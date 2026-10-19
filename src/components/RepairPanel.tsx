import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Wrench } from 'lucide-react'
import { useStore } from '../state/store'
import { unavailable } from '../state/taskFlow'
import { currentRepairPlan, prepareRepairs, applyRepairs } from '../actions/remediation'
import { diagnoseRepairs, previewRepair, repairMetrics, sectionAt, type SectionTarget, type RepairMetrics, type RepairPreview, type RepairProblem, type RepairDiagnosis, type RepairCandidate, type RepairPlan } from '../domain/remediation'
import { t, type I18nKey } from '../i18n'
import { isLengthService } from '../domain/design'

const targetKey=(target:SectionTarget):I18nKey=>({platformBeam:'add_platformBeam',platformColumn:'add_platformColumn',runway:'add_runway',header:'add_header',roofTrimmer:'p6_roofBeam'} as Partial<Record<SectionTarget,I18nKey>>)[target]??`role_${target}` as I18nKey
const ratio=(r:number)=>Number.isFinite(r)?r.toFixed(3):'—'
const metricKeys=['memberNg','serviceNg','connectionNg','blocked','memberMax','serviceMax','connectionMax'] as const

function Metrics({before,estimated,after}:{before:RepairMetrics;estimated:RepairMetrics;after?:RepairMetrics}) {
  return <div className="repair-table"><table><thead><tr><th>{t('sv_item')}</th><th>{t('repair_before')}</th><th>{t('repair_estimated')}</th>{after&&<th>{t('repair_verified')}</th>}</tr></thead>
    <tbody>{metricKeys.map((key)=><tr key={key}><td>{t(`repair_metric_${key}`)}</td>{[before,estimated,...after?[after]:[]].map((m,i)=><td key={i} className="mono" data-fail={m[key]>(key.endsWith('Max')?1:0)}>{key.endsWith('Max')?ratio(m[key]):m[key]}</td>)}</tr>)}</tbody></table></div>
}

export function RepairPanel() {
  const s=useStore(),b=s.built,d=s.design,cs=s.connections
  const [selection,setSelection]=useState<Record<string,string>>({})
  const plan=currentRepairPlan(s.repairPlan)?s.repairPlan:null
  useEffect(()=>setSelection({}),[plan])
  const problems=useMemo(()=>d&&cs?diagnoseRepairs(d,cs):[],[d,cs])
  // Full re-check is heavy: run it after the select has repainted, and never let a bad selection unmount the stage.
  const [preview,setPreview]=useState<{plan:RepairPlan;selection:Record<string,string>;value:RepairPreview|null;error?:string}|null>(null)
  useEffect(()=>{
    if(!plan||!Object.values(selection).some(Boolean)){setPreview(null);return}
    const timer=setTimeout(()=>{
      try {setPreview({plan,selection,value:previewRepair(plan,selection)})}
      catch(e) {setPreview({plan,selection,value:null,error:t(e instanceof Error&&e.message==='repair_geometry'?'repair_geometry':'repair_invalid')})}
    },0)
    return ()=>clearTimeout(timer)
  },[plan,selection])
  const current=preview&&preview.plan===plan&&preview.selection===selection?preview:null
  const previewing=!!plan&&Object.values(selection).some(Boolean)&&!current
  if(!b||!d||!cs)return null
  const reason=unavailable({...s,mapiKey:'offline'},'optimize')||(s.genChanged?'wf_stale_gen':null)
  const applyReason=unavailable(s,'optimize')||(s.genChanged?'wf_stale_gen':null)
  const comparison=s.repairComparison?.built===b&&s.repairComparison.design===d?s.repairComparison:null
  const shown:(RepairDiagnosis&{candidates?:RepairCandidate[]})[]=plan?.groups??problems
  const problemText=(p:RepairProblem)=>p.member?`#${p.member.id} · ${p.member.section} · ${p.member.eq} · ${p.member.combo}`
    :p.service?`${t(`sv_${p.service.key}`)} · ${p.service.case} · ${p.service.clause}`
    :p.connection?`${t(`cn_type_${p.connection.type}`)} · #${p.connection.elem} · ${p.connection.combo}`:t('s13_col')
  const position=(p:RepairProblem)=>{
    const member=p.member&&b.model.elements.find((e)=>e.id===p.member!.id)
    const a=member&&b.model.nodes.find((n)=>n.id===member.n1),z=member&&b.model.nodes.find((n)=>n.id===member.n2)
    return a&&z?`X ${((a.x+z.x)/2).toFixed(2)} · Y ${((a.y+z.y)/2).toFixed(2)} · Z ${((a.z+z.z)/2).toFixed(2)} m`:null
  }
  const evidence=(p:RepairProblem)=>{
    if(p.member){const m=p.member;return <><small>{t('cn_demand')}: |P| {Math.abs(m.forces.P).toFixed(1)} kN · Mx {m.forces.Mx.toFixed(1)} / My {m.forces.My.toFixed(1)} kN·m</small><small>{t('cn_capacity')}: P {(m.forces.P<0?m.cap.phiPnc:m.cap.phiPnt).toFixed(1)} kN · Mx {m.cap.phiMnx.toFixed(1)} / My {m.cap.phiMny.toFixed(1)} kN·m · {m.cap.mxMode}</small><small className="mono">KLx {(m.lengths.KLx/1000).toFixed(2)} / KLy {(m.lengths.KLy/1000).toFixed(2)} / Lb {(m.lengths.Lb/1000).toFixed(2)} m</small></>}
    if(p.service){const v=p.service,format=(n:number)=>isLengthService(v.key)?`${(n*1000).toFixed(1)} mm`:`${(n*100).toFixed(3)}%`;return <small>{t('sv_value')} {format(v.value)} / {t('sv_limit')} {format(v.limit)}</small>}
    if(p.connection){const c=p.connection,k=c.checks.find((v)=>Math.abs(v.ratio-c.ratio)<1e-6);return k?<small>{t(`cn_${k.item}` as I18nKey)} · {t('cn_demand')} {k.demand.toFixed(1)} / {t('cn_capacity')} {k.capacity.toFixed(1)} {k.unit} · {k.clause}</small>:null}
    return null
  }
  return <section className="repair-panel" aria-label={t('repair_title')}>
    <div className="repair-heading"><h3><Wrench size={17}/>{t('repair_title')}</h3><span className="repair-count">{t('repair_count',problems.reduce((n,g)=>n+g.count,0))}</span></div>
    <p className="repair-note">{t('repair_hint')}</p>
    {comparison&&<div className="repair-comparison"><h4>{t('repair_comparison')}</h4><p>{t('repair_comparison_note')}</p><ul>{comparison.changes.map((c)=><li key={c.target}>{t(targetKey(c.target))}: <span className="mono">{c.section}</span></li>)}</ul><Metrics before={comparison.before} estimated={comparison.estimated} after={comparison.after}/></div>}
    {!problems.length?<p className="repair-clear">✓ {t('repair_clear')}</p>:<>
      <div className="repair-steps" aria-label={t('repair_title')}><span>01 · {t('repair_diagnose')}</span><ArrowRight size={12}/><span>02 · {t('repair_select')}</span><ArrowRight size={12}/><span>03 · {t('repair_reanalyze')}</span></div>
      <div className="repair-groups">{shown.map((g)=><article className="repair-group" key={g.group}>
        <div className="repair-group-title"><h4>{t(`repair_group_${g.group}`)}</h4><span className="mono">{t('repair_count',g.count)} · {ratio(g.maxRatio)}</span></div>
        <details><summary>{t('repair_details')}</summary><ul className="repair-problems">{g.problems.map((p,i)=><li key={i}><b>{t(`repair_kind_${p.kind}`)} · <span className="mono">{ratio(p.ratio)}</span></b><span>{problemText(p)}</span>{position(p)&&<small className="mono">{position(p)}</small>}{evidence(p)}</li>)}</ul></details>
        {g.group==='frame'&&<p className="repair-note">{t('repair_frame_note')}</p>}
        {g.group==='longitudinal'&&<p className="repair-note">{t('repair_long_note')}</p>}
        {plan&&g.candidates&&<>{g.candidates.length?<label className="repair-select"><span>{t('repair_select')}</span><select aria-label={`${t('repair_select')} · ${t(`repair_group_${g.group}`)}`} disabled={!!reason} value={selection[g.group]??''} onChange={(e)=>setSelection((old)=>({...old,[g.group]:e.target.value}))}>
          <option value="">{t('repair_keep')}</option>{g.candidates.map((c)=><option key={c.id} value={c.id}>{c.ranked?`${t('repair_ranked')} · `:''}{c.changes.map((p)=>`${t(targetKey(p.target))}: ${p.section}`).join(' / ')} · {t('repair_candidate_ratio',ratio(c.strength),ratio(c.service),ratio(c.connection))}{c.catalogReview?` · ${t('repair_catalog_review')}`:''}</option>)}</select></label>:<p className="repair-manual"><AlertTriangle size={14}/>{t(g.group==='link'?'repair_link_manual':'repair_no_candidate')}</p>}</>}
      </article>)}</div>
      <div className="repair-actions"><button className="btn btn-ghost" disabled={!!reason} title={reason?t(reason):undefined} onClick={()=>void prepareRepairs()}>{t(plan?'repair_refresh':'repair_generate')}</button>{reason&&<small>{t(reason)}</small>}</div>
      {plan&&<p className="repair-note">{t('repair_estimate_note')}</p>}
      {previewing&&<p className="repair-note" role="status">{t('repair_previewing')}</p>}
      {current?.error&&<p className="repair-manual" role="alert"><AlertTriangle size={14}/>{current.error}</p>}
      {current?.value&&<div className="repair-preview"><h4>{t('repair_selection')}</h4><ul>{current.value.changes.map((p)=><li key={p.target}><span>{t(targetKey(p.target))}</span><span className="mono">{sectionAt(b.spec,p.target)} → {p.section}</span></li>)}</ul><Metrics before={repairMetrics(d,cs)} estimated={current.value.metrics}/>
        <p className="repair-note">{t('repair_apply_note')}</p><button className="btn btn-c" disabled={!!applyReason||!!current.value.selectedBlocked} title={applyReason?t(applyReason):undefined} onClick={()=>void applyRepairs(selection)}>{t('repair_apply')}<ArrowRight size={14}/></button>
      </div>}
    </>}
  </section>
}
