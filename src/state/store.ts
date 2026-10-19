/* ════════════════════════════════════════════════════════════
   STATE — story 프로젝트와 같은 mutable store.
   액션은 S 를 직접 변경한 뒤 notify() — React 는 useStore() 로 구독(version 기반 재렌더).
   MAPI-Key 는 메모리에만(저장 금지). 언어는 i18n 모듈이 따로 관리(useLang).
════════════════════════════════════════════════════════════ */
import { useSyncExternalStore } from 'react'
import { getLang, type Lang, type LText } from '../i18n'
import { CODE_IDS, type CodeId } from '../codes'
import type { Results } from '../actions/results'
import type { ConnResult } from '../domain/connections'
import type { DesignResult } from '../domain/design'
import type { LoadInfo } from '../domain/loads'
import type { OptSummary } from '../domain/optimize'
import type { RepairPlan, RepairComparison } from '../domain/remediation'
import type { TemplateKey } from '../domain/templates'
import type { BuildMode } from '../agent/parse'
import { DEFAULT_SPEC, type ElementRole, type FactoryModel, type FactorySpec } from '../domain/types'

export const THEMES = ['navy', 'light', 'cyber'] as const
export type Theme = (typeof THEMES)[number]
export type PanelId = 'logP' | 'modelP' | 'viewP' | 'resP'
export type LogType = 'api' | 'ok' | 'err' | 'info' | 'warn'
export type TaskId = 'model' | 'analysis' | 'design' | 'optimize' | 'outputs' | 'history'
export interface Activity {
  id: number; at: number; source: 'job' | 'notice' | 'artifact'; level: 'info' | 'warn' | 'error'
  html?: string | LText; kind?: JobKind; parent?: number; acknowledged?: boolean
  status?: 'running' | 'done' | 'failed' | 'cancelled'; elapsed?: number
  name?: string; revision?: number; resultRevision?: number; code?: CodeId
}
export type CamId = 'iso' | 'front' | 'side' | 'top'
/** 3D 표시 토글 — 주골조(기둥·지붕보)·2차부재(퍼린·거트·스트럿·풍주)·가새·지점 */
export type Vis3D = Record<ElementRole | 'support' | 'node', boolean>

export interface LogEntry { id: number; ts: string; type: LogType; html: string }

/** 채팅 메시지 — html(일반) / plan(공장 스펙 편집 카드) / thinking(대기 표시). ts = 표시용 시각(HH:MM) */
export type ChatMsg = { ts?: string } & (
  | { id: number; role: 'user' | 'bot'; kind: 'html'; html: string | LText }
  | { id: number; role: 'bot'; kind: 'thinking' }
  | { id: number; role: 'bot'; kind: 'plan'; spec: FactorySpec; epoch: number; mode: BuildMode; tpl?: TemplateKey; modelRevision?: number; fromStart?: true }
)

/** Gen 에 보낸 모델 — 스펙·형상·하중 요약 */
/** sent = Gen 에 보낸 페이로드(DB → Assign) — 해석·검토 직전 Gen 동일성 비교(actions/genSync) */
export interface Built { spec: FactorySpec; model: FactoryModel; info: LoadInfo; cases: string[]; combos: number; comboNames: string[]; sent?: Record<string, Record<string, unknown>> }

/** 진행 중 작업 — stage = 문구 키, step/total = 이 단계 MAPI 호출 수, iter = 최적화 반복 [n, 최대] */
export type JobKind = 'build' | 'anal' | 'design' | 'opt' | 'pdf' | 'docx' | 'dwgpdf' | 'restore'
/** 파일 생성 작업 — Gen·결과를 바꾸지 않음 (결과 개정 유지, 취소 안내 문구 공통) */
export const FILE_JOBS: ReadonlySet<JobKind> = new Set<JobKind>(['pdf', 'docx', 'dwgpdf'])
export interface Job { kind: JobKind; stage: string; step: number; total: number; detail: string; t0: number; cancel: boolean; iter?: [number, number]; activityId?: number }

/** 반력 합계 (하중 케이스별) */
export interface ReactionSum { lc: string; fx: number; fy: number; fz: number }

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('sms_theme')
    if ((THEMES as readonly string[]).includes(t ?? '')) return t as Theme
  } catch { /* storage 차단 */ }
  return 'light'
}

/** 설계기준·화면 언어 — 서로 독립인데 **간체만 예외** (사용자 결정 2026-10-16):
    간체에서 새 작업은 CN 만. 작업 중(입력 카드·생성 모델)에 간체로 바꾸면 기존 기준(TW 포함) 유지.
    그 밖의 언어는 사용자가 고른 기준을 유지 — 새로고침·언어 전환에도 (sms_code, 간체에서의 강제 CN 은 저장 안 함).
    한국어(ko)는 고른 기준이 없으면 KR 로 시작 (사용자 결정 2026-10-16, 강제 아님 — 드롭다운에서 TW·CN 선택 가능). */
export function codeForLang(lang: Lang, current: CodeId, saved: CodeId | null, hasWork: boolean): CodeId {
  if (hasWork) return current
  /* 새 작업의 기준은 언어 우선(사용자 결정 2026-10-16): 번체 TW · 간체 CN · 한국어 KR. 영어만 고른 기준 유지 */
  const byLang: Partial<Record<Lang, CodeId>> = { 'zh-TW': 'TW', 'zh-CN': 'CN', ko: 'KR' }
  return byLang[lang] ?? saved ?? current
}
export function savedCode(): CodeId | null {
  try { const c = localStorage.getItem('sms_code'); return (CODE_IDS as string[]).includes(c ?? '') ? c as CodeId : null } catch { return null }
}
export function saveCode(c: CodeId): void {
  try { localStorage.setItem('sms_code', c) } catch { /* storage 차단 — 이번 세션만 */ }
}
function readCode(): CodeId {
  return codeForLang(getLang(), 'TW', savedCode(), false)
}

/** 작업 상태 초기값 — 앱 시작과 [작업 초기화]가 같이 쓴다. 새 작업 상태는 여기에 추가한다
   (연결·화면 설정·Gen 백업 경로·개정 번호는 작업 상태가 아니라 S 에 직접 둔다) */
export function freshWorkState() {
  return {
    lastFail: null as { kind: JobKind; cancelled: boolean; msg?: string; repair?: boolean } | null,
    genChanged: 0,
    panel: 'logP' as PanelId,
    ratioView: false,
    log: [] as LogEntry[],
    msgs: [] as ChatMsg[],
    activePlan: null as Extract<ChatMsg, { kind: 'plan' }> | null,
    draftSpec: null as FactorySpec | null,
    workspaceView: 'start' as 'start' | 'model',
    task: 'model' as TaskId,
    draftInvalid: false,
    activity: [] as Activity[],
    preview: null as FactorySpec | null,
    built: null as Built | null,
    analyzed: false,
    reactions: null as ReactionSum[] | null,
    results: null as Results | null,
    design: null as DesignResult | null,
    connections: null as ConnResult[] | null,
    opt: null as OptSummary | null,
    repairPlan: null as RepairPlan | null,
    repairComparison: null as RepairComparison | null,
  }
}

/** MIDAS API 서버 — 간체 중국어는 중국 서버(.cn), 그 밖 언어는 .com (사용자 결정 2026-10-19) */
export const BASE_URLS = { com: 'https://moa-engineers.midasit.com:443/gen', cn: 'https://moa-engineers.midasit.cn:443/gen' } as const
export const defaultBaseUrl = (lang: Lang): string => lang === 'zh-CN' ? BASE_URLS.cn : BASE_URLS.com
/** 드롭다운 순서 — 언어 기본 서버가 먼저 (간체 .cn → .com, 그 외 .com → .cn) */
export const baseUrlOptions = (lang: Lang): string[] => lang === 'zh-CN' ? [BASE_URLS.cn, BASE_URLS.com] : [BASE_URLS.com, BASE_URLS.cn]
/** 언어를 바꿀 때 — 주소가 기본값 그대로이고 연결·작업 중이 아니면 새 언어의 기본 서버로. 직접 고친 주소·연결된 세션은 유지 */
export function syncBaseUrl(lang: Lang): void {
  const cur = S.baseUrl.trim().replace(/\/$/, '')
  if (S.connected || S.busy || !(Object.values(BASE_URLS) as string[]).includes(cur)) return
  const next = defaultBaseUrl(lang)
  if (cur !== next) { S.baseUrl = next; notify() }
}

export const S = {
  ...freshWorkState(),
  /* MIDAS API — MAPI-Key 는 메모리에만(저장 금지) */
  baseUrl: defaultBaseUrl(getLang()),
  mapiKey: '',
  /** 자동 저장 폴더 (Gen NX 실행 PC 기준) — 확인 창 방지용 */
  saveDir: 'C:/temp',
  connected: false,
  connErr: false,
  program: '',
  apiUser: '',
  busy: false,
  /** 진행 중 작업 (진행 표시·취소) — busy 와 함께 beginJob/endJob 이 관리 */
  job: null as Job | null,
  /** 마지막 작업 실패·취소 (작업 흐름 띠의 다시 시도) — beginJob 이 비움 */
  /** Gen 모델 변경 감지 건수 (0 = 같음) — assertGenSync 가 갱신, sendModel 이 비움 */
  /** 확인 창 요청 (ConfirmDialog) */
  confirm: null as (import('../components/ConfirmDialog').ConfirmReq & { resolve(ok: boolean): void }) | null,
  /** 마지막 [공장 생성] 직전 Gen 문서 백업 (Gen PC 경로) — [이전 모델로 복원] 대상 */
  restorePoint: null as string | null,
  theme: readTheme(),
  code: readCode(),
  cam: 'iso' as CamId,
  /** 증가하면 3D 카메라를 현재 시점의 전체 보기로 다시 맞춘다 (사용자가 돌린 시점 무시) — 모델 생성 직후 */
  camReset: 0,
  vis3d: { column: true, rafter: true, purlin: true, girt: true, strut: true, post: true, brace: true, support: true, node: false } as Vis3D,
  /** 3D 표시 방식 — 선 / 단면 형상(실제 치수 입체) */
  render3d: 'line' as 'line' | 'solid',
  /** 3D 를 강도비 색상으로 표시 */
  /** One current modeling editor. Hidden on the start screen, kept mounted to retain raw inputs and step. */
  modelRevision: 0,
  resultRevision: 0,
  /** 실행되면 증가 — 이전 계획 카드의 버튼을 모두 잠근다 */
  buildEpoch: 0,
  /** 편집 중인 스펙 미리보기 (아직 Gen 에 보내지 않은 형상) */
  viewNonce: 0,
  /** 해석 결과 원자료 (설계 검토 입력) */
  /** 릴리즈 노트 창 열림 */
  rnOpen: false,
  /** 단면 자동 최적화 결과 */
  /** 마지막으로 쓴 스펙 — 새 계획 카드의 출발점 */
  lastSpec: DEFAULT_SPEC as FactorySpec,
}
export type AppState = typeof S

let version = 0
let idSeq = 0
const listeners = new Set<() => void>()

export function nextId(): number { return ++idSeq }

export function notify(): void {
  version++
  listeners.forEach((f) => f())
}

/** 컴포넌트 구독 — version 이 바뀔 때마다 재렌더하고 S 를 그대로 돌려준다 */
export function useStore(): AppState {
  useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, () => version)
  return S
}
