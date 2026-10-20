/* 다층 강골조 Gen 실행 단계 (호출 함수 주입 — 화면 actions/frame.ts 와 scripts/live-frame.ts 공용).
   전송: doc/new → DB PUT → ope/STOR → 읽어 개수 확인. 해석: doc/anal. 회수: 평형 → 층 표 → 고유치 → 기둥 강축 → 요소력.
   주의(docs/gen-api-cautions.md): Assign 본문 DELETE·STEELCODECHECK 금지, 결과 회수 중 모델 변경 금지. */
import { sectionArea } from '../domain/sections'
import { gravityTotals } from './loads'
import { framePayloads, selfWeight, type FramePayloads } from './gen'
import { buildFrame } from './geometry'
import { designMembers, runFrameDesign, type FrameDesign } from './design'
import { fetchElementForces, n, reactionSums, rows, table, type ElementForces, type Request } from './results'
import { parseEigen, storyReview, type StoryItem, type StoryTables } from './story'
import { CAPTURE_SIZE, captureFile, type CaptureShot } from './captures'
import type { FrameModel, FrameSpec } from './types'

export const GEN_OK = 'MIDAS GEN NX command complete'
/** Gen 명령은 거부도 HTTP 200 + message 로 돌려준다 → 메시지 확인 */
export function expectOk(r: any, what: string): void {
  if (r?.message !== GEN_OK) throw new Error(`${what}: ${r?.message ?? JSON.stringify(r)}`)
}

const DB_ORDER = ['UNIT', 'MATL', 'SECT', 'NODE', 'ELEM', 'CONS', 'STLD', 'BODF', 'FBLD', 'FBLA', 'BMLD', 'CNLD', 'STOR'] as const
const DB_AFTER_STOR = ['STYP', 'LTOM', 'EIGV', 'SPFC', 'SPLC', 'LCOM-GEN'] as const
/** EIGENVALUEMODE 매뉴얼 예제의 COMPONENTS (midas-nx 2.10.2 기본값과 같음) */
const EIGEN_COMPONENTS = ['Node', 'Mode', 'UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']
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

/** Gen 화면을 ISO 전체 보기로 (Steel 앱 build.ts 와 같은 방법). view/ANGLE 은 각도만 바꾸고 확대는 그대로라 doc/new 직후 원점 근처가
    크게 확대된 채 남는다. 맞춤 전용 API 는 없고 view/CAPTURE 의 ZOOM_LEVEL 100(Zoom Fit)이 캡처 뒤에도 화면에 남는다(라이브 2026-10-19,
    Steel 앱). 작은 PNG 하나가 저장 폴더에 남는다. 화면 조작이라 실패해도 모델 생성은 성공으로 둔다 — 취소 플래그는 다음 호출에서 다시 걸린다 */
export const VIEW_CALLS = 2
export async function fitView(req: Request, pngPath: string): Promise<boolean> {
  try {
    await req('POST', '/view/ANGLE', { Argument: { HORIZONTAL: 30, VERTICAL: 15 } })
    await req('POST', '/view/CAPTURE', { Argument: { EXPORT_PATH: pngPath, WIDTH: 400, HEIGHT: 300, ZOOM_LEVEL: 100 } })
    return true
  } catch { return false }
}

export interface Equilibrium { gen: number; app: number }
export interface FrameAnalysis {
  /** 케이스 → Gen 반력 합 vs 앱 하중 합 (DL·LL·WX·WY, 적설 시 SL·LF) */
  equilibrium: Record<string, Equilibrium>
  story: StoryTables
  /** 기둥 강축 휨이 일어나는 골조 방향 (WX 에서 Moment-y vs Moment-z 로 판별) */
  colStrongAxis: 'X' | 'Y'
  /** 표 회수 실패 (표 종류 → 메시지) — 해당 층 지표는 '확인 불가' */
  missing: Record<string, string>
}

/** 표 회수 호출 수 (진행 막대) */
export const COLLECT_CALLS = 1 + 13 + 2 + 1

/** 해석 결과 회수 (층 표·고유치·평형·강축). 표 하나가 실패해도 나머지는 계속 */
export async function collectAnalysis(req: Request, spec: FrameSpec, model: FrameModel, P: FramePayloads, log: (m: string) => void = () => {}): Promise<FrameAnalysis> {
  const g = gravityTotals(spec, model), sw = selfWeight(model, (s) => sectionArea(s, 'CN'))
  const snow = g.snow > 0
  const reac = await reactionSums(req, ['DL(ST)', 'LL(ST)', 'WX(ST)', 'WY(ST)', ...(snow ? ['SL(ST)', 'LF(ST)'] : [])])
  const equilibrium: FrameAnalysis['equilibrium'] = {
    DL: { gen: reac.DL?.FZ ?? NaN, app: g.dlExceptSelf + sw }, LL: { gen: reac.LL?.FZ ?? NaN, app: g.ll },
    WX: { gen: -(reac.WX?.FX ?? NaN), app: P.wind[0].base }, WY: { gen: -(reac.WY?.FY ?? NaN), app: P.wind[1].base },
    ...(snow ? { SL: { gen: reac.SL?.FZ ?? NaN, app: g.snow }, LF: { gen: reac.LF?.FZ ?? NaN, app: g.lf } } : {}),
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
  /* 倾覆弯矩 — 머리글에 같은 이름(각도별 Frame/Wall)이 반복되어 원본 표 그대로 둔다 (story.ts overturning) */
  for (const [key, lc] of [['otmX', 'RX(RS)'], ['otmY', 'RY(RS)']] as const) {
    try { story[key] = await table(req, 'OVERTURNING_MOMENT', { loads: [lc] }) } catch (e: any) { missing[key] = e?.message ?? String(e); log(`OVERTURNING_MOMENT ${lc}: ${missing[key]}`) }
  }
  /* 주기·참여질량 — EIGENVALUEMODE 는 COMPONENTS 가 없으면 Unknown Error (gen-api-cautions.md 4, midas-nx 2.10.2) → 매뉴얼 목록을 넣고 한 번 재시도 */
  let eigen: StoryTables['eigen'] = null
  for (let i = 0; i < 2 && !eigen; i++) {
    try { eigen = parseEigen((await req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', UNIT: { FORCE: 'KN', DIST: 'M' }, COMPONENTS: EIGEN_COMPONENTS } }))?.EV) }
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

export interface FrameRound { spec: FrameSpec; model: FrameModel; P: FramePayloads; counts: SendCounts; analysis: FrameAnalysis; forces: ElementForces; review: StoryItem[]; design: FrameDesign }

/** 최적화 한 회 — 화면(actions/frame.ts)과 scripts/live-frame.ts --opt 공용. save = 전송 뒤 문서 저장(해석 확인 창 방지), stage = 진행 표시 */
export async function runRound(req: Request, spec: FrameSpec, o: { save(): Promise<void>; viewPath?: string; stage?(key: 'st_send' | 'st_anal' | 'st_results' | 'st_check', calls: number): void; log?(m: string): void; onSent?(model: FrameModel, P: FramePayloads, counts: SendCounts): void }): Promise<FrameRound> {
  const model = buildFrame(spec), P = framePayloads(spec, model)
  o.stage?.('st_send', SEND_CALLS + (o.viewPath ? VIEW_CALLS : 0))
  const counts = await sendFrame(req, P, model)
  if (o.viewPath) await fitView(req, o.viewPath)
  o.onSent?.(model, P, counts)
  o.stage?.('st_anal', 2)
  await o.save()
  await analyze(req)
  o.stage?.('st_results', COLLECT_CALLS)
  const analysis = await collectAnalysis(req, spec, model, P, o.log)
  o.stage?.('st_results', P.combos.length)
  const forces = await collectForces(req, model, P)
  o.stage?.('st_check', 0)
  const review = storyReview(spec, model, analysis.story, analysis.colStrongAxis)
  const design = runFrameDesign(spec, designMembers(spec, model, analysis.colStrongAxis), forces, P.combos.map((c) => ({ name: c.name, seismic: c.seismic })))
  return { spec, model, P, counts, analysis, forces, review, design }
}

/** 상세 계산서 캡처 — 결과 그래픽 전환 → CAPTURE (dir 는 Gen PC 경로). 한 장 실패는 기록만 하고 계속, fatal(e) 이면 바로 던짐(취소).
    끝나면 ISO 전체·전처리 모드로 되돌린다. 반환: 장별 파일명·성공 여부 */
export async function captureGen(req: Request, shots: CaptureShot[], dir: string, stamp: string,
  o: { fatal?(e: unknown): boolean; onShot?(i: number, n: number, key: string): void } = {}): Promise<{ key: string; file: string; ok: boolean; error?: string }[]> {
  const out: { key: string; file: string; ok: boolean; error?: string }[] = []
  for (const [i, s] of shots.entries()) {
    o.onShot?.(i, shots.length, s.key)
    const file = captureFile(stamp, s.key)
    try {
      if (s.resultGraphic) await req('POST', '/view/RESULTGRAPHIC', { Argument: s.resultGraphic })
      expectOk(await req('POST', '/view/CAPTURE', { Argument: { EXPORT_PATH: `${dir}/${file}`, ...CAPTURE_SIZE, ZOOM_LEVEL: 100, ...s.capture, ...(s.resultGraphic ? { RESULT_GRAPHIC: s.resultGraphic } : {}) } }), `capture ${s.key}`)
      out.push({ key: s.key, file, ok: true })
    } catch (e) {
      if (o.fatal?.(e)) throw e
      out.push({ key: s.key, file, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  await fitView(req, `${dir}/${captureFile(stamp, 'end')}`)
  return out
}
