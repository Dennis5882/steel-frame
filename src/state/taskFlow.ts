/** Shared button availability and stage states. Viewing a stage never runs a job. */
import type { AppState, TaskId } from './store'
import type { FactorySpec } from '../domain/types'
import type { I18nKey } from '../i18n'
import { blockedMembers } from '../domain/validity'

/** 키 순서·undefined 와 무관한 스펙 비교 (카드의 toSpec·normalizeBays 가 키 순서를 바꿀 수 있음) */
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter((k) => (v as any)[k] !== undefined).sort().map((k) => [k, canon((v as any)[k])])) : v
export const specChanged = (a: FactorySpec | null, b: FactorySpec | null | undefined) => !!a && !!b && JSON.stringify(canon(a)) !== JSON.stringify(canon(b))

export const TASKS: { id: Exclude<TaskId, 'history'>; label: I18nKey; hint: I18nKey }[] = [
  { id: 'model', label: 'flow_model', hint: 'flow_model_hint' },
  { id: 'analysis', label: 'wf_anal', hint: 'flow_analysis_hint' },
  { id: 'design', label: 'wf_design', hint: 'flow_design_hint' },
  { id: 'optimize', label: 'flow_optimize', hint: 'flow_optimize_hint' },
  { id: 'outputs', label: 'flow_outputs', hint: 'flow_outputs_hint' },
]
type FlowState = Pick<AppState, 'busy' | 'confirm' | 'built' | 'analyzed' | 'design' | 'connections' | 'opt' | 'job' | 'lastFail' | 'genChanged' | 'draftSpec' | 'draftInvalid' | 'mapiKey' | 'activity' | 'modelRevision' | 'resultRevision'>
export const taskOfJob = (kind: string): TaskId => ({ build: 'model', restore: 'model', anal: 'analysis', design: 'design', opt: 'optimize', pdf: 'outputs', docx: 'outputs', dwgpdf: 'outputs' }[kind] as TaskId ?? 'model')
export const isStale = (s: Pick<FlowState, 'built' | 'genChanged' | 'draftSpec' | 'draftInvalid'>) => !!s.built && (s.genChanged > 0 || s.draftInvalid || specChanged(s.draftSpec, s.built.spec))

export function unavailable(s: FlowState, task: TaskId): I18nKey | null {
  if (s.busy || s.confirm) return 'busy'
  if (task === 'model' || task === 'history') return null
  if (!s.built) return 'flow_need_model'
  /* Gen 변경: 해석·검토·최적화는 실행 첫 단계에서 Gen 을 다시 비교(assertGenSync)하므로 막지 않는다 —
     Gen 에서 되돌렸으면 통과하고 감지 건수도 0 으로. 막으면 다시 확인할 길이 없어 재생성만 남는다 */
  const genChecked = task === 'analysis' || task === 'design' || task === 'optimize'
  if (s.genChanged && !genChecked) return 'wf_stale_gen'
  if (s.draftInvalid) return 'flow_invalid_draft'
  if (specChanged(s.draftSpec, s.built.spec)) return 'wf_stale_edited'
  /* 산출물은 모델만 있으면 가능 — 계산서는 부분판(검토 전 표시), 도면·물량은 접합 없이 부재만 */
  if (task === 'outputs') return blockedMembers(s.design) ? 'flow_invalid_design' : null
  if (task !== 'analysis' && !s.analyzed) return 'need_anal'
  if (task === 'optimize' && (!s.design || !s.connections)) return 'flow_need_design'
  if (!s.mapiKey.trim()) return 'flow_need_connection'
  return null
}

export type TaskStatus = 'todo' | 'ready' | 'done' | 'running' | 'failed' | 'cancelled' | 'stale'
export function taskStatus(s: FlowState, task: TaskId): TaskStatus {
  if (s.job && taskOfJob(s.job.kind) === task) return 'running'
  if (isStale(s)) return 'stale'
  if ((task === 'design' || task === 'outputs') && blockedMembers(s.design)) return 'failed'
  if (s.lastFail && taskOfJob(s.lastFail.kind) === task) return s.lastFail.cancelled ? 'cancelled' : 'failed'
  if (task === 'model') return s.built ? 'done' : 'ready'
  if (task === 'analysis' && s.analyzed || task === 'design' && s.design || task === 'optimize' && s.opt) return 'done'
  if (task === 'outputs' && s.activity.some((a) => a.source === 'artifact' && a.revision === s.modelRevision && a.resultRevision === s.resultRevision)) return 'done'
  // Connection setup is an execution prerequisite, not a completed workflow stage.
  return unavailable({ ...s, mapiKey: 'readiness' }, task) ? 'todo' : 'ready'
}
