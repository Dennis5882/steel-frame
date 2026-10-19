import { Building2, Calculator, ClipboardCheck, Download, History, SlidersHorizontal, Settings, CircleHelp, RotateCcw, Eraser } from 'lucide-react'
import { restoreBackup } from '../actions/build'
import { executeAction, resetWorkspace } from '../agent/session'
import { t } from '../i18n'
import { useStore } from '../state/store'
import { selectTask } from '../state/ui'
import { TASKS, taskStatus } from '../state/taskFlow'

const ICONS = [Building2, Calculator, ClipboardCheck, SlidersHorizontal, Download]
export function TaskNav({ collapsed, onToggle, onOpenMapi }: { collapsed: boolean; onToggle(): void; onOpenMapi(): void }) {
  const s = useStore()
  const unread = s.activity.filter((a) => a.source === 'notice' && a.level !== 'info' && !a.acknowledged).length
  return <aside className={`guide task-nav${collapsed ? ' collapsed' : ''}`}>
    <div className="guide-hd"><span>{t('wf_title')}</span><button className="guide-tog" aria-expanded={!collapsed} aria-controls="task-navigation" onClick={onToggle} aria-label={t(collapsed ? 'guide_open' : 'guide_close')}>{collapsed ? '⟩' : '⟨'}</button></div>
    <div id="task-navigation" className="task-nav-body" hidden={collapsed}>
      <nav aria-label={t('wf_title')}><ol>{TASKS.map((task, i) => {
        const status = taskStatus(s, task.id), Icon = ICONS[i]
        return <li key={task.id}><button className={`task-link ${s.task === task.id ? 'active' : ''}`} aria-current={s.task === task.id ? 'page' : undefined} onClick={() => selectTask(task.id)}>
          <span className="task-icon" aria-hidden="true"><Icon size={17} /></span><span className="task-link-text"><strong>{t(task.label)}{task.id === 'optimize' && <small>{t('flow_optional')}</small>}</strong><span className={`task-state ${status}`}>{t(`flow_status_${status}`)}</span></span>
        </button></li>
      })}</ol></nav>
      <div className="task-nav-bottom">
        <button className={`task-utility${s.task === 'history' ? ' active' : ''}`} aria-current={s.task === 'history' ? 'page' : undefined} onClick={() => selectTask('history')}><History size={16} />{t('flow_history')}{unread > 0 && <span className="task-unread" aria-label={t('flow_unread', unread)}>{unread}</span>}</button>
        <button className="task-utility" onClick={onOpenMapi}><Settings size={16} />{t('flow_connection')}</button>
        {s.restorePoint && <button className="task-utility" disabled={s.busy} onClick={() => void restoreBackup()}><RotateCcw size={16} />{t('wf_restore')}</button>}
        <button className="task-utility" onClick={() => void executeAction({ intent: 'help' })}><CircleHelp size={16} />{t('g_help_1')}</button>
        <button className="task-utility" disabled={s.busy} title={t('flow_reset_body')} onClick={() => void resetWorkspace()}><Eraser size={16} />{t('flow_reset')}</button>
      </div>
    </div>
  </aside>
}
