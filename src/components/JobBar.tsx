/* 작업 진행 막대 — 입력창 위. 단계 문구·호출 진행(step/total)·경과 시간·현재 MAPI 호출·[취소].
   취소는 다음 MAPI 호출 전에 멈춘다(Gen 이 처리 중인 해석 등은 끝까지 기다림) — 누르면 '취소 중…' 으로 바뀐다. */
import { useEffect, useState } from 'react'
import { cancelJob } from '../actions/job'
import { t, type I18nKey } from '../i18n'
import { useStore, FILE_JOBS } from '../state/store'
import { jobSteps } from '../state/jobSteps'
import { tab } from '../state/ui'

export function JobBar() {
  const s = useStore()
  const j = s.job
  const [, tick] = useState(0)
  useEffect(() => {
    if (!j) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    /* 작업 중 새로고침·닫기 경고 — 전송 도중 떠나면 Gen 모델이 중간 상태로 남는다 */
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', leave)
    return () => { clearInterval(id); window.removeEventListener('beforeunload', leave) }
  }, [j])
  if (!j) return null
  const sec = Math.floor((Date.now() - j.t0) / 1000)
  const pct = j.total ? Math.round((j.step / j.total) * 100) : null
  const label = j.stage ? t(j.stage as I18nKey) : ''
  return (
    <div className="jobbar">
      <div className="jb-top">
        <span className="typing" aria-hidden><span /><span /><span /></span>
        <span className="jb-stage" role="status" aria-live="polite">
          {j.iter && <b>{t('job_iter', j.iter[0], j.iter[1])} · </b>}
          {label}{pct !== null && ` ${j.step}/${j.total}`}
        </span>
        <span className="jb-time">{t('job_elapsed', sec)}</span>
        <button className="btn btn-ghost jb-cancel" disabled={j.cancel} title={t(FILE_JOBS.has(j.kind) ? 'pdf_cancel_tip' : 'job_cancel_tip')} onClick={cancelJob}>
          {j.cancel ? t('job_cancelling') : t('job_cancel')}
        </button>
      </div>
      <div className="jb-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={pct ?? undefined}>
        <div className={`jb-fill${pct === null ? ' ind' : ''}`} style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
      {/* 단계 목록 — 색만이 아니라 기호(✓ ● ○)와 글자로 상태 표시 */}
      <ol className="jb-steps" aria-label={t('job_steps')}>
        {jobSteps(j).map((st) => (
          <li key={st.key} className={`jbs-${st.status}`} aria-current={st.status === 'now' ? 'step' : undefined}>
            <span aria-hidden>{st.status === 'done' ? '✓' : st.status === 'now' ? '●' : '○'}</span> {t(st.key)}
          </li>
        ))}
      </ol>
      <div className="jb-detail">
        {j.detail}
        <button className="jb-log" onClick={() => tab('logP')}>{t('job_log')}</button>
      </div>
    </div>
  )
}
