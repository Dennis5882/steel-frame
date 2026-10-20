/* 다층 강골조 작업 영역 — 左 작업 흐름(FrameTaskNav) + 가운데: 모델링(시작·8단계) / 해석 / 설계 검토 / 최적화 / 출력.
   공장 Workspace·TaskNav·TaskStage 와 같은 레이아웃·CSS, 상태는 src/frame/state.ts */
import { ArrowRight, BookOpen, Camera, Building2, Plus, Calculator, ChevronLeft, CircleHelp, ClipboardCheck, Download, Eraser, FileText, FolderOpen, History, Play, RotateCcw, Ruler, Settings, SlidersHorizontal, Table2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t, type I18nKey } from '../../i18n'
import { S, notify, useStore } from '../../state/store'
import { recordArtifact, tab } from '../../state/ui'
import { confirmAction } from '../ConfirmDialog'
import { JobBar } from '../JobBar'
import { ActivityHistory, ArtifactList, NoticeCenter } from '../ActivityViews'
import { F, frameBlocker, frameOutputBlocker, frameStale, frameTaskStatus, resetFrame, startTemplate, type FrameTask } from '../../frame/state'
import { analyzeFrame, designFrame, optimizeFrame, restoreFrameBackup } from '../../actions/frame'
import { downloadFrameDetailedDocx, downloadFrameDrawingsPdf, downloadFrameDxf, downloadFrameQuantities, downloadFrameReportDocx, downloadFrameReportPdf, openFrameReport, outputReady, OUTPUT_NEED, type OutputNeed } from '../../actions/frameOutputs'
import { OPT_MAX_ITER, OPT_TARGET } from '../../frame/optimize'
import { FrameWizard } from './FrameWizard'
import type { FrameTemplateKey } from '../../frame/templates'
import { MemberChip, StoryChip, memberGradeOf } from './FramePanels'

const TASKS: { id: FrameTask; label: I18nKey; hint: I18nKey; Icon: typeof Building2 }[] = [
  { id: 'model', label: 'flow_model', hint: 'fr_model_hint', Icon: Building2 },
  { id: 'analysis', label: 'wf_anal', hint: 'fr_analysis_hint', Icon: Calculator },
  { id: 'design', label: 'wf_design', hint: 'fr_design_hint', Icon: ClipboardCheck },
  { id: 'optimize', label: 'flow_optimize', hint: 'fr_opt_hint', Icon: SlidersHorizontal },
  { id: 'outputs', label: 'flow_outputs', hint: 'fr_outputs_hint', Icon: Download },
]
const task = () => (S.task === 'history' ? 'history' : S.task as FrameTask | 'history')
function selectFrameTask(id: FrameTask | 'history') {
  S.task = id as typeof S.task
  if (id === 'analysis' || id === 'design') S.panel = 'resP'
  if (id === 'model') S.panel = 'viewP'
  notify()
}

async function resetAll() {
  if (S.busy || S.confirm) return
  if (!await confirmAction({ title: t('flow_reset_title'), body: t('flow_reset_body'), ok: t('flow_reset_ok'), danger: true })) return
  S.task = 'model'; S.lastFail = null
  resetFrame()
}

export function FrameTaskNav({ collapsed, onToggle, onOpenMapi }: { collapsed: boolean; onToggle(): void; onOpenMapi(): void }) {
  const s = useStore()
  const unread = s.activity.filter((a) => a.source === 'notice' && a.level !== 'info' && !a.acknowledged).length
  return <aside className={`guide task-nav${collapsed ? ' collapsed' : ''}`}>
    <div className="guide-hd"><span>{t('wf_title')}</span><button className="guide-tog" aria-expanded={!collapsed} aria-controls="task-navigation" onClick={onToggle} aria-label={t(collapsed ? 'guide_open' : 'guide_close')}>{collapsed ? '⟩' : '⟨'}</button></div>
    <div id="task-navigation" className="task-nav-body" hidden={collapsed}>
      <nav aria-label={t('wf_title')}><ol>{TASKS.map(({ id, label, Icon }) => {
        const st = frameTaskStatus(id)
        return <li key={id}><button className={`task-link ${task() === id ? 'active' : ''}`} aria-current={task() === id ? 'page' : undefined} onClick={() => selectFrameTask(id)}>
          <span className="task-icon" aria-hidden="true"><Icon size={17} /></span><span className="task-link-text"><strong>{t(label)}{id === 'optimize' && <small>{t('flow_optional')}</small>}</strong><span className={`task-state ${st}`}>{t(`flow_status_${st}`)}</span></span>
        </button></li>
      })}</ol></nav>
      <div className="task-nav-bottom">
        <button className={`task-utility${task() === 'history' ? ' active' : ''}`} onClick={() => selectFrameTask('history')}><History size={16} />{t('flow_history')}{unread > 0 && <span className="task-unread" aria-label={t('flow_unread', unread)}>{unread}</span>}</button>
        <button className="task-utility" onClick={onOpenMapi}><Settings size={16} />{t('flow_connection')}</button>
        {s.restorePoint && <button className="task-utility" disabled={s.busy} onClick={() => void restoreFrameBackup()}><RotateCcw size={16} />{t('wf_restore')}</button>}
        <button className="task-utility" disabled={s.busy} title={t('flow_reset_body')} onClick={() => void resetAll()}><Eraser size={16} />{t('flow_reset')}</button>
      </div>
    </div>
  </aside>
}

/* 결과 CSV — 부재 검토 + 층 검토 */
function downloadCsv() {
  if (!outputReady(OUTPUT_NEED.csv)) return
  const D = F.design!, R = F.review
  const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [['member', 'role', 'story', 'section', 'L_m', 'muX', 'muY', 'combo', 'governing', 'ratio', 'detailRatio', 'grade'].join(',')]
  for (const m of D.members) lines.push([m.id, m.role, m.story, q(m.section), m.L.toFixed(3), m.muX.toFixed(3), m.muY.toFixed(3), m.worst.combo, m.worst.governing, m.ratio.toFixed(4), m.detailRatio.toFixed(4), memberGradeOf(m)].join(','))
  if (R) {
    lines.push('', ['item', 'dir', 'clause', 'story', 'value', 'limit', 'status'].join(','))
    for (const it of R) for (const r of it.rows) lines.push([it.key, it.dir ?? '', q(it.clause), r.story, r.value, r.limit, r.status].join(','))
  }
  const name = `steel_frame_check_${new Date().toISOString().slice(0, 10)}.csv`
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  recordArtifact(name)
}

/* 산출물 카드 — 형식을 고른 뒤 한 번에 추출 (공장 TaskStage ExportCard 와 같은 모양). 고른 형식은 이 브라우저에 기억 */
/* need = 결과가 있어야 낼 때의 선행 조건과 이유 문구 (OUTPUT_NEED, 실행 함수와 같은 값) */
type FrameOut = { id: string; title: I18nKey; hint: I18nKey; Icon: typeof FileText; formats: [string, string, () => void][]; need?: OutputNeed }
const FRAME_OUTPUTS: FrameOut[] = [
  { id: 'report', title: 'out_report', hint: 'fr_out_report_hint', Icon: FileText, formats: [['pdf', 'PDF', () => void downloadFrameReportPdf()], ['docx', 'Word', () => void downloadFrameReportDocx()], ['html', 'HTML', openFrameReport]] },
  { id: 'detail', title: 'fr_out_detail', hint: 'fr_out_detail_hint', Icon: Camera, formats: [['docx', 'Word', () => void downloadFrameDetailedDocx()]], need: OUTPUT_NEED.detail },
  { id: 'drawings', title: 'out_drawings', hint: 'fr_out_dwg_hint', Icon: Ruler, formats: [['pdf', 'PDF', () => void downloadFrameDrawingsPdf()], ['dxf', 'DXF', downloadFrameDxf]] },
  { id: 'quantities', title: 'out_quantities', hint: 'fr_out_qty_hint', Icon: Table2, formats: [['xlsx', 'XLSX', () => void downloadFrameQuantities('xlsx')], ['csv', 'CSV', () => void downloadFrameQuantities('csv')]] },
  { id: 'csv', title: 'fr_out_csv', hint: 'fr_out_csv_hint', Icon: ClipboardCheck, formats: [['csv', 'CSV', downloadCsv]], need: OUTPUT_NEED.csv },
]
function FrameExportCard({ out, disabled }: { out: FrameOut; disabled: boolean }) {
  const key = `sf_format_${out.id}`
  const [fmt, setFmt] = useState(() => { try { const v = localStorage.getItem(key); return out.formats.find(([f]) => f === v)?.[0] ?? out.formats[0][0] } catch { return out.formats[0][0] } })
  const pick = (f: string) => { setFmt(f); try { localStorage.setItem(key, f) } catch { /* private mode */ } }
  /* 단계 전체가 막히면(모델 없음·입력 변경·작업 중) 단계 안내가 이유를 보인다. 이 산출물만의 선행 조건이 안 되면 버튼을 끄고 이유를 카드 본문에 둔다
     (일반 문단이라 읽기 순서에 들어간다. 비활성 버튼은 Tab 으로 가지 않아 aria-describedby 만으로는 안 읽힐 수 있음) */
  const why = !disabled && out.need && frameOutputBlocker(F, out.need.need) === 'need' ? t(out.need.hint) : null
  const off = disabled || !!why
  const whyId = `fr-out-why-${out.id}`
  return <div className="report-export">
    <div className="report-export-head"><out.Icon size={22} /><strong>{t(out.title)}</strong></div>
    <p className="pe-tip">{t(out.hint)}</p>
    {why && <p className="task-warning" id={whyId}>{why}</p>}
    <div className="report-export-row">
      {out.formats.length > 1 ? <div className="report-formats" role="radiogroup" aria-label={t('out_format')}>{out.formats.map(([f, label]) =>
        <button key={f} type="button" role="radio" aria-checked={fmt === f} className={fmt === f ? 'on' : ''} onClick={() => pick(f)}>{label}</button>)}</div> : <span />}
      <button className="btn btn-c" disabled={off} aria-describedby={why ? whyId : undefined} onClick={() => out.formats.find(([f]) => f === fmt)![2]()}><Download size={15} />{t('out_export')}</button>
    </div>
  </div>
}

/* 최적화 결과 — 종류별 전후 단면·중량, 반복 기록 */
function OptResult() {
  const o = F.opt
  if (!o) return <div className="task-empty"><SlidersHorizontal size={26} /><p>{t('fr_opt_body', OPT_TARGET, OPT_MAX_ITER)}</p></div>
  return <div className="scard"><h3>{t('rp_opt')}</h3>
    <table><thead><tr><th>{t('fr_role')}</th><th>{t('rp_before')}</th><th>{t('rp_after')}</th><th>{t('fr_max_ratio')}</th><th>{t('rp_weight')}</th></tr></thead><tbody>
      {o.rows.map((r) => <tr key={r.role}><td>{t(`fr_role_${r.role}`)}</td><td className="mono">{r.before}</td><td className="mono"><b>{r.after}</b></td><td className="mono">{r.ratio === null ? '—' : r.ratio.toFixed(3)}</td><td className="mono">{r.tBefore.toFixed(2)} → {r.tAfter.toFixed(2)}</td></tr>)}
      <tr><td><b>{t('rp_total')}</b></td><td /><td /><td /><td className="mono"><b>{o.weightBefore.toFixed(2)} → {o.weightAfter.toFixed(2)} t</b></td></tr>
    </tbody></table>
    <p className="pe-tip">{t(`fr_opt_end_${o.end}`)}</p>
  </div>
}

function FrameTaskStage({ onOpenMapi }: { onOpenMapi(): void }) {
  const s = useStore()
  const id = task()
  if (id === 'model') return null
  if (id === 'history') return <ActivityHistory />
  const def = TASKS.find((x) => x.id === id)!
  const reason = frameBlocker(id)
  const st = frameTaskStatus(id)
  const b = F.built
  const failed = !!s.lastFail && st === 'failed' || st === 'cancelled'
  const done = id === 'analysis' ? !!F.analysis : id === 'design' ? !!F.design : id === 'optimize' ? !!F.opt : false
  const fresh = done && !frameStale(F)
  const run = () => void (id === 'analysis' ? analyzeFrame() : designFrame())
  const next = () => selectFrameTask(id === 'analysis' ? 'design' : 'outputs')
  const eig = F.analysis?.story.eigen
  const ng = F.design?.members.filter((m) => memberGradeOf(m) === 'fail').length ?? 0
  return <div className="task-stage"><div className="task-content">
    <div className="task-heading"><div className="task-heading-meta"><span className={`task-state ${st}`}>{t(`flow_status_${st}`)}</span></div><h2 tabIndex={-1}>{t(def.label)}</h2><p>{t(def.hint)}</p></div>
    {b && <div className="task-model-summary"><span>{t('flow_summary')} · CN · {t('flow_revision', s.modelRevision)}</span><strong>{b.spec.xs.at(-1)! - b.spec.xs[0]} × {b.spec.ys.at(-1)! - b.spec.ys[0]} m · {b.spec.heights.length}{t('fr_story_unit')}</strong><small>{t('flow_model_summary', b.model.nodes.length, b.model.elements.length)}</small></div>}
    {reason && reason !== 'busy' && <div className="task-blocker" role="status"><span>{t(reason === 'wf_stale_edited' ? 'fr_stale' : reason === 'need_anal' ? 'fr_need_anal' : reason)}</span>
      {reason === 'flow_need_connection' ? <button className="btn btn-ghost" onClick={onOpenMapi}>{t('flow_connection')}</button>
        : reason === 'need_anal' ? <button className="btn btn-ghost" onClick={() => selectFrameTask('analysis')}>{t('wf_anal')}</button>
          : reason === 'fr_opt_need_design' ? <button className="btn btn-ghost" onClick={() => selectFrameTask('design')}>{t('wf_design')}</button>
            : <button className="btn btn-ghost" onClick={() => selectFrameTask('model')}>{t('ws_edit')}</button>}</div>}
    {s.lastFail && failed && <div className="task-failure" role="alert"><strong>{t(s.lastFail.cancelled ? 'flow_status_cancelled' : 'flow_status_failed')}</strong><p>{s.lastFail.msg}</p>{s.restorePoint && <button className="btn btn-ghost" disabled={s.busy} onClick={() => void restoreFrameBackup()}><RotateCcw size={14} />{t('wf_restore')}</button>}</div>}
    {id === 'analysis' && (F.analysis ? <div className="task-stat-grid">
      <div><span>T₁ (s)</span><strong>{eig ? eig.periods[0].toFixed(3) : '—'}</strong></div>
      <div><span>{t('fr_eff_mass')}</span><strong>{eig ? `${eig.massX.at(-1)?.toFixed(0)} / ${eig.massY.at(-1)?.toFixed(0)} %` : '—'}</strong></div>
      <div><span>{t('fr_base_shear')} X / Y</span><strong>{['shearX', 'shearY'].map((k, i) => { const r = (F.analysis!.story as any)[k]?.find((x: any) => x.Story === F.built?.spec.storyNames[0]); return r ? (+r[`Shear Force/${'XY'[i]}`]).toFixed(0) : '—' }).join(' / ')} kN</strong></div>
    </div> : <div className="task-empty"><Play size={26} /><p>{t('fr_analysis_hint')}</p></div>)}
    {id === 'design' && (F.design && F.review ? <>
      <div className="scard"><h3>{t('res_status')}</h3>
        {(['beam', 'column', 'brace'] as const).map((r) => { const w = F.design!.byRole[r]; return w && <div className="kv" key={r}><span className="k">{t(`fr_role_${r}`)} · {t('fr_max_ratio')}</span><span className="v">{w.ratio.toFixed(3)} / {w.detailRatio.toFixed(3)} <MemberChip m={w} /></span></div> })}
        {F.review.map((it, i) => <div className="kv" key={i}><span className="k">{t(`fr_sr_${it.key}` as I18nKey)}{it.dir ? ` ${it.dir}` : ''}</span><span className="v"><StoryChip s={it.status} /></span></div>)}
      </div>
      {ng > 0 && <p className="task-warning">{t('fr_ng_note', ng)}</p>}
      <button className="btn btn-ghost" onClick={() => tab('resP')}>{t('flow_view_results')}</button>
    </> : <div className="task-empty"><FileText size={26} /><p>{t('fr_design_hint')}</p></div>)}
    {id === 'optimize' && <>
      <OptResult />
      <div className="task-primary-row"><button className="btn btn-c" disabled={!!reason} onClick={() => void optimizeFrame()}><SlidersHorizontal size={16} />{t(F.opt ? 'fr_opt_again' : 'fr_opt_run')}</button>
        {F.opt && <button className="btn btn-ghost" onClick={() => selectFrameTask('outputs')}><ArrowRight size={16} />{t('flow_next_outputs')}</button>}</div>
      <p className="ws-start-note">{t('fr_opt_note')}</p>
    </>}
    {id === 'outputs' && <>
      {!F.design && <p className="task-warning">{t('fr_report_partial')}</p>}
      <div className="export-list">{FRAME_OUTPUTS.map((o) => <FrameExportCard key={o.id} out={o} disabled={!!reason} />)}</div>
      <ArtifactList />
    </>}
  </div>
    {(id === 'analysis' || id === 'design') && <div className="task-primary-row">
      <button className="btn btn-c" disabled={fresh ? s.busy || !!s.confirm : !!reason} onClick={fresh ? next : run}>{fresh ? <ArrowRight size={16} /> : <Play size={16} />}{t(fresh ? id === 'analysis' ? 'flow_next_design' : 'flow_next_outputs' : failed ? 'flow_retry' : id === 'analysis' ? 'flow_run_analysis' : 'flow_run_design')}</button>
      {fresh && <button className="btn btn-ghost" disabled={!!reason} onClick={run}>{t(id === 'analysis' ? 'flow_run_analysis' : 'flow_run_design')}</button>}
    </div>}
  </div>
}

export function FrameWorkspace({ guideCollapsed, onOpenGuide, onOpenMapi }: { guideCollapsed: boolean; onOpenGuide(): void; onOpenMapi(): void }) {
  const s = useStore()
  const id = task()
  const editing = id === 'model' && F.view === 'edit' && !!F.draft
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const target = id !== 'model' ? root.current?.querySelector<HTMLElement>('.task-heading h2') : editing ? null : root.current?.querySelector<HTMLElement>('.ws-hero h2')
    target?.focus({ preventScroll: true })
  }, [editing, id])
  const home = () => { F.view = 'start'; S.viewNonce++; notify() }
  /* 새로 시작 — 편집 중인 입력이 있으면 바꾸기 전에 확인 */
  const start = async (k: FrameTemplateKey) => {
    if (F.draft && !await confirmAction({ title: t('fr_replace_title'), body: t('fr_replace_body'), ok: t('fr_replace_ok') })) return
    startTemplate(k)
  }
  const resume = () => { F.view = 'edit'; S.task = 'model'; S.panel = 'viewP'; S.viewNonce++; notify() }
  return <section ref={root} className={`workspace${guideCollapsed ? ' g-closed' : ''}`} aria-label={t('ws_title')}>
    <div className="ws-toolbar">
      <div className="ws-toolbar-title">{guideCollapsed && <button className="btn btn-ghost" onClick={onOpenGuide} aria-label={t('guide_open')}>☰</button>}<Building2 size={16} /><strong>{t(id === 'history' ? 'flow_history' : TASKS.find((x) => x.id === id)!.label)}</strong></div>
      <div className="ws-toolbar-actions">
        {editing ? <button className="btn btn-ghost" disabled={s.busy} onClick={home}><ChevronLeft size={13} />{t('ws_home')}</button>
          : F.draft && <button className="btn btn-ghost" disabled={s.busy} onClick={resume}><FolderOpen size={13} />{t('ws_resume')}</button>}
      </div>
    </div>
    <NoticeCenter />
    {id === 'model' && !editing && <div className="ws-start">
      <div className="ws-hero"><h2 tabIndex={-1}>{t('fr_start_title')}</h2><p>{t('fr_start_hint')}</p></div>
      <section className="project-code"><h3 className="ws-section-label">{t('code_label')}</h3><p><strong>{t('fr_code_label')}</strong></p><p className="pe-tip">{t('fr_code_note')}</p></section>
      {F.draft && <button className="ws-resume-card" disabled={s.busy} onClick={resume}><FolderOpen size={20} /><span><strong>{t('ws_resume')}</strong><small>{t('ws_resume_hint')}</small></span><ArrowRight size={16} /></button>}
      <button className="ws-free fr-new" disabled={s.busy} onClick={() => void start('blank')}><Plus size={22} /><span><strong>{t('fr_new')}</strong><small>{t('fr_new_hint')}</small></span><ArrowRight size={16} /></button>
      <button className="btn btn-ghost fr-example" disabled={s.busy} onClick={() => void start('tutorial')}><BookOpen size={14} />{t('fr_example')}</button>
      <p className="ws-start-note">{t('fr_example_hint')}</p>
      <p className="ws-start-note">{t('ws_local_note')}</p>
      <p className="ws-start-note"><CircleHelp size={13} /> {t('fr_scope_note')}</p>
    </div>}
    {editing && <div className="ws-editor"><FrameWizard onHome={home} /></div>}
    <FrameTaskStage onOpenMapi={onOpenMapi} />
    <JobBar />
  </section>
}

