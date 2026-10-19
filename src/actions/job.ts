/* 작업 진행·취소 — 생성·해석·설계 검토·최적화 공통.
   진행: 단계(stage) = 문구 키 + 예상 MAPI 호출 수, mapi() 가 호출마다 step++·detail 갱신. 최적화는 iter 로 반복 수를 따로 표시.
   취소: 협조식 — 플래그만 세우고 다음 MAPI 호출 직전에 Cancelled 를 던진다. Gen 이 처리 중인 호출(해석 등)은 끝까지 기다린다(중단 API 없음). */
import { t, type I18nKey, lt } from '../i18n'
import { S, notify, type Job, type JobKind, FILE_JOBS } from '../state/store'
import { addMsg, recordActivity } from '../state/ui'
import { ResultValidationError } from '../domain/resultValidation'
import { QuantityError } from '../domain/quantities'
import { GenChangedError } from './genSync'
import { diffText } from '../domain/genSync'

export class Cancelled extends Error {
  constructor() { super('cancelled') }
}

/** 작업 시작 — 이미 진행 중이면 false (중복 실행 방지, 동기 검사라 연속 클릭도 막힌다) */
export function beginJob(kind: JobKind): boolean {
  if (S.busy) { addMsg('bot', lt('busy')); return false }
  S.busy = true
  S.lastFail = null
  if (!FILE_JOBS.has(kind)) S.resultRevision++
  S.job = { kind, stage: '', step: 0, total: 0, detail: '', t0: Date.now(), cancel: false }
  S.job.activityId = recordActivity({ source: 'job', kind, status: 'running', level: 'info' })
  notify()
  return true
}

export function endJob(): void {
  const entry = S.activity.find((a) => a.id === S.job?.activityId)
  if (entry && S.job) {
    entry.status = S.lastFail?.kind === S.job.kind ? S.lastFail.cancelled ? 'cancelled' : 'failed' : 'done'
    entry.level = entry.status === 'failed' ? 'error' : entry.status === 'cancelled' ? 'warn' : 'info'
    entry.elapsed = Date.now() - S.job.t0
  }
  S.busy = false
  S.job = null
  notify()
}

/** 단계 전환 — total = 이 단계에서 예상하는 MAPI 호출 수(0 = 막대 없이 문구만) */
export function stage(key: I18nKey, total = 0): void {
  const j = S.job
  if (!j) return
  checkCancel()
  Object.assign(j, { stage: key, step: 0, total, detail: '' } satisfies Partial<Job>)
  notify()
}

export function setIter(n: number, max: number): void {
  if (S.job) { S.job.iter = [n, max]; notify() }
}

/** mapi() 가 호출 직전에 부른다 */
export function jobCall(detail: string): void {
  const j = S.job
  if (!j) return
  checkCancel()
  j.detail = detail
  if (j.total) j.step = Math.min(j.step + 1, j.total)
  notify()
}

export function checkCancel(): void {
  if (S.job?.cancel) throw new Cancelled()
}

export function cancelJob(): void {
  if (!S.job || S.job.cancel) return
  S.job.cancel = true
  notify()
}

/** 실패 메시지 — 취소면 취소 문구(모델이 중간 상태면 다시 생성 안내), 아니면 원래 실패 문구 */
export function failMsg(e: unknown, failKey: (m: string) => string): string {
  const msg = failText(e, failKey)
  /* 작업 흐름 띠에 실패 이유를 그대로 보여 준다 (채팅을 찾지 않아도 되게) */
  if (S.job) S.lastFail = { kind: S.job.kind, cancelled: e instanceof Cancelled, msg: msg.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '') }
  return msg
}

function failText(e: unknown, failKey: (m: string) => string): string {
  if (e instanceof Cancelled) return S.built ? t('job_cancelled') : t('job_cancelled_model')
  if (e instanceof GenChangedError) return failKey(t('gen_changed', e.diffs.length, e.diffs.slice(0, 5).map((d) => `· ${diffText(d)}`).join('<br>')))
  if (e instanceof ResultValidationError) return failKey(t('results_invalid', [e.table, t(`rv_${e.issue}`), e.where].filter(Boolean).join(' · ')))
  if (e instanceof QuantityError) return failKey(t('q_invalid', e.where))
  return failKey(e instanceof Error ? e.message : String(e))
}
