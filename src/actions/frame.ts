/* 다층 강골조 작업 — 모델 생성 · 해석 · 설계 검토. Gen 단계는 src/frame/run.ts (scripts/live-frame.ts 와 같은 순서).
   진행·취소·실패 표시는 공장 앱 job 모듈을 그대로 쓴다. */
import { t, lt } from '../i18n'
import { mapi } from '../mapi/client'
import { S, notify } from '../state/store'
import { addMsg, escapeHtml, tab } from '../state/ui'
import { confirmAction } from '../components/ConfirmDialog'
import { autoSave } from './save'
import { beginJob, endJob, failMsg, stage } from './job'
import { buildFrame } from '../frame/geometry'
import { framePayloads } from '../frame/gen'
import { analyze, collectAnalysis, collectForces, COLLECT_CALLS, equilibriumError, expectOk, SEND_CALLS, sendFrame } from '../frame/run'
import { storyReview } from '../frame/story'
import { designMembers, runFrameDesign } from '../frame/design'
import type { Request } from '../frame/results'
import { F, clearResults, frameStale } from '../frame/state'

const req: Request = (m, p, b) => mapi(m, p, b as Record<string, unknown> | undefined)

export async function buildFrameModel(): Promise<void> {
  const spec = F.draft
  if (!spec || S.busy) return
  if (!S.mapiKey.trim()) { addMsg('bot', lt('need_key')); return }
  let model
  try { model = buildFrame(spec) } catch (e) { addMsg('bot', t('build_fail', escapeHtml(e instanceof Error ? e.message : String(e)))); return }
  if (!await confirmAction({ title: t('cfm_build_title'), body: t('cfm_build_body', escapeHtml(S.saveDir || 'C:/temp')), ok: t('cfm_build_ok'), skipKey: 'build' })) return
  if (!beginJob('build')) return
  addMsg('bot', lt('build_start'))
  tab('logP')
  try {
    const P = framePayloads(spec, model)
    stage('st_send', SEND_CALLS + 2)
    S.restorePoint = await autoSave('backup')
    notify()
    const counts = await sendFrame(req, P, model)
    const file = await autoSave('model')
    clearResults()
    F.built = { spec: JSON.parse(JSON.stringify(spec)), model, P, counts, file }
    S.modelRevision++
    addMsg('bot', lt('fl_build_done', model.nodes.length, model.elements.length, model.supports.length, P.combos.length))
    S.task = 'analysis'
    S.cam = 'iso'; S.camReset++; S.viewNonce++
    tab('viewP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('build_fail', m)))
  } finally {
    endJob()
  }
}

export async function analyzeFrame(): Promise<void> {
  const b = F.built
  if (!b || S.busy) return
  if (frameStale(F)) { addMsg('bot', lt('wf_stale_edited')); return }
  if (!beginJob('anal')) return
  addMsg('bot', lt('anal_start'))
  try {
    stage('st_anal', 2)
    await autoSave('model') // 저장 안 된 문서의 해석은 확인 창을 띄운다 (gen-api-cautions.md 2)
    clearResults()
    notify()
    await analyze(req)
    stage('st_results', COLLECT_CALLS)
    const A = await collectAnalysis(req, b.spec, b.model, b.P)
    F.analysis = A
    const bad = Object.entries(A.equilibrium).filter(([, e]) => !(equilibriumError(e) < 1e-3))
    if (bad.length) addMsg('bot', lt('fl_eq_warn', bad.map(([k]) => k).join(', ')), 'warn')
    const miss = Object.keys(A.missing)
    if (miss.length) addMsg('bot', lt('fl_tables_missing', miss.join(', ')), 'warn')
    const T1 = A.story.eigen?.periods[0]
    addMsg('bot', lt('fl_anal_done', T1 ? T1.toFixed(3) : '—'))
    S.task = 'design'
    tab('resP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('anal_fail', m)))
  } finally {
    endJob()
  }
}

export async function designFrame(): Promise<void> {
  const b = F.built, A = F.analysis
  if (!b || !A || S.busy) return
  if (!beginJob('design')) return
  addMsg('bot', lt('fl_design_start'))
  try {
    stage('st_results', Math.ceil(b.P.combos.length / Math.max(1, Math.floor(40000 / (b.model.elements.length * 5)))))
    const forces = await collectForces(req, b.model, b.P)
    stage('st_check')
    F.forces = forces
    F.review = storyReview(b.spec, b.model, A.story, A.colStrongAxis)
    F.design = runFrameDesign(b.spec, designMembers(b.spec, b.model, A.colStrongAxis), forces, b.P.combos.map((c) => ({ name: c.name, seismic: c.seismic })))
    F.ratioView = true
    S.viewNonce++
    const ng = F.design.members.filter((m) => m.ratio > 1 || m.detailRatio > 1).length
    addMsg('bot', lt('fl_design_done', F.design.members.length, ng))
    tab('resP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('design_fail', m)))
  } finally {
    endJob()
  }
}

/** [이전 모델로 복원] — 생성 직전 백업을 다시 연다. 앱의 모델·결과는 비운다 */
export async function restoreFrameBackup(): Promise<void> {
  const path = S.restorePoint
  if (!path || S.busy) return
  if (!await confirmAction({ title: t('cfm_restore_title'), body: t('cfm_restore_body', escapeHtml(path)), ok: t('cfm_restore_ok'), danger: true })) return
  if (!beginJob('restore')) return
  try {
    stage('st_restore', 2)
    await autoSave('model')
    expectOk(await mapi('POST', '/doc/open', { Argument: path }, path), 'doc/open')
    F.built = null
    clearResults()
    S.restorePoint = null
    S.viewNonce++
    addMsg('bot', lt('fr_restore_done', escapeHtml(path)))
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('restore_fail', m)))
  } finally {
    endJob()
  }
}
