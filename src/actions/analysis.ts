/* 해석 실행 · 결과 회수 */
import { t, lt } from '../i18n'
import { mapi } from '../mapi/client'
import { S, notify, type ReactionSum } from '../state/store'
import { addMsg, log, tab } from '../state/ui'
import { autoSave } from './save'
import { beginJob, Cancelled, endJob, failMsg, stage } from './job'
import { assertGenSync } from './genSync'

/* doc/anal 은 거부 시 HTTP 200 + message 로 회신(에러 필드 아님) → 메시지 직접 점검 */
const NOT_ALLOWED = /not allowed|not permitted|허용되지|許可/i

export async function runAnalysis(): Promise<void> {
  if (S.busy) { addMsg('bot', lt('busy')); return }
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  if (!beginJob('anal')) return
  addMsg('bot', lt('anal_start'))
  try {
    await assertGenSync() // Gen 에서 모델을 바꿨으면 해석하지 않음 (앱 정보와 다른 모델)
    await analyzeCore()
    await showReactionsInGen()
    addMsg('bot', lt('anal_done'))
    tab('resP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('anal_fail', m)))
  } finally {
    endJob()
  }
}

/** 해석 본체 (busy·메시지 없음) — 단면 최적화 반복에서도 사용 */
export async function analyzeCore(): Promise<void> {
  stage('st_anal', 3)
  await autoSave('model') // doc/new 직후 무제 문서는 해석이 거부되고 확인 창이 뜬다 → 먼저 저장
  /* 저장이 성공한 뒤에 이전 결과를 비운다 — 저장 실패(폴더 없음 등)로 해석을 못 했는데 결과만 사라지지 않게 */
  S.analyzed = false
  S.results = null; S.design = null; S.connections = null; S.opt = null; S.reactions = null; S.ratioView = false
  S.repairPlan = null; S.repairComparison = null
  notify()
  const res = await mapi<{ message?: string }>('POST', '/doc/anal', {})
  if (NOT_ALLOWED.test(String(res?.message ?? ''))) throw new Error(String(res?.message))
  S.analyzed = true
  log(t('log_anal'), 'ok')
  await fetchReactions()
}

/** Gen 을 후처리 모드로 — 첫 기본 하중조합의 연직 반력(FZ)을 값과 함께 표시 (view/RESULTGRAPHIC, 라이브 2026-10-19 확인).
    화면 조작이라 실패해도 해석·결과는 그대로 둔다 (취소는 그대로 전달) */
export async function showReactionsInGen(): Promise<void> {
  const b = S.built
  if (!b || !S.analyzed) return
  const combo = b.comboNames.find((c) => (b.info.comboKind?.[c] ?? 'basic') === 'basic') ?? b.comboNames[0]
  if (!combo) return
  try {
    await mapi('POST', '/view/RESULTGRAPHIC', { Argument: {
      CURRENT_MODE: 'reactionforces/moments', LOAD_CASE_COMB: { TYPE: 'CB', NAME: combo },
      COMPONENTS: { COMP: 'FZ' }, TYPE_OF_DISPLAY: { VALUES: { OPT_CHECK: true, DECIMAL_PT: 1 } },
    } }, `reactions · ${combo}`)
  } catch (e) { if (e instanceof Cancelled) throw e }
}

/** 하중 케이스별 반력 합계 — post/table REACTIONG 의 'SUMMATION OF REACTION FORCES PRINTOUT' */
export async function fetchReactions(): Promise<void> {
  if (!S.built) return
  const base = S.built.model.nodes.find((n) => n.z === 0)
  const r = await mapi<any>('POST', '/post/TABLE', {
    Argument: {
      TABLE_NAME: 'Reaction', TABLE_TYPE: 'REACTIONG',
      UNIT: { FORCE: 'kN', DIST: 'm' }, STYLES: { FORMAT: 'Fixed', PLACE: 3 },
      COMPONENTS: ['Node', 'Load', 'FX', 'FY', 'FZ'],
      NODE_ELEMS: { KEYS: base ? [base.id] : [] },
      LOAD_CASE_NAMES: S.built.cases.map((c) => `${c}(ST)`),
    },
  }, 'Reaction')
  const sub = r?.Reaction?.SUB_TABLES?.[0]?.['SUMMATION OF REACTION FORCES PRINTOUT']?.DATA as string[][] | undefined
  S.reactions = (sub ?? []).map(([lc, fx, fy, fz]): ReactionSum => ({ lc, fx: +fx, fy: +fy, fz: +fz }))
  notify()
}
