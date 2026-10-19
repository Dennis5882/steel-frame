/* 앱 셸 — story 프로젝트와 같은 레이아웃: 헤더 / [가이드+채팅 | 분할선 | 탭 패널] / 하단 바 / 설정 드로어 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Workspace } from './components/Workspace'
import { Drawers } from './components/Drawers'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Footer } from './components/Footer'
import { TaskNav } from './components/TaskNav'
import { Header } from './components/Header'
import { LogPanel, ModelPanel, ResultsPanel } from './components/Panels'
import { View3D } from './components/View3D'
import { t, useLang, type I18nKey } from './i18n'
import { syncBaseUrl, useStore, type PanelId } from './state/store'
import { tab } from './state/ui'

const TABS: { id: PanelId; key: I18nKey }[] = [
  { id: 'logP', key: 'tab_log' },
  { id: 'modelP', key: 'tab_model' },
  { id: 'viewP', key: 'tab_3d' },
  { id: 'resP', key: 'tab_res' },
]


/* 채팅|우측 패널 분할 비율(%) — 드래그로 조절, 더블클릭 = 기본값. 뷰어별 편의라 localStorage(실패해도 기본값) */
const SPLIT_DEF = 49, SPLIT_MIN = 25, SPLIT_MAX = 75
function readSplit(): number {
  try { const v = parseFloat(localStorage.getItem('sms_split') || ''); return v >= SPLIT_MIN && v <= SPLIT_MAX ? v : SPLIT_DEF } catch { return SPLIT_DEF }
}
function saveSplit(v: number) { try { localStorage.setItem('sms_split', String(v)) } catch { /* 무시 */ } }

export function App() {
  const s = useStore()
  const lang = useLang()
  const [drawer, setDrawer] = useState(false)
  const [guideCollapsed, setGuideCollapsed] = useState(false)
  const [split, setSplit] = useState(readSplit)
  const [dragging, setDragging] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  const onSplitDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const onSplitMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragging || !mainRef.current) return
    const r = mainRef.current.getBoundingClientRect()
    setSplit(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ((e.clientX - r.left) / r.width) * 100)))
  }
  const onSplitUp = () => {
    if (!dragging) return
    setDragging(false)
    saveSplit(split)
    window.dispatchEvent(new Event('resize')) // Plotly(responsive) 3D 뷰 재배치
  }
  const resetSplit = () => { setSplit(SPLIT_DEF); saveSplit(SPLIT_DEF); requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))) }

  useEffect(() => {
    document.title = t('meta_title')
    syncBaseUrl(lang)
  }, [lang])

  return (
    <>
      <Header onOpenMapi={() => setDrawer(true)} />
      <main ref={mainRef} className={dragging ? 'splitting' : undefined} style={{ ['--split' as any]: `${split}%` }}>
        <section className="chat">
          <TaskNav collapsed={guideCollapsed} onToggle={() => setGuideCollapsed((c) => !c)} onOpenMapi={() => setDrawer(true)} />
          <Workspace guideCollapsed={guideCollapsed} onOpenGuide={() => setGuideCollapsed(false)} onOpenMapi={() => setDrawer(true)} />
        </section>
        <div className="splitter" title={t('split_tip')} onPointerDown={onSplitDown} onPointerMove={onSplitMove}
          onPointerUp={onSplitUp} onPointerCancel={onSplitUp} onDoubleClick={resetSplit} />
        <section className="right">
          <div className="tabbar" role="tablist" aria-label={t('flow_view_results')}>
            {TABS.map((tb) => (
              <button type="button" role="tab" id={`tab-${tb.id}`} aria-selected={s.panel === tb.id} aria-controls={tb.id} key={tb.id} className={`tab${s.panel === tb.id ? ' on' : ''}`}
                tabIndex={s.panel === tb.id ? 0 : -1}
                onKeyDown={(e) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
                  e.preventDefault()
                  const index = TABS.findIndex((x) => x.id === tb.id)
                  const next = TABS[e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length]
                  tab(next.id)
                  document.getElementById(`tab-${next.id}`)?.focus()
                  if (next.id === 'viewP') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
                }}
                onClick={() => { tab(tb.id); if (tb.id === 'viewP') requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))) }}>
                {t(tb.key)}
              </button>
            ))}
          </div>
          <div id="logP" role="tabpanel" aria-labelledby="tab-logP" className={`panel${s.panel === 'logP' ? ' on' : ''}`}><LogPanel /></div>
          <div id="modelP" role="tabpanel" aria-labelledby="tab-modelP" className={`panel${s.panel === 'modelP' ? ' on' : ''}`}><ModelPanel /></div>
          <div id="viewP" role="tabpanel" aria-labelledby="tab-viewP" className={`panel${s.panel === 'viewP' ? ' on' : ''}`}><View3D /></div>
          <div id="resP" role="tabpanel" aria-labelledby="tab-resP" className={`panel${s.panel === 'resP' ? ' on' : ''}`}><ResultsPanel /></div>
        </section>
      </main>
      <Footer />
      <Drawers open={drawer} onClose={() => setDrawer(false)} />
      <ConfirmDialog />
    </>
  )
}
