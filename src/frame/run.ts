/* 다층 강골조 Gen 실행 단계 (호출 함수 주입 — 화면 actions/frame.ts 와 scripts/live-frame.ts 공용).
   전송: doc/new → DB PUT → ope/STOR → 읽어 개수 확인. 해석: doc/anal. 회수: 평형 → 층 표 → 고유치 → 기둥 강축 → 요소력.
   주의(docs/gen-api-cautions.md): Assign 본문 DELETE·STEELCODECHECK 금지, 결과 회수 중 모델 변경 금지. */
import { sectionArea } from '../domain/sections'
import { gravityTotals } from './loads'
import { selfWeight, type FramePayloads } from './gen'
import { fetchElementForces, n, reactionSums, rows, table, type ElementForces, type Request } from './results'
import { parseEigen, type StoryTables } from './story'
import type { FrameModel, FrameSpec } from './types'

export const GEN_OK = 'MIDAS GEN NX command complete'
/** Gen 명령은 거부도 HTTP 200 + message 로 돌려준다 → 메시지 확인 */
export function expectOk(r: any, what: string): void {
  if (r?.message !== GEN_OK) throw new Error(`${what}: ${r?.message ?? JSON.stringify(r)}`)
}

const DB_ORDER = ['UNIT', 'MATL', 'SECT', 'NODE', 'ELEM', 'CONS', 'STLD', 'BODF', 'FBLD', 'FBLA', 'BMLD', 'CNLD', 'STOR'] as const
const DB_AFTER_STOR = ['STYP', 'LTOM', 'EIGV', 'SPFC', 'SPLC', 'LCOM-GEN'] as const
/** 전송 호출 수 (진행 막대) — new + DB + ope/STOR + 읽기 5 */
export const SEND_CALLS = 1 + DB_ORDER.length + 1 + DB_AFTER_STOR.length + 5

export interface SendCounts { NODE: number; ELEM: number; CONS: number; FBLA: number; LCOM: number }

/** 새 문서에 모델·하중·질량·RS·조합 전송 후 개수 확인. 열린 문서 저장(백업)은 호출하는 쪽에서 먼저 */
export async function sendFrame(req: Request, P: FramePayloads, model: FrameModel): Promise<SendCounts> {
  expectOk(await req('POST', '/doc/new', {}), 'doc/new')
  for (const db of DB_ORDER) await req('PUT', `/db/${db}`, { Assign: (P as any)[db] })
  await req('POST', '/ope/STOR', { Argument: { SEIS_ECC: { INC_SEIS_ECC: true, SEIS_ECC_VALUE: 5 }, WIND_ECC: { INC_WIND_ECC: true, WIND_ECC_VALUE: 15 } } })
  for (const db of DB_AFTER_STOR) await req('PUT', `/db/${db}`, { Assign: (P as any)[db] })
  const count = async (db: string) => Object.keys((await req('GET', `/db/${db}`))?.[db] ?? {}).length
  const counts: SendCounts = { NODE: await count('NODE'), ELEM: await count('ELEM'), CONS: await count('CONS'), FBLA: await count('FBLA'), LCOM: await count('LCOM-GEN') }
  const want: SendCounts = { NODE: model.nodes.length, ELEM: model.elements.length, CONS: model.supports.length, FBLA: Object.keys(P.FBLA).length, LCOM: P.combos.length }
  const bad = (Object.keys(want) as (keyof SendCounts)[]).filter((k) => counts[k] !== want[k])
  if (bad.length) throw new Error(`Gen readback mismatch: ${bad.map((k) => `${k} ${counts[k]}/${want[k]}`).join(', ')}`)
  return counts
}

export async function analyze(req: Request): Promise<void> {
  expectOk(await req('POST', '/doc/anal', {}), 'doc/anal')
}

export interface Equilibrium { gen: number; app: number }
export interface FrameAnalysis {
  equilibrium: Record<'DL' | 'LL' | 'WX' | 'WY', Equilibrium>
  story: StoryTables
  /** 기둥 강축 휨이 일어나는 골조 방향 (WX 에서 Moment-y vs Moment-z 로 판별) */
  colStrongAxis: 'X' | 'Y'
  /** 표 회수 실패 (표 종류 → 메시지) — 해당 층 지표는 '확인 불가' */
  missing: Record<string, string>
}

/** 표 회수 호출 수 (진행 막대) */
export const COLLECT_CALLS = 1 + 11 + 2 + 1

/** 해석 결과 회수 (층 표·고유치·평형·강축). 표 하나가 실패해도 나머지는 계속 */
export async function collectAnalysis(req: Request, spec: FrameSpec, model: FrameModel, P: FramePayloads, log: (m: string) => void = () => {}): Promise<FrameAnalysis> {
  const reac = await reactionSums(req, ['DL(ST)', 'LL(ST)', 'WX(ST)', 'WY(ST)'])
  const g = gravityTotals(spec, model), sw = selfWeight(model, (s) => sectionArea(s, 'CN'))
  const equilibrium = {
    DL: { gen: reac.DL?.FZ ?? NaN, app: g.dlExceptSelf + sw }, LL: { gen: reac.LL?.FZ ?? NaN, app: g.ll },
    WX: { gen: -(reac.WX?.FX ?? NaN), app: P.wind[0].base }, WY: { gen: -(reac.WY?.FY ?? NaN), app: P.wind[1].base },
  }

  const story: Record<string, unknown> = {}, missing: Record<string, string> = {}
  const tryTable = async (key: string, type: string, loads?: string[], extra?: object) => {
    try { story[key] = rows(await table(req, type, { loads, extra })) } catch (e: any) { missing[key] = e?.message ?? String(e); log(`${type}: ${missing[key]}`) }
  }
  await tryTable('mass', 'STORY_MASS')
  await tryTable('shearX', 'STORY_SHEAR_FORCE_COEFFICIENT', ['RX(RS)'])
  await tryTable('shearY', 'STORY_SHEAR_FORCE_COEFFICIENT', ['RY(RS)'])
  await tryTable('driftX', 'STORY_DRIFT_X', ['RX(RS)'])
  await tryTable('driftY', 'STORY_DRIFT_Y', ['RY(RS)'])
  await tryTable('dispX', 'STORY_DISPLACEMENT_X', ['RX(RS)'])
  await tryTable('dispY', 'STORY_DISPLACEMENT_Y', ['RY(RS)'])
  const SD = { ADDITIONAL: { SET_CALCULATION_METHOD: { STORY_DRIFT_METHOD: 'Drift at the Center of Mass', STORY_STIFFNESS_METHOD: 'Story Shear / Story Drift' } } }
  await tryTable('stiffX', 'STIFFNESS_IRREGULARITY_X', ['RX(RS)'], SD)
  await tryTable('stiffY', 'STIFFNESS_IRREGULARITY_Y', ['RY(RS)'], SD)
  await tryTable('torsionX', 'TORSIONAL_IRREGULARITY_X', ['RX(RS)'])
  await tryTable('torsionY', 'TORSIONAL_IRREGULARITY_Y', ['RY(RS)'])
  /* 주기·참여질량 — EIGENVALUEMODE 는 간헐적으로 Unknown Error (gen-api-cautions.md 4) → 한 번 재시도 */
  let eigen: StoryTables['eigen'] = null
  for (let i = 0; i < 2 && !eigen; i++) {
    try { eigen = parseEigen((await req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', UNIT: { FORCE: 'KN', DIST: 'M' } } }))?.EV) }
    catch (e: any) { missing.eigen = e?.message ?? String(e); log(`EIGENVALUEMODE try ${i + 1}: ${missing.eigen}`) }
  }
  if (eigen) delete missing.eigen
  story.eigen = eigen

  const colIds = model.elements.filter((e) => e.role === 'column').map((e) => e.id)
  let my = 0, mz = 0
  for (const r of rows(await table(req, 'BEAMFORCE', { loads: ['WX(ST)'], keys: colIds }))) { my += Math.abs(n(r['Moment-y'])); mz += Math.abs(n(r['Moment-z'])) }
  return { equilibrium, story: story as unknown as StoryTables, colStrongAxis: my >= mz ? 'X' : 'Y', missing }
}

/** 조합별 요소력 (설계 검토 입력) */
export function collectForces(req: Request, model: FrameModel, P: FramePayloads, onProgress?: (done: number, total: number) => void): Promise<ElementForces> {
  return fetchElementForces(req, model.elements.map((e) => e.id), P.combos.map((c) => c.name), onProgress)
}

/** 평형 오차 (상대) — 0.1 % 넘으면 하중 전송 이상 */
export const equilibriumError = (e: Equilibrium) => Math.abs(e.gen - e.app) / Math.max(1e-9, Math.abs(e.app))
