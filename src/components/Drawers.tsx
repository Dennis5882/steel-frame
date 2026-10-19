/* 설정 드로어 — ⚙ MIDAS API. 키는 메모리에만. */
import { useEffect, useRef, useState } from 'react'
import { testConn, type TestOut } from '../agent/session'
import { getLang, t } from '../i18n'
import { S, baseUrlOptions, notify, useStore } from '../state/store'

function MapiDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const s = useStore()
  const [out, setOut] = useState<TestOut | null>(null)
  const [custom, setCustom] = useState(false)
  const servers = baseUrlOptions(getLang())
  const isCustom = custom || !servers.includes(s.baseUrl)
  const dialog = useRef<HTMLDialogElement>(null)
  const firstInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = dialog.current
    if (!open || !el) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    el.showModal() // Native modal: background inert, focus trap, hidden when closed.
    firstInput.current?.focus()
    return () => { el.close(); if (previous?.isConnected) previous.focus() }
  }, [open])

  async function onTest() {
    setOut({ cls: '', text: t('test_ing') })
    setOut(await testConn())
  }

  return (
    <dialog ref={dialog} className="drawer" aria-labelledby="mapi-title" aria-modal="true"
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const targets = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter((el) => el.getClientRects().length > 0)
        const first = targets[0], last = targets.at(-1)
        if (e.shiftKey && document.activeElement === first && last) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last && first) { e.preventDefault(); first.focus() }
      }}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) onClose() }}>
      <header>
        <h1 id="mapi-title" style={{ fontSize: '.9rem' }}>{t('set_title')}<small>MIDAS Gen NX</small></h1>
        <div className="spacer" />
        <button type="button" className="gear" onClick={onClose} aria-label={t('close')}>✕</button>
      </header>
      <div className="body">
        <div className="field">
          <label htmlFor="mapi-base">BASE URL</label>
          <select id="mapi-base" disabled={s.busy} value={isCustom ? '' : s.baseUrl}
            onChange={(e) => { const v = e.target.value; setCustom(!v); if (v) { S.baseUrl = v; notify() } }}>
            {servers.map((u) => <option key={u} value={u}>{u}</option>)}
            <option value="">{t('base_custom')}</option>
          </select>
          {isCustom && <input aria-label={t('base_custom')} disabled={s.busy} value={s.baseUrl} placeholder="https://…/gen" style={{ marginTop: 6 }}
            onChange={(e) => { S.baseUrl = e.target.value; notify() }} />}
        </div>
        <div className="field">
          <label htmlFor="mapi-key">MAPI-KEY</label>
          <input id="mapi-key" ref={firstInput} type="password" autoComplete="off" disabled={s.busy} value={s.mapiKey} placeholder={t('mapi_key_ph')}
            onChange={(e) => { S.mapiKey = e.target.value; notify() }} />
          <div className="hint" dangerouslySetInnerHTML={{ __html: t('mapi_hint_html') }} />
        </div>
        <div className="field">
          <label htmlFor="mapi-save">{t('save_dir')}</label>
          <input id="mapi-save" disabled={s.busy} value={s.saveDir} onChange={(e) => { S.saveDir = e.target.value; notify() }} />
          <div className="hint">{t('save_dir_hint')}</div>
        </div>
        {s.busy && <div className="hint">{t('busy_locked')}</div>}
        <button className="btn btn-c" disabled={s.busy} onClick={() => void onTest()}>{t('conn_test')}</button>
        {out && <div className={`test-out${out.cls ? ' ' + out.cls : ''}`} style={{ display: 'block' }}>{out.text}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-c" onClick={onClose}>{t('save')}</button>
          <button className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </dialog>
  )
}

export function Drawers({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <MapiDrawer open={open} onClose={onClose} />
  )
}
