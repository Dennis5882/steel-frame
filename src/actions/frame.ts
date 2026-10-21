/* 다층 강골조 작업 — 모델 생성 · 해석 · 설계 검토. Gen 단계는 src/frame/run.ts (scripts/live-frame.ts 와 같은 순서).
   진행·취소·실패 표시는 공장 앱 job 모듈을 그대로 쓴다. */
import { t, lt } from '../i18n'
import { mapi } from '../mapi/client'
import { S, notify } from '../state/store'
import { addMsg, escapeHtml, tab } from '../state/ui'
import { confirmAction } from '../components/ConfirmDialog'
import { autoSave, autoSavePath } from './save'
import { beginJob, checkCancel, endJob, failMsg, setIter, setModelComplete, stage } from './job'
import { assertGenSync } from './genSync'
import { isConnectionError } from '../mapi/timeouts'
import { buildFrame } from '../frame/geometry'
import { framePayloads } from '../frame/gen'
import { FRAME_SYNC_DBS, frameSyncPayload, analyze, analyzeCalls, collectAnalysis, collectForces, COLLECT_CALLS, equilibriumError, expectOk, fitView, runRound, SEND_CALLS, sendFrame, VIEW_CALLS } from '../frame/run'
import { storyReview } from '../frame/story'
import { designMembers, memberFails, runFrameDesign } from '../frame/design'
import type { Request } from '../frame/results'
import { F, clearResults, frameStale } from '../frame/state'
import { OPT_MAX_ITER, optIter, optSummary, optimizeLoop, sectionsKey, type FrameOptIter, type FrameSections } from '../frame/optimize'
import type { FrameModel, FrameSpec } from '../frame/types'

const req: Request = (m, p, b) => mapi(m, p, b as Record<string, unknown> | undefined)

/** Gen 문서가 보내다 만 상태 — doc/new 직전에 켜고, 전송(개수 확인)이 끝나 F.built 를 새 모델로 바꾸는 순간 끈다. 실패·취소하면 켜진 채로 남아
    (다시 생성하거나 복원할 때까지) 취소 안내가 '다시 생성' 문구가 된다. F.built 는 전송이 끝날 때까지 이전 모델이라 그것만으론 모른다.
    doc/new 전에 취소하면(백업 저장 중 등) Gen 은 그대로이므로 첫 생성이라도 일반 취소 문구 */
let genPartial = false
setModelComplete(() => !genPartial)

/** 해석·검토·최적화·Gen 캡처 첫 단계 — 지금 Gen 문서가 앱이 보낸 모델(F.built.P)과 같은지. 다르면 GenChangedError 로 멈춘다.
    Gen 에서 직접 고친 경우와, 응답 없이 끊긴 생성·복원을 Gen 이 대화상자를 닫은 뒤 뒤늦게 실행한 경우를 같이 잡는다 */
export async function assertFrameGen(): Promise<void> {
  if (F.built) await assertGenSync(frameSyncPayload(F.built.P), FRAME_SYNC_DBS)
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const viewPng = () => autoSavePath('view').replace(/\.mgbx$/, '.png')

/** [모델 생성] 전송 — 생성 직전 Gen 문서를 백업(복원 지점)한 뒤 보낸다. 결과는 비운다 */
async function sendCore(spec: FrameSpec, model: FrameModel): Promise<void> {
  const P = framePayloads(spec, model)
  stage('st_send', SEND_CALLS + VIEW_CALLS + 2)
  S.restorePoint = await autoSave('backup')
  notify()
  checkCancel() // 백업 중 누른 취소는 여기서 — Gen 을 건드리기 전이므로 일반 취소 문구 (켠 뒤 doc/new 까지는 동기)
  genPartial = true
  const counts = await sendFrame(req, P, model)
  /* Gen 에 새 모델이 다 들어갔다 — 화면·저장이 실패해도 앱은 새 모델을 가리킨다 (이전 P 와 비교해 'Gen 변경'이 나지 않게) */
  clearResults()
  F.opt = null
  F.built = { spec: clone(spec), model, P, counts, file: '' }
  genPartial = false
  S.genChanged = 0 // 새로 보낸 모델 — 이전 Gen 변경 감지는 의미 없음
  S.modelRevision++
  await fitView(req, viewPng())
  F.built.file = await autoSave('model')
}

/** 해석 + 층 표 회수 */
async function analyzeCore(): Promise<void> {
  const b = F.built!
  stage('st_anal', analyzeCalls())
  clearResults() // 층 자료 PUT 부터 Gen 결과가 무효 — 중간에 끊겨도 지난 결과가 남지 않게 먼저 비운다
  notify()
  await analyze(req, b.P, () => autoSave('model'))
  stage('st_results', COLLECT_CALLS)
  F.analysis = await collectAnalysis(req, b.spec, b.model, b.P)
}

/** 부재력 회수 + 층 검토 + 부재 검토 */
async function designCore(): Promise<void> {
  const b = F.built!, A = F.analysis!
  stage('st_results', Math.ceil(b.P.combos.length / Math.max(1, Math.floor(40000 / (b.model.elements.length * 5)))))
  const forces = await collectForces(req, b.model, b.P)
  stage('st_check')
  F.forces = forces
  F.review = storyReview(b.spec, b.model, A.story, A.colStrongAxis)
  F.design = runFrameDesign(b.spec, designMembers(b.spec, b.model, A.colStrongAxis), forces, b.P.combos.map((c) => ({ name: c.name, seismic: c.seismic })))
}

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
    await sendCore(spec, model)
    addMsg('bot', lt('fl_build_done', model.nodes.length, model.elements.length, model.supports.length, F.built!.P.combos.length))
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
    await assertFrameGen()
    await analyzeCore()
    const A = F.analysis!
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
    await assertFrameGen()
    await designCore()
    F.ratioView = true
    S.viewNonce++
    const ng = F.design!.members.filter(memberFails).length
    addMsg('bot', lt('fl_design_done', F.design!.members.length, ng))
    tab('resP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('design_fail', m)))
  } finally {
    endJob()
  }
}

/** 현재 상태 → 반복 기록 */
const iterOf = (it: number): FrameOptIter => optIter(it, F.built!.spec, F.built!.model, F.review ?? [], F.design!)

/** [단면 최적화] — 제안 → Gen 재생성·재해석·검토 반복 (최대 OPT_MAX_ITER). 최종 = 통과 상태 중 가장 가벼운 것 (현재가 아니면 그 단면으로 다시 만든다).
    복원 지점(S.restorePoint)은 [모델 생성] 직전 백업 그대로 둔다. 취소·실패하면 입력(F.draft)을 최적화 전 단면으로 돌려놓고,
    Gen 에 남은 시험 모델은 F.built 로 그대로 표시한다(입력과 달라 '다시 생성' 안내) */
export async function optimizeFrame(): Promise<void> {
  const b = F.built
  if (!b || !F.analysis || !F.design || !F.forces || S.busy) return
  if (frameStale(F)) { addMsg('bot', lt('wf_stale_edited')); return }
  if (!await confirmAction({ title: t('fr_opt_cfm_title'), body: t('fr_opt_cfm_body', OPT_MAX_ITER), ok: t('fr_opt_run') })) return
  if (!beginJob('opt')) return
  const original = clone(b.spec)
  addMsg('bot', lt('fr_opt_start'))
  tab('logP')
  try {
    await assertFrameGen()
    const combos = b.P.combos.map((c) => ({ name: c.name, seismic: c.seismic }))
    const { iters, best, valid, end } = await optimizeLoop({
      start: iterOf(0),
      state: () => ({ spec: F.built!.spec, forces: F.forces!, combos, colStrongAxis: F.analysis!.colStrongAxis }),
      beforeIter: (it) => { setIter(it, OPT_MAX_ITER); checkCancel() },
      onPropose: (it, p) => addMsg('bot', lt('fr_opt_iter', it, p.sections.column, p.sections.beam, p.sections.brace)),
      evaluate: async (sections, it) => { await runState(sections); return iterOf(it) },
    })
    if (sectionsKey(best.sections) !== sectionsKey(F.built!.spec.sections)) {
      addMsg('bot', lt('fr_opt_restore', best.it))
      await runState(best.sections)
    }
    const D = F.design!
    const ratio = { column: D.byRole.column?.ratio ?? null, beam: D.byRole.beam?.ratio ?? null, brace: D.byRole.brace?.ratio ?? null }
    F.opt = optSummary(F.built!.model, iters, iterOf(best.it), ratio, valid ? end : 'none_valid')
    F.ratioView = true
    S.viewNonce++
    addMsg('bot', lt(valid ? 'fr_opt_done' : 'fr_opt_invalid', F.opt.weightBefore.toFixed(2), F.opt.weightAfter.toFixed(2), iters.length - 1))
    tab('resP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('fr_opt_fail', m)))
    F.opt = null
    if (F.built && sectionsKey(F.built.spec.sections) !== sectionsKey(original.sections)) {
      F.draft = clone(original)
      F.built.trial = true // 산출물 단계가 '입력 변경' 대신 중단된 시험 모델이라고 안내
      addMsg('bot', lt('fr_opt_aborted', F.built.spec.sections.column, F.built.spec.sections.beam, F.built.spec.sections.brace), 'warn')
    }
    S.viewNonce++
  } finally {
    endJob()
  }
}

/** 단면만 바꿔 Gen 재생성 → 해석 → 검토 (최적화 한 회, src/frame/run.ts runRound — 스크립트와 같은 순서).
    전송 직후 F.built 를 바꿔 Gen 과 앱이 같은 모델을 가리키게 한다 (중간 취소 대비). 입력(F.draft)도 같이 맞춘다 */
async function runState(sections: FrameSections): Promise<void> {
  const spec: FrameSpec = { ...clone(F.built!.spec), sections: { ...sections } }
  clearResults()
  notify()
  let file = ''
  checkCancel()
  genPartial = true
  const r = await runRound(req, spec, {
    save: async () => { file = await autoSave('model') ?? '' },
    viewPath: viewPng(),
    stage: (k, n) => stage(k, n),
    onSent: (model, P, counts) => {
      F.built = { spec: clone(spec), model, P, counts, file: '' }
      genPartial = false
      S.genChanged = 0
      F.draft = clone(spec)
      S.modelRevision++
      S.viewNonce++
    },
  })
  F.built!.file = file
  F.analysis = r.analysis; F.forces = r.forces; F.review = r.review; F.design = r.design
  S.viewNonce++
  notify()
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
    genPartial = false
    S.genChanged = 0
    clearResults()
    F.opt = null
    S.restorePoint = null
    S.viewNonce++
    addMsg('bot', lt('fr_restore_done', escapeHtml(path)))
  } catch (e) {
    /* 응답 없이 끊겼으면 Gen 이 대화상자를 닫은 뒤 백업을 열 수 있다 → 앱 모델을 믿을 수 없으므로 비운다 */
    /* 복원 지점도 비운다 — 다시 누르면 doc/open 이 Gen 대기열에 두 번 쌓인다. 백업 경로는 문구로 남긴다 */
    if (isConnectionError(e)) { F.built = null; clearResults(); F.opt = null; S.restorePoint = null; S.viewNonce++ }
    addMsg('bot', failMsg(e, (m) => t('restore_fail', m)))
    if (isConnectionError(e)) addMsg('bot', lt('fr_restore_lost', escapeHtml(path)), 'warn')
  } finally {
    endJob()
  }
}
