/* Typed UI actions, optional legacy text adapter, settings and connection tests. */
import { fetchReactions, runAnalysis, showReactionsInGen } from '../actions/analysis'
import { runDesignCheck } from '../actions/design'
import { runOptimize } from '../actions/optimize'
import { downloadDrawings, downloadDrawingsPdf, downloadQuantities, openReport, downloadReportPdf, downloadReportDocx } from '../actions/outputs'
import type { CodeId } from '../codes'
import { portalGeometry } from '../domain/portal'
import { TEMPLATES } from '../domain/templates'
import { defaultSpecFor, normalizeBays, type FactorySpec } from '../domain/types'
import { getLang, langUrl, t, lt, isLText } from '../i18n'
import { verifyConn } from '../mapi/client'
import { S, freshWorkState, notify, saveCode, type Theme } from '../state/store'
import { specChanged } from '../state/taskFlow'
import { addMsg, addPlanMsg, escapeHtml, previewSpec, tab, selectTask } from '../state/ui'
import { unavailable } from '../state/taskFlow'
import type { TaskId } from '../state/store'
import { parseCommand, type Intent } from './parse'
import { confirmAction } from '../components/ConfirmDialog'

const BUSY_BLOCKED = new Set<string>(['new', 'analyze', 'design', 'optimize', 'report', 'drawings', 'drawings_pdf', 'pdf', 'docx', 'quantities', 'quantities_xlsx', 'reactions', 'conn'])

/** 사용자 입력 1건 처리 (로컬 명령) */
export async function send(raw: string): Promise<void> {
  const txt = raw.trim()
  if (!txt) return
  addMsg('user', escapeHtml(txt))
  await executeAction(parseCommand(txt))
}

/** UI actions use typed IDs; translated labels and the optional text parser never determine button behavior. */
export async function executeAction(c: Intent): Promise<void> {
  /* Busy jobs and pending confirmations cannot replace inputs or launch another Gen/output action. */
  if ((S.busy || S.confirm) && BUSY_BLOCKED.has(c.intent)) { addMsg('bot', lt('busy')); return }
  const task = ({ analyze: 'analysis', reactions: 'analysis', design: 'design', optimize: 'optimize', report: 'outputs', pdf: 'outputs', docx: 'outputs', drawings: 'outputs', drawings_pdf: 'outputs', quantities: 'outputs', quantities_xlsx: 'outputs' } as Record<string, TaskId>)[c.intent]
  if (task) {
    const reason = unavailable(S, task)
    if (reason) { addMsg('bot', lt(reason), 'warn'); return }
    selectTask(task)
  }
  try { switch (c.intent) {
    case 'help': {
      /* 사용 안내 = 토글: 안내가 떠 있으면 닫기 */
      const open = S.activity.find((a) => a.source === 'notice' && a.level === 'info' && !a.acknowledged && isLText(a.html) && a.html.k === 'ws_help')
      if (open) { open.acknowledged = true; notify() } else addMsg('bot', lt('ws_help'))
      break
    }
    case 'clear': clearChat(); break
    case 'release_notes': S.rnOpen = true; notify(); break
    case 'copy_link': {
      const u = langUrl(getLang())
      try { await navigator.clipboard.writeText(u); addMsg('bot', lt('link_copied', escapeHtml(u))) }
      catch { addMsg('bot', lt('link_copy_fail', escapeHtml(u))) }
      break
    }
    case 'new': {
      if (S.activePlan?.spec.code === S.code && S.activePlan.mode === c.mode && (c.mode === 'free' || S.activePlan.tpl === c.tpl) && !Object.keys(c.params).length) {
        openCurrentModel(); break
      }
      /* 지역·하중·단면 = 기준 기본값 + 직전 입력. 기본 모델링은 형상을 템플릿으로 덮고 베이 목록을 지운다 */
      const previous = S.draftSpec?.code === S.code ? S.draftSpec : S.lastSpec
      const base: FactorySpec = { ...defaultSpecFor(S.code), ...(previous.code === S.code ? previous : {}) }
      const geo = c.mode === 'template' ? { ...TEMPLATES[c.tpl ?? 'general'], bayList: undefined } : {}
      const spec = normalizeBays({ ...base, ...geo, ...c.params, code: S.code })
      addPlanMsg(spec, c.mode, c.tpl, c.mode === 'template' && !!c.tpl)
      tab('viewP')
      previewSpec(spec)
      break
    }
    case 'analyze': await runAnalysis(); break
    case 'design': await runDesignCheck(); break
    case 'optimize': await runOptimize(); break
    case 'report': openReport(); break
    case 'drawings': downloadDrawings(); break
    case 'drawings_pdf': await downloadDrawingsPdf(); break
    case 'pdf': await downloadReportPdf(); break
    case 'docx': await downloadReportDocx(); break
    case 'quantities': await downloadQuantities('csv'); break
    case 'quantities_xlsx': await downloadQuantities('xlsx'); break
    case 'reactions': {
      if (!S.built) { addMsg('bot', lt('no_model')); break }
      if (!S.analyzed) { addMsg('bot', lt('need_anal')); break }
      await fetchReactions()
      await showReactionsInGen()
      addMsg('bot', lt('react_done'))
      tab('resP')
      break
    }
    case 'status': {
      const b = S.built
      addMsg('bot', b
        ? t('status_html', b.spec.span, portalGeometry(b.spec).length, b.spec.eaveHeight, b.model.nodes.length, b.model.elements.length, S.analyzed)
        : t('status_none'))
      break
    }
    case 'conn': {
      const r = await testConn()
      addMsg('bot', r.cls === 'ok' ? t('conn_ok', S.program || 'gen') : escapeHtml(r.text))
      break
    }
    default: addMsg('bot', lt('ws_help'))
  } } catch (e) {
    addMsg('bot', escapeHtml(e instanceof Error ? e.message : String(e)), 'error')
  }
}

/** Reopen the same editor. After Gen changed the model (build/optimization), start from its current specification. */
export function openCurrentModel(): void {
  if (S.busy || S.confirm) return
  S.task = 'model'
  if (S.built?.spec.code === S.code && (!S.activePlan || (S.activePlan.epoch !== S.buildEpoch && specChanged(S.draftSpec, S.built.spec)) || (S.opt && (S.activePlan.modelRevision ?? 0) < S.modelRevision))) {
    const mode = S.activePlan?.mode ?? (S.built.spec.bayList ? 'free' : 'template')
    addPlanMsg(S.built.spec, mode, S.activePlan?.tpl)
  } else if (S.activePlan?.spec.code === S.code) {
    S.activePlan = { ...S.activePlan, epoch: S.buildEpoch, modelRevision: S.modelRevision }
    S.workspaceView = 'model'
  } else {
    const spec = S.lastSpec.code === S.code ? S.lastSpec : defaultSpecFor(S.code)
    addPlanMsg(spec, spec.bayList ? 'free' : 'template', 'general')
  }
  if (S.draftSpec) previewSpec(S.draftSpec)
  tab('viewP')
  notify()
}

export function clearChat(): void {
  S.msgs = []
  S.activity.forEach((a) => { if (a.source === 'notice') a.acknowledged = true })
  notify()
}

export function setTheme(th: Theme): void {
  S.theme = th
  document.documentElement.dataset.theme = th
  try { localStorage.setItem('sms_theme', th) } catch { /* 무시 */ }
  S.viewNonce++ // 3D 색 = 테마 토큰 → 재플롯
  notify()
}

/** Project code changes retain geometry but reset code-dependent inputs. Existing Gen results stay tied to their model. */
/** auto = 언어 규칙(간체 CN·한국어 기본 KR)에 따른 변경 — 사용자 선택이 아니라 sms_code 에 저장하지 않는다 */
export async function setCode(id: CodeId, opts: { auto?: boolean } = {}): Promise<void> {
  if (id === S.code || S.busy || S.confirm) return
  const previous = S.draftSpec ?? S.activePlan?.spec ?? S.built?.spec
  if (previous && !await confirmAction({ title: t('project_code_change'), body: t('project_code_confirm'), ok: t('project_code_apply') })) return
  if (S.busy || S.confirm) return
  const plan = S.activePlan
  S.buildEpoch++
  S.code = id
  if (getLang() !== 'zh-CN' && !opts.auto) saveCode(id) // 간체의 CN·한국어 기본 KR 은 언어 규칙이라 사용자 선택으로 저장하지 않음
  const defaults = defaultSpecFor(id)
  S.lastSpec = previous ? { ...defaults, span: previous.span, bays: previous.bays, baySpacing: previous.baySpacing, bayList: previous.bayList?.slice(), eaveHeight: previous.eaveHeight, roofSlope: previous.roofSlope, baseFixity: previous.baseFixity, purlinSpacing: previous.purlinSpacing, girtSpacing: previous.girtSpacing, postSpacing: previous.postSpacing, sagRods: previous.sagRods, features: previous.features && { ...previous.features } } : defaults
  if (previous) {
    S.lastSpec.restraints = previous.restraints && { ...previous.restraints }
    addPlanMsg(S.lastSpec, plan?.mode ?? (previous.bayList ? 'free' : 'template'), plan?.tpl ?? 'general')
    previewSpec(S.lastSpec)
    tab('viewP')
  }
  notify()
}

/** 앱 작업 상태만 처음으로 — 연결·언어·테마·설계기준은 유지, Gen 문서는 건드리지 않는다 */
export async function resetWorkspace(): Promise<void> {
  if (S.busy || S.confirm) return
  if (!await confirmAction({ title: t('flow_reset_title'), body: t('flow_reset_body'), ok: t('flow_reset_ok'), danger: true })) return
  if (S.busy || S.confirm) return
  S.buildEpoch++
  // restorePoint 는 Gen 문서 백업 경로라 남긴다 — 초기화 뒤에도 [이전 모델로 복원] 가능
  Object.assign(S, freshWorkState())
  S.lastSpec = defaultSpecFor(S.code)
  S.viewNonce++
  addMsg('bot', lt('flow_reset_done'))
  notify()
}

export interface TestOut { cls: '' | 'ok' | 'err'; text: string }

export async function testConn(): Promise<TestOut> {
  const fail = (): void => { S.connected = false; S.connErr = true; notify() }
  if (!S.baseUrl.trim() || !S.mapiKey.trim()) return { cls: 'err', text: t('test_need') }
  try {
    const { ok, status, j } = await verifyConn()
    if (!ok) { fail(); return { cls: 'err', text: status === 401 || status === 403 ? `${t('test_keyfail')}\n(HTTP ${status})` : t('test_http', status) } }
    if (!(j && j.status === 'connected' && j.keyVerified !== false)) {
      fail()
      return { cls: 'err', text: `${t('test_keyfail')}\n(status: ${j?.status ?? '-'} · keyVerified: ${j?.keyVerified ?? '-'})` }
    }
    S.connected = true; S.connErr = false
    S.program = (j.program || '').toLowerCase(); S.apiUser = j.user || ''
    notify()
    if (S.program && S.program !== 'gen') return { cls: 'err', text: t('test_wrongprod', j.program ?? '') }
    return { cls: 'ok', text: t('test_ok', j.program || 'gen', j.user || '') }
  } catch (e) {
    fail()
    return { cls: 'err', text: t('test_err', e instanceof Error ? e.message : String(e)) }
  }
}

/** Compatibility adapter for text-based callers; application buttons call executeAction directly. */
export const runCmd = send
