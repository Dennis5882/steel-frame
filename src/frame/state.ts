/* 다층 강골조 작업 상태 — 공장 앱 store(S) 옆에 둔다. 변경 후 notify() 로 같은 구독(useStore)이 재렌더.
   draft = 편집 중 스펙, built = Gen 에 보낸 스펙·모델, analysis·forces·review·design = 결과 (모델이 바뀌면 비움). */
import { S, notify } from '../state/store'
import { buildFrame, validateSpec } from './geometry'
import { framePayloads, type FramePayloads } from './gen'
import type { FrameAnalysis, SendCounts } from './run'
import type { ElementForces } from './results'
import type { StoryItem } from './story'
import type { FrameDesign } from './design'
import type { FrameOptSummary } from './optimize'
import type { FrameModel, FrameSpec } from './types'
import { FRAME_TEMPLATES, type FrameTemplateKey } from './templates'

export const FRAME_STEPS = ['fs_grid', 'fs_stories', 'fs_sections', 'fs_braces', 'fs_loads', 'fs_lateral', 'fs_review'] as const
export const REVIEW_STEP = FRAME_STEPS.length - 1

/** trial = 최적화가 중단돼 Gen 에 남은 시험 모델 (입력은 최적화 전 단면으로 되돌려 둠). 모델을 다시 만들면 새 FrameBuilt 라 사라진다 */
export interface FrameBuilt { spec: FrameSpec; model: FrameModel; P: FramePayloads; counts: SendCounts; file: string; trial?: boolean }

export function freshFrameState() {
  return {
    draft: null as FrameSpec | null,
    tpl: null as FrameTemplateKey | null,
    view: 'start' as 'start' | 'edit',
    step: 0,
    visited: 0,
    built: null as FrameBuilt | null,
    analysis: null as FrameAnalysis | null,
    forces: null as ElementForces | null,
    review: null as StoryItem[] | null,
    design: null as FrameDesign | null,
    /** 단면 최적화 기록 (모델을 다시 만들면 비움) */
    opt: null as FrameOptSummary | null,
    /** 3D 를 응력비 색으로 */
    ratioView: false,
  }
}
export const F = freshFrameState()
export type FrameState = typeof F

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export function startTemplate(key: FrameTemplateKey): void {
  F.draft = clone(FRAME_TEMPLATES[key].spec)
  F.tpl = key
  F.view = 'edit'
  F.step = 0
  F.visited = 0
  S.task = 'model'
  S.panel = 'viewP'
  S.viewNonce++
  notify()
}

/** 편집 — 가새 방향에서 측이동 구속(无侧移)을 자동 결정 */
export function editDraft(fn: (s: FrameSpec) => void): void {
  if (!F.draft) return
  fn(F.draft)
  F.draft.design.braced = { X: F.draft.braces.some((b) => b.axis === 'X'), Y: F.draft.braces.some((b) => b.axis === 'Y') }
  S.viewNonce++
  notify()
}

export function goStep(i: number): void {
  F.step = Math.max(0, Math.min(REVIEW_STEP, i))
  F.visited = Math.max(F.visited, F.step)
  notify()
}

/** 편집 스펙 → 모델 (오류면 errors) */
export function draftModel(spec: FrameSpec | null): { model: FrameModel | null; errors: string[] } {
  if (!spec) return { model: null, errors: [] }
  const errors = validateSpec(spec)
  if (errors.length) return { model: null, errors }
  try { return { model: buildFrame(spec), errors: [] } } catch (e) { return { model: null, errors: [e instanceof Error ? e.message : String(e)] } }
}
export function draftPayloads(spec: FrameSpec, model: FrameModel): FramePayloads | null {
  try { return framePayloads(spec, model) } catch { return null }
}

/* 키 순서와 무관한 직렬화 — 같은 값을 다른 순서로 다시 만든 스펙을 '변경'으로 보지 않는다 */
const canon = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x)
/** 편집 스펙이 Gen 에 보낸 것과 다름 */
export const frameStale = (f: Pick<FrameState, 'draft' | 'built'>) => !!f.built && !!f.draft && canon(f.draft) !== canon(f.built.spec)

export function clearResults(): void {
  F.analysis = null; F.forces = null; F.review = null; F.design = null; F.ratioView = false
}
export function resetFrame(): void {
  Object.assign(F, freshFrameState())
  S.viewNonce++
  notify()
}

/* 작업 흐름 상태 (TaskNav·TaskStage) */
export type FrameTask = 'model' | 'analysis' | 'design' | 'optimize' | 'outputs'
export type FrameTaskStatus = 'todo' | 'ready' | 'done' | 'running' | 'failed' | 'cancelled' | 'stale'
const JOB_TASK: Record<string, FrameTask> = { build: 'model', restore: 'model', anal: 'analysis', design: 'design', pdf: 'outputs', docx: 'outputs', dwgpdf: 'outputs', opt: 'optimize' }

export function frameBlocker(task: FrameTask): OutputBlock | 'wf_stale_edited' | 'need_anal' | 'fr_opt_need_design' | null {
  /* 산출물 단계는 outputBlocker 의 단계 판정 (산출물을 지정하지 않음) */
  if (task === 'outputs') return outputBlocker(outputState())
  if (S.busy || S.confirm) return 'busy'
  if (task === 'model') return null
  if (!F.built) return 'flow_need_model'
  if (frameStale(F)) return 'wf_stale_edited'
  if (task === 'design' && !F.analysis) return 'need_anal'
  if (task === 'optimize' && !(F.design && F.forces)) return 'fr_opt_need_design'
  if (!S.mapiKey.trim()) return 'flow_need_connection'
  return null
}

/* 산출물 선행 조건 — 단계 안내·카드·실행 함수가 모두 outputBlocker 하나를 쓴다.
   순수 함수: 상태 스냅샷(outputState)을 받아 verify 에서 고정 상태로 검사한다. 입력 변경(stale)은 스냅샷에서 한 번만 계산한다.
   산출물을 지정하지 않으면 단계 전체 판정(작업 중·모델 없음·입력 변경), 지정하면 그 산출물의 조건(Gen 연결·필요한 결과)까지 본다.
   돌려주는 값이 곧 이유 문구 키다. 모델만 있으면 계산서·도면·물량은 낸다(해석·검토 전 부분은 '없음' 표시) */
export type FrameOutput = 'report' | 'detail' | 'drawings' | 'quantities' | 'csv'
const OUTPUT_RULES: Partial<Record<FrameOutput, { gen?: true; need?: ['analysis' | 'design', 'fr_detail_need_anal' | 'fr_csv_need_design'] }>> = {
  detail: { gen: true, need: ['analysis', 'fr_detail_need_anal'] }, // Gen NX 화면을 캡처한다
  csv: { need: ['design', 'fr_csv_need_design'] },
}
export type OutputState = Pick<FrameState, 'built' | 'analysis' | 'design'> & { busy: boolean; stale: boolean; connected: boolean }
export type OutputBlock = 'busy' | 'flow_need_model' | 'fr_out_stale' | 'fr_out_trial' | 'flow_need_connection' | 'fr_detail_need_anal' | 'fr_csv_need_design'
export const outputState = (): OutputState => ({ built: F.built, analysis: F.analysis, design: F.design, busy: S.busy || !!S.confirm, stale: frameStale(F), connected: !!S.mapiKey.trim() })
export function outputBlocker(f: OutputState, out?: FrameOutput): OutputBlock | null {
  if (f.busy) return 'busy'
  if (!f.built) return 'flow_need_model'
  if (f.built.trial) return 'fr_out_trial'
  if (f.stale) return 'fr_out_stale'
  const r = out && OUTPUT_RULES[out]
  if (r?.gen && !f.connected) return 'flow_need_connection'
  if (r?.need && !f[r.need[0]]) return r.need[1]
  return null
}

export function frameTaskStatus(task: FrameTask): FrameTaskStatus {
  if (S.job && JOB_TASK[S.job.kind] === task) return 'running'
  if (task !== 'model' && frameStale(F)) return 'stale'
  if (S.lastFail && JOB_TASK[S.lastFail.kind] === task) return S.lastFail.cancelled ? 'cancelled' : 'failed'
  if (task === 'model') return F.built ? frameStale(F) ? 'stale' : 'done' : 'ready'
  if (task === 'analysis' && F.analysis || task === 'design' && F.design || task === 'optimize' && F.opt) return 'done'
  const b = frameBlocker(task)
  return b && b !== 'flow_need_connection' ? 'todo' : 'ready'
}
