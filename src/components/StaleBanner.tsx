import { t } from '../i18n'
import { useStore } from '../state/store'
import { isStale } from '../state/taskFlow'

export function StaleBanner() {
  const s = useStore()
  if (!isStale(s)) return null
  return <div className="stale-banner" role="status">⚠ {t(s.genChanged ? 'wf_stale_gen' : s.draftInvalid ? 'flow_invalid_draft' : 'wf_stale_edited')}</div>
}
