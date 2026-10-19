import { useState } from 'react'
import { X, AlertTriangle, CheckCircle2, Clock3, FileDown } from 'lucide-react'
import { render, t, type I18nKey } from '../i18n'
import { S, notify, useStore, type Activity, type JobKind } from '../state/store'
import { tab } from '../state/ui'

const JOB_LABEL: Record<JobKind, I18nKey> = { build: 'wf_build', anal: 'wf_anal', design: 'wf_design', opt: 'flow_optimize', pdf: 'g_design_5', docx: 'out_docx', dwgpdf: 'out_drawings_pdf', restore: 'wf_restore' }
const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const acknowledge = (id: number) => { const a = S.activity.find((e) => e.id === id); if (a) a.acknowledged = true; notify() }

export function NoticeCenter() {
  const s = useStore()
  const issues = s.activity.filter((a) => a.source === 'notice' && a.level !== 'info' && !a.acknowledged)
  const info = s.activity.filter((a) => a.source === 'notice' && a.level === 'info' && !a.acknowledged).at(-1)
  const shown = info ? [...issues, info] : issues
  if (!shown.length) return null
  return <div className="notice-center" aria-label={t('ws_notice')}>{shown.map((a) => <div key={a.id} className={`flow-notice ${a.level}`} role={a.level === 'info' ? 'status' : 'alert'}>
    {a.level === 'info' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<div><span className="notice-time">{time(a.at)}{a.kind && ` · ${t(JOB_LABEL[a.kind])}`}</span><div dangerouslySetInnerHTML={{ __html: a.html ? render(a.html) : '' }} /></div>
    <button aria-label={t(a.level === 'info' ? 'ws_dismiss' : 'flow_read')} onClick={() => acknowledge(a.id)}><X size={14} /></button>
  </div>)}</div>
}

export function ArtifactList() {
  const s = useStore()
  const items = s.activity.filter((a) => a.source === 'artifact').slice(-12).reverse()
  if (!items.length) return null
  return <div className="artifact-list">{items.map((a) => <div key={a.id}><FileDown size={16} /><span><strong>{a.name}</strong><small>{time(a.at)} · {a.code} · {t('flow_revision', a.revision ?? 0)} · {t(a.revision === s.modelRevision && a.resultRevision === s.resultRevision ? 'flow_requested' : 'flow_previous')}</small></span></div>)}</div>
}

export function ActivityHistory() {
  const s = useStore()
  const [filter, setFilter] = useState<'all' | 'jobs' | 'issues' | 'files'>('all')
  const items = s.activity.filter((a) => filter === 'issues' ? a.source === 'notice' && a.level !== 'info' : filter === 'files' ? a.source === 'artifact' : !a.parent && (filter === 'all' || a.source === 'job')).slice().reverse()
  const body = (a: Activity) => a.html ? <div dangerouslySetInnerHTML={{ __html: render(a.html) }} /> : null
  return <div className="task-content history-content"><div className="task-heading"><h2 tabIndex={-1}>{t('flow_history')}</h2><p>{t('flow_history_hint')}</p></div>
    <div className="history-filters" role="group" aria-label={t('flow_history')}>{(['all', 'jobs', 'issues', 'files'] as const).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`flow_${f}`)}</button>)}</div>
    {!items.length && <div className="task-empty"><Clock3 size={25} /><p>{t('flow_history_empty')}</p></div>}
    <ol className="history-list">{items.map((a) => <li className={`history-entry ${a.level}`} key={a.id}>
      <div className="history-entry-top"><time>{time(a.at)}</time><strong>{a.kind ? t(JOB_LABEL[a.kind]) : a.source === 'artifact' ? t('flow_requested') : t('ws_notice')}</strong>{a.status && <span className={`task-state ${a.status}`}>{t(`flow_status_${a.status}`)}</span>}{a.elapsed !== undefined && <span>{t('flow_elapsed', Math.round(a.elapsed / 1000))}</span>}</div>
      {a.name && <p className="history-filename">{a.name} · {a.code} · {t('flow_revision', a.revision ?? 0)}{(a.revision !== s.modelRevision || a.resultRevision !== s.resultRevision) && ` · ${t('flow_previous')}`}</p>}
      {body(a)}
      {s.activity.some((c) => c.parent === a.id) && <details><summary>{t('mw_details')}</summary>{s.activity.filter((c) => c.parent === a.id).map((c) => <div className={`history-detail ${c.level}`} key={c.id}>{body(c)}</div>)}</details>}
    </li>)}</ol>
    <button className="btn btn-ghost" onClick={() => tab('logP')}>{t('flow_api_log')}</button><p className="ws-start-note">{t('flow_history_local')}</p>
  </div>
}
