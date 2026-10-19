import { LANG_DEFS, normalizeLang, setLang, t, useLang } from '../i18n'
import { useStore } from '../state/store'

export function Header({ onOpenMapi }: { onOpenMapi(): void }) {
  const s = useStore()
  const lang = useLang()
  const connTxt = s.connected ? t('conn_linked') : s.connErr ? t('conn_failed') : t('conn_unlinked')

  return (
    <header>
      <div className="mark">GEN</div>
      <h1>
        {t('app_name')}
        <small>{t('subtitle')}</small>
      </h1>
      <div className="spacer" />
      <div className="langsel">
        <select value={lang} onChange={(e) => { const l = normalizeLang(e.target.value); if (l) setLang(l) }} aria-label="Language">
          {LANG_DEFS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
        </select>
      </div>
      <button type="button" className={`pill${s.connected ? ' on' : ''}${s.connErr ? ' err' : ''}`} onClick={onOpenMapi} title={t('flow_connection')} aria-label={`${connTxt} · ${t('flow_connection')}`} aria-haspopup="dialog">
        <span className="dot" />
        <span>{connTxt}</span>
      </button>
    </header>
  )
}
