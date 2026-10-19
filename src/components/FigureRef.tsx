/* 입력 칸 옆 원문 그림 — KDS 41 12 00 그림 5.5-1(기본풍속)·4.2-1(기본지상설하중).
   지도는 눈으로 읽어 입력하는 값이라 원문 주(註)를 칸 아래에 늘 보여 주고, [그림] 버튼은 네이티브 <dialog> 로 원본을 크게 연다.
   이미지 = public/figures (원문 KB COde/KR/knowledge/kds-41-12-00/assets 사본). */
import { useEffect, useRef, useState } from 'react'
import { t, type I18nKey } from '../i18n'

export type FigureKey = 'krWind' | 'krSnow'
const FIG: Record<FigureKey, { src: string; no: string; title: I18nKey; note: I18nKey; notes: I18nKey }> = {
  krWind: { src: 'figures/kds-41-12-00-fig5-5-1.png', no: '5.5-1', title: 'fig_kr_wind_title', note: 'fig_kr_wind_note', notes: 'fig_kr_wind_notes' },
  krSnow: { src: 'figures/kds-41-12-00-fig4-2-1.png', no: '4.2-1', title: 'fig_kr_snow_title', note: 'fig_kr_snow_note', notes: 'fig_kr_snow_notes' },
}

/** 입력 칸 안의 [그림 n] 버튼 + 원본 그림 대화상자 */
export function FigureButton({ fig }: { fig: FigureKey }) {
  const f = FIG[fig]
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!open || !el) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    el.showModal()
    return () => { el.close(); if (previous?.isConnected) previous.focus() }
  }, [open])
  const id = `fig-${fig}`
  return <>
    <button type="button" className="fig-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" title={t(f.title)}>{t('fig_btn', f.no)}</button>
    <dialog ref={ref} className="fig-dlg" aria-labelledby={`${id}-t`} onCancel={(e) => { e.preventDefault(); setOpen(false) }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      {open && <>
        <div className="fig-hd"><b id={`${id}-t`}>{t(f.title)}</b><button type="button" className="rn-x" onClick={() => setOpen(false)} aria-label={t('fig_close')}>✕</button></div>
        <div className="fig-body">
          <img src={`/${f.src}`} alt={t(f.title)} />
          <p className="fig-notes">{t(f.notes)}</p>
        </div>
      </>}
    </dialog>
  </>
}

/** 칸 아래 원문 주 한 줄 */
export const FigureNote = ({ fig }: { fig: FigureKey }) => <small className="fig-note">{t(FIG[fig].note)}</small>
