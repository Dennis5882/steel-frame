/* 확인 창 (AlertDialog 역할) — Gen NX 문서를 바꾸는 작업(모델 교체·복원) 전에. 네이티브 <dialog> 모달: 배경 inert·포커스 가둠·닫으면 원래 버튼으로 포커스 복귀.
   사용: if (await confirmAction({ title, body, ok })) … — 상태는 S.confirm 하나 (store 패턴). */
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { S, notify, useStore } from '../state/store'

export interface ConfirmReq { title: string; body: string; ok: string; danger?: boolean; skipKey?: string }
const skipped = new Set<string>()

/** 화면 없는 실행(회귀·라이브 스크립트)용 응답기 — 설정하면 확인 창 대신 이것이 답한다 */
let handler: ((req: ConfirmReq) => boolean | Promise<boolean>) | null = null
export const setConfirmHandler = (h: typeof handler) => { handler = h }

/** 확인 창을 띄우고 결과를 기다린다. skipKey 가 있으면 '이번 세션에서 다시 묻지 않기' 제공 */
export function confirmAction(req: ConfirmReq): Promise<boolean> {
  if (handler) return Promise.resolve(handler(req))
  if (req.skipKey && skipped.has(req.skipKey)) return Promise.resolve(true)
  return new Promise((resolve) => { S.confirm = { ...req, resolve }; notify() })
}

export function ConfirmDialog() {
  const s = useStore()
  const c = s.confirm
  const ref = useRef<HTMLDialogElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const [skip, setSkip] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!c || !el) return
    setSkip(false)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    el.showModal()
    okRef.current?.focus()
    return () => { el.close(); if (previous?.isConnected) previous.focus() }
  }, [c])

  const done = (ok: boolean) => {
    if (!c) return
    if (ok && skip && c.skipKey) skipped.add(c.skipKey)
    S.confirm = null
    notify()
    c.resolve(ok)
  }

  return (
    <dialog ref={ref} className="confirm-dlg" role="alertdialog" aria-labelledby="cfm-title" aria-describedby="cfm-body"
      onCancel={(e) => { e.preventDefault(); done(false) }}>
      {c && <>
        <h2 id="cfm-title">{c.title}</h2>
        <p id="cfm-body" dangerouslySetInnerHTML={{ __html: c.body }} />
        {c.skipKey && <label className="cfm-skip"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> {t('cfm_skip')}</label>}
        <div className="cfm-row">
          <button className="btn btn-ghost" onClick={() => done(false)}>{t('cancel')}</button>
          <button ref={okRef} className={`btn ${c.danger ? 'btn-danger' : 'btn-c'}`} onClick={() => done(true)}>{c.ok}</button>
        </div>
      </>}
    </dialog>
  )
}
