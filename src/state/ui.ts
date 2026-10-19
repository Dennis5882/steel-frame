/* UI 헬퍼 — 로그·채팅 메시지·탭·3D 미리보기 (story state/ui.ts 와 같은 역할) */
import type { BuildMode } from '../agent/parse'
import type { TemplateKey } from '../domain/templates'
import type { FactorySpec } from '../domain/types'
import { render, type LText } from '../i18n'
import { S, nextId, notify, type Activity, type LogType, type PanelId, type TaskId } from './store'

const nowTs = () => new Date().toTimeString().slice(0, 8)
const hm = () => new Date().toTimeString().slice(0, 5)

export function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
}

/** 활동 로그. err 는 이스케이프, 나머지는 HTML 허용 */
export function log(msg: string, type: LogType = 'api'): void {
  S.log.push({ id: nextId(), ts: nowTs(), type, html: type === 'err' ? escapeHtml(msg) : msg })
  notify()
}

/** html = 문자열(지금 언어로 확정) 또는 lt()/ltc() (그릴 때 번역 — 언어 변경 시 지난 메시지도 바뀜) */
export function addMsg(role: 'user' | 'bot', html: string | LText, level?: Activity['level']): void {
  S.msgs.push({ id: nextId(), ts: hm(), role, kind: 'html', html })
  if (role === 'bot') {
    const lv = level ?? (S.job && S.lastFail?.kind === S.job.kind ? S.lastFail.cancelled ? 'warn' : 'error' : 'info')
    /* 안내(info)는 최신 하나만 표시 — 이전 안내는 닫힘 처리(쌓이면 × 를 눌러도 같은 안내가 다시 보임) */
    if (lv === 'info') for (const a of S.activity) if (a.source === 'notice' && a.level === 'info') a.acknowledged = true
    recordActivity({ source: 'notice', html, parent: S.job?.activityId, kind: S.job?.kind, level: lv })
  }
  notify()
}

export function recordActivity(data: Omit<Activity, 'id' | 'at'>): number {
  const id = nextId()
  S.activity.push({ ...data, id, at: Date.now() })
  notify()
  return id
}

export function recordArtifact(name: string): void {
  recordActivity({ source: 'artifact', name, level: 'info', revision: S.modelRevision, resultRevision: S.resultRevision, code: S.built?.spec.code })
}

export function selectTask(task: TaskId): void {
  S.task = task
  if (task !== 'model') S.preview = null
  if (task === 'analysis' || task === 'design' || task === 'optimize') S.panel = 'resP'
  if (task === 'model') S.panel = 'viewP'
  if (task === 'model' && S.workspaceView === 'model' && S.activePlan) S.preview = S.draftSpec
  notify()
}

/** Set the single active editor — template wizard or free-frame form. */
/** fromStart: 사용자가 템플릿을 직접 고른 새 편집기 — 시작(템플릿) 단계를 건너뛴다 */
export function addPlanMsg(spec: FactorySpec, mode: BuildMode = 'free', tpl?: TemplateKey, fromStart?: boolean): void {
  S.activePlan = { id: nextId(), ts: hm(), role: 'bot', kind: 'plan', spec, epoch: S.buildEpoch, mode, tpl, modelRevision: S.modelRevision, ...(fromStart ? { fromStart: true as const } : {}) }
  S.draftSpec = spec
  S.draftInvalid = false
  S.task = 'model'
  S.workspaceView = 'model'
  notify()
}

/** 대기 표시 — remove() 로 제거 */
export function thinking(): { remove(): void } {
  const id = nextId()
  S.msgs.push({ id, role: 'bot', kind: 'thinking' })
  notify()
  return {
    remove() {
      const i = S.msgs.findIndex((m) => m.id === id)
      if (i >= 0) { S.msgs.splice(i, 1); notify() }
    },
  }
}

export function tab(id: PanelId): void { S.panel = id; notify() }

/** 현재(Gen 에 보낸) 모델로 3D 재플롯 — 미리보기 해제 */
export function draw3D(): void { S.preview = null; S.viewNonce++; notify() }

/** 스펙 미리보기 (아직 Gen 에 보내지 않은 형상) */
export function previewSpec(p: FactorySpec): void { S.preview = p; S.viewNonce++; notify() }

/** 메시지 본문을 현재 언어 문자열로 (테스트·스크립트용) */
export const msgText = (m: { kind: string; html?: string | LText }): string => (m.kind === 'html' && m.html !== undefined ? render(m.html) : '')
