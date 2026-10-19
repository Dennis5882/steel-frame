/* 릴리즈 노트 창 — 하단 바 버전 클릭 / GUIDE 도움말 / '릴리즈 노트' 명령 (story 와 같은 .rn 모달).
   목록 = src/data/releases.json (최신 먼저), 항목 문구 = 사전 키 rn_<id>_<n> (화면 언어).
   새 버전은 `npm run release` 로만 추가 — scripts/release-check.mjs 가 빌드에서 버전·노트 누락을 막는다. */
import { useEffect } from 'react'
import releases from '../data/releases.json'
import { t, useLang, type I18nKey } from '../i18n'
import { useStore } from '../state/store'
import { APP_VERSION } from '../version'

interface Release { version: string; date: string; id: string; items: number }
const RELEASES = releases as Release[]

export function ReleaseNotes({ onClose }: { onClose(): void }) {
  useStore()
  useLang() // 언어 변경 시 다시 그림
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="scrim on" onClick={onClose} />
      <div className="rn" role="dialog" aria-modal="true" aria-label={t('rn_title')}>
        <div className="rn-hd">
          <b>{t('rn_title')}</b>
          <span className="rn-sub">Steel Frame Agent</span>
          <button className="rn-x" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        <div className="rn-body">
          {RELEASES.map((r, i) => (
            <details key={r.id} className="rn-item" open={i === 0}>
              <summary>
                <span className="rn-ver">v{r.version}</span>
                {r.version === APP_VERSION && <span className="rn-cur">{t('rn_current')}</span>}
                <span className="rn-date">{r.date}</span>
              </summary>
              <div className="rn-text">
                <ul>{Array.from({ length: r.items }, (_, k) => <li key={k}>{t(`rn_${r.id}_${k + 1}` as I18nKey)}</li>)}</ul>
              </div>
            </details>
          ))}
        </div>
      </div>
    </>
  )
}
