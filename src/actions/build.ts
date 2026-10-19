/* 스펙 → MIDAS Gen 전송 (새 문서에서 시작).
   순서: 자동저장 → doc/new → 단위 → 재료 → 단면 → 절점 → 요소 → 단부해제 → 지지조건 → 하중케이스 → 자중 → 보하중 → 절점하중 → 하중조합 → 설계 코드
   → 개수 확인(GET, 보낸 개수와 다르면 실패). */
import { profileOf } from '../codes'
import { buildGenPayloads } from '../domain/gen'
import { buildLoadPayloads } from '../domain/loads'
import { buildPortal } from '../domain/portal'
import type { FactorySpec } from '../domain/types'
import { checkScope } from '../domain/scope'
import { dbDifferences, diffText, isRecord } from '../domain/genSync'
import { sectionSourceDifferences } from '../domain/genSectionSync'
import { scopeMsg } from '../components/ScopeBox'
import { t, lt } from '../i18n'
import { mapi } from '../mapi/client'
import { autoSave, autoSavePath } from './save'
import { confirmAction } from '../components/ConfirmDialog'
import { beginJob, Cancelled, endJob, failMsg, stage } from './job'
import { S, notify } from '../state/store'
import { addMsg, draw3D, escapeHtml, log, tab } from '../state/ui'

export async function buildFactory(spec: FactorySpec): Promise<void> {
  if (S.busy) { addMsg('bot', lt('busy')); return }
  if (!S.mapiKey.trim()) { addMsg('bot', lt('need_key')); return }
  const scope = checkScope(spec)
  if (scope.blocked) { addMsg('bot', `${t('sc_blocked')}<br>${scope.issues.filter((i) => i.level === 'block').map((i) => `⛔ ${scopeMsg(i)}`).join('<br>')}`); return }
  /* Gen 문서 교체 확인 (AlertDialog) — 열린 문서는 자동 백업, 생성 후 [이전 모델로 복원] 가능 */
  if (!await confirmAction({ title: t('cfm_build_title'), body: t('cfm_build_body', escapeHtml(S.saveDir || 'C:/temp')), ok: t('cfm_build_ok'), skipKey: 'build' })) return
  if (!beginJob('build')) return
  S.buildEpoch++ // 이전 카드 버튼 잠금
  notify()
  addMsg('bot', lt('build_start'))
  tab('logP')
  try {
    /* 복원 지점은 doc/new 가 사용자 문서를 지운 순간 기록 — 이후 전송 실패·취소에도 실패 카드에서 복원 가능 */
    const model = await sendModel(spec, (backup) => { S.restorePoint = backup; notify() })
    const b = S.built!
    addMsg('bot', lt('build_done', model.nodes.length, model.elements.length, b.cases.length, b.combos))
    S.task = 'analysis'
    /* 생성 직후 3D 탭에서 ISO 전체 보기 — 미리보기에서 돌리거나 다른 시점이었어도 다시 맞춘다 (Gen 화면도 위에서 ISO) */
    S.cam = 'iso'; S.camReset++
    draw3D()
    tab('viewP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('build_fail', m)))
  } finally {
    endJob()
  }
}

/** [이전 모델로 복원] — 마지막 [공장 생성] 직전 백업을 Gen 에서 다시 연다 (현재 문서는 sms_model_* 로 먼저 저장). 앱의 모델·결과는 비운다 */
export async function restoreBackup(): Promise<void> {
  const path = S.restorePoint
  if (!path || S.busy) return
  if (!await confirmAction({ title: t('cfm_restore_title'), body: t('cfm_restore_body', escapeHtml(path)), ok: t('cfm_restore_ok'), danger: true })) return
  if (!beginJob('restore')) return
  try {
    stage('st_restore', 2)
    await autoSave('model')
    const res = await mapi<{ message?: string }>('POST', '/doc/open', { Argument: path }, path)
    if (res?.message !== 'MIDAS GEN NX command complete') throw new Error(String(res?.message ?? t('gen_bad_response')))
    clearBuilt()
    S.restorePoint = null
    S.buildEpoch++
    draw3D()
    addMsg('bot', lt('restore_done', escapeHtml(path)))
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('restore_fail', m)))
  } finally {
    endJob()
  }
}

/** 전송 본체 (busy·메시지 없음) — 단면 최적화 반복에서도 사용. 성공하면 S.built 갱신, 이전 결과 초기화.
    onReplaced: doc/new 직후 백업 경로 — [공장 생성]만 복원 지점으로 쓴다(최적화 반복의 백업은 앱이 만든 모델) */
export async function sendModel(spec: FactorySpec, onReplaced?: (backup: string) => void) {
  const model = buildPortal(spec)
  const p = buildGenPayloads(spec, model)
  const l = buildLoadPayloads(spec, model)
  const steps: [string, Record<string, unknown>][] = [
    ['UNIT', p.UNIT], ['MATL', p.MATL], ['SECT', p.SECT], ['NODE', p.NODE], ['ELEM', p.ELEM], ['FRLS', p.FRLS], ['CONS', p.CONS],
    ['STLD', l.STLD], ['BODF', l.BODF], ['BMLD', l.BMLD], ['CNLD', l.CNLD], ['LCOM-GEN', l['LCOM-GEN']],
  ]
  const designCode = profileOf(spec.code).gen.designCode
  stage('st_send', 2 + steps.length + (designCode ? 1 : 0))
  /* 열린 문서를 먼저 임시 저장 → doc/new 가 "저장할까요?" 창을 띄우지 않게 (사용자 원본 파일은 건드리지 않음) */
  const backup = await autoSave('backup')
  /* 전체 문서를 doc/new 로 초기화 — 항목별 DELETE 의 경고·잔여 데이터 방지 (story 와 같은 방식) */
  await mapi('POST', '/doc/new', {})
  onReplaced?.(backup)
  /* 여기부터 Gen 문서는 이전 모델이 아니다 — 중간 실패·취소 때 이전 결과로 해석·검토하지 않게 먼저 비운다 */
  clearBuilt()
  for (const [name, assign] of steps) await mapi('PUT', name, { Assign: assign }, String(Object.keys(assign).length))
  if (designCode) await mapi('PUT', 'DSTL', { Assign: { 1: { DGNCODE: designCode } } })
  await verifyCounts(Object.fromEntries(steps))
  const sectionTable = await mapi<any>('POST', '/post/TABLE', { Argument: {
    TABLE_NAME: 'SectionSource', TABLE_TYPE: 'SECTIONALL', UNIT: { FORCE:'KN', DIST:'MM', HEAT:'KJ', TEMP:'C' },
  } }, 'Gen section source')
  const sourceDifferences = sectionSourceDifferences(spec.code, p.SECT, sectionTable?.SectionSource)
  if (sourceDifferences.length) throw new Error(t('section_source_mismatch', sourceDifferences.slice(0,4).join(', ')))
  /* Gen 화면을 ISO 전체 보기로 (story 와 같은 각도, H 30·V 15). view/ANGLE 은 각도만 바꾸고 확대는 그대로라
     doc/new 직후 원점 근처가 크게 확대된 채 남는다. 맞춤(fit) 전용 API 는 없고, view/CAPTURE 의 ZOOM_LEVEL 100(Zoom Fit)이
     캡처 뒤에도 화면에 남는다 — 라이브 2026-10-19 확인 (view/ACTIVE All·doc/open 재열기는 효과 없음). 작은 PNG 하나가 저장 폴더에 남는다.
     화면 조작이라 실패해도 모델 생성은 성공으로 둔다 (취소는 그대로 전달) */
  try {
    await mapi('POST', '/view/ANGLE', { Argument: { HORIZONTAL: 30, VERTICAL: 15 } }, 'ISO')
    await mapi('POST', '/view/CAPTURE', { Argument: { EXPORT_PATH: autoSavePath('view').replace(/\.mgbx$/, '.png'), WIDTH: 400, HEIGHT: 300, ZOOM_LEVEL: 100 } }, 'zoom fit')
  } catch (e) { if (e instanceof Cancelled) throw e }

  const cases = Object.values(l.STLD).map((c) => (c as { NAME: string }).NAME)
  const comboNames = Object.values(l['LCOM-GEN']).map((c) => (c as { NAME: string }).NAME)
  const combos = comboNames.length
  const sent: Record<string, Record<string, unknown>> = Object.fromEntries(steps)
  if (designCode) sent.DSTL = { 1: { DGNCODE: designCode } }
  S.built = { spec, model, info: l.info, cases, combos, comboNames, sent }
  S.lastSpec = spec
  S.draftSpec = spec
  S.draftInvalid = false
  S.modelRevision++
  log(t('log_built'), 'ok')
  return model
}

function clearBuilt(): void {
  S.built = null
  S.genChanged = 0
  S.analyzed = false
  S.reactions = null
  S.results = null
  S.design = null
  S.connections = null
  S.opt = null
  S.repairPlan = null
  S.repairComparison = null
  notify()
}

/* 응답 형식을 모르면 실패. 개수·대상 ID 와 보낸 필드 값 전부를 Gen 동일성 검사(domain/genSync)와 같은 규칙으로 비교 —
   하중은 항목 ID·케이스·방향·위치·값까지. Gen 이 붙이는 기본 필드·배열 순서 변경·ELEM NODE 0 채움은 허용. */
const VERIFY = ['MATL', 'SECT', 'NODE', 'ELEM', 'FRLS', 'CONS', 'STLD', 'LCOM-GEN', 'BODF', 'BMLD', 'CNLD'] as const

async function verifyCounts(sent: Record<string, Record<string, unknown>>): Promise<void> {
  stage('st_verify', VERIFY.length + 1) // DB readback plus the Gen property source table.
  const bad: string[] = []
  for (const name of VERIFY) {
    const want = Object.keys(sent[name] ?? {}).length
    const r = await mapi<Record<string, unknown>>('GET', name, undefined, String(want))
    const got = r?.[name]
    if (!isRecord(got)) throw new Error(t('verify_fail', `${name}: ${t('gen_bad_response')}`))
    for (const d of dbDifferences(name, sent[name] ?? {}, got, 3)) bad.push(diffText(d))
  }
  if (bad.length) throw new Error(t('verify_fail', bad.join(', ')))
  log(t('log_verify_ok', VERIFY.length), 'ok')
}
