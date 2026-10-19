/* 작업 단계 목록 (순수) — 진행 막대 아래 '✓ 백업 · ● 재료·단면 · ○ …'. 작업 종류별 계획 + 지금 단계(stage)·호출(detail)로 현재 위치를 정한다.
   생성은 한 단계(st_send) 안의 MAPI 호출 경로로 세분(백업 → 새 문서 → 재료·단면 → 절점·요소 → 하중·조합). */
import type { I18nKey } from '../i18n'
import type { Job, JobKind } from './store'

export type JobStepStatus = 'done' | 'now' | 'todo'

const PLAN: Record<JobKind, I18nKey[]> = {
  build: ['sb_backup', 'sb_new', 'sb_matsec', 'sb_geom', 'sb_loads', 'st_verify'],
  anal: ['st_sync', 'sa_save', 'sa_run', 'sa_react'],
  design: ['st_sync', 'st_results', 'st_check'],
  opt: ['st_sync', 'st_results', 'st_send', 'st_verify', 'st_anal'],
  pdf: ['pdf_start'],
  docx: ['docx_start'],
  dwgpdf: ['dwg_pdf_start'],
  restore: ['st_restore'],
}

/** 지금 단계의 계획 내 위치 (-1 = 아직 시작 전) */
function current(j: Pick<Job, 'kind' | 'stage' | 'detail'>): number {
  const d = j.detail
  if (j.kind === 'build') {
    if (j.stage === 'st_verify') return 5
    if (j.stage !== 'st_send') return -1
    return /saveas/i.test(d) ? 0 : /\/doc\/new/i.test(d) ? 1 : /\/db\/(UNIT|MATL|SECT)\b/.test(d) ? 2 : /\/db\/(NODE|ELEM|FRLS|CONS)\b/.test(d) ? 3 : /\/db\//.test(d) ? 4 : 0
  }
  if (j.kind === 'anal') {
    if (j.stage === 'st_sync') return 0
    if (j.stage !== 'st_anal') return -1
    return /saveas/i.test(d) ? 1 : /\/doc\/anal/i.test(d) ? 2 : /\/post\//i.test(d) ? 3 : 1
  }
  return PLAN[j.kind].indexOf(j.stage as I18nKey)
}

export function jobSteps(j: Pick<Job, 'kind' | 'stage' | 'detail'>): { key: I18nKey; status: JobStepStatus }[] {
  const now = current(j)
  return PLAN[j.kind].map((key, i) => ({ key, status: i < now ? 'done' : i === now ? 'now' : 'todo' }))
}
