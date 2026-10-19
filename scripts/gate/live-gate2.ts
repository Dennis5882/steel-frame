/* 단계 0 게이트 후속 — live-gate.ts 가 남긴 열린 시험 모델에서 실패·미확인 항목을 다시 확인한다.
   Run: npx tsx scripts/gate/live-gate2.ts < /dev/null */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 5 * 60 * 1000 })
const req = (m: 'GET' | 'PUT' | 'POST' | 'DELETE', p: string, b?: unknown) => client.request(m, p, b as any) as Promise<any>
const errMsg = (e: any) => e?.responseBody?.error?.message ?? e?.responseBody?.message ?? JSON.stringify(e?.responseBody ?? '') ?? e?.message
async function tryIt(name: string, fn: () => Promise<any>, show: (r: any) => unknown = (r) => r) {
  try { const r = await fn(); console.log(`OK   ${name}`, JSON.stringify(show(r))?.slice(0, 700)); return r } catch (e: any) { console.log(`FAIL ${name}`, String(errMsg(e) || e?.message).slice(0, 400)); return undefined }
}
const steel = (std: string, db: string, code = '') => ({ Assign: { 9: { TYPE: 'STEEL', NAME: 'T9', DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 1, STANDARD: std, CODE: code, DB: db, bELAST: false }] } } })

/* 1. Q355 — 재료 DB 목록 조회 시도 후 후보 PUT (시험 번호 9, 확인 후 DELETE) */
await tryIt('ope/MATL GET', () => req('GET', '/ope/MATL'))
for (const arg of [{ TYPE: 'STEEL' }, { STANDARD: 'GB50017-17(S)' }, { TYPE: 'STEEL', STANDARD: 'GB50017-17(S)' }])
  await tryIt(`ope/MATL ${JSON.stringify(arg)}`, () => req('POST', '/ope/MATL', { Argument: arg }))
for (const [std, db, code] of [['GB50017-17(S)', 'Q355'], ['GB50017-17(S)', 'Q355B'], ['GB50017-17(S)', 'Q355', 'GB50017-17'], ['GB50017-17(S)', 'Q345'], ['GB50017-17(S)', 'Q235'], ['GB19(S)', 'Q355'], ['GB12(S)', 'Q345']] as const) {
  const ok = await tryIt(`MATL ${std} / ${db}${code ? ' / ' + code : ''}`, () => req('PUT', '/db/MATL', steel(std, db, code)), (r) => r?.MATL?.[9]?.PARAM?.[0])
  if (ok) await tryIt('  readback T9', () => req('GET', '/db/MATL/9'), (r) => r)
}
await tryIt('DELETE MATL 9', () => req('DELETE', '/db/MATL', { Assign: { 9: {} } }), () => 'deleted')

/* 5. 고유치 표 — 인자 변형 */
for (const arg of [{ TABLE_TYPE: 'EIGENVALUEMODE' }, { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', UNIT: { FORCE: 'KN', DIST: 'M' } }, { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', COMPONENTS: [] }])
  await tryIt(`EIGENVALUEMODE ${JSON.stringify(arg)}`, () => req('POST', '/post/TABLE', { Argument: arg }), (r) => { const s = JSON.stringify(r); return s.slice(0, 600) })

/* 3. 바닥하중 평형: LL 반력 합 = 2·24·16·3 + 0.5·24·16 = 2496 kN, DL 의 바닥분 = 5·384·3 + 2·384 = 6528 kN + 자중 + 선하중 */
await tryIt('REACTIONG sum', async () => {
  const r = await req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'RE', TABLE_TYPE: 'REACTIONG', UNIT: { FORCE: 'KN', DIST: 'M' }, LOAD_CASE_NAMES: ['DL(ST)', 'LL(ST)'] } })
  const sum: Record<string, number> = {}
  for (const row of r.RE.DATA) sum[row[2]] = (sum[row[2]] ?? 0) + +row[5]
  return sum
}, (s) => ({ ...s, expectLL: 2496, expectDLfloor: 6528, perimLine: 5 * 80 * 3 + 1 * 80, note: 'DL = floor + line + self weight' }))

/* 6. 결과표 목록 원본 */
await tryIt('ope/UTBLTYPES raw', () => req('POST', '/ope/UTBLTYPES', {}), (r) => JSON.stringify(r).slice(0, 1500))
await tryIt('ope/UTBLTYPES Argument', () => req('POST', '/ope/UTBLTYPES', { Argument: {} }), (r) => JSON.stringify(r).slice(0, 3000))

/* 6. 추가 층 지표 표 이름 후보 */
for (const [type, lcs] of [['STORY_STABILITY_COEFFICIENT', ['RX(RS)']], ['STABILITY_COEFFICIENT', ['RX(RS)']], ['STORY_SHEAR_FORCE_RATIO', ['RX(RS)']], ['CAPACITY_IRREGULARITY_X', ['RX(RS)']], ['STORY_SHEAR_CAPACITY', ['RX(RS)']], ['MASS_IRREGULARITY', undefined], ['WEIGHT_IRREGULARITY', undefined], ['STORY_SHEAR', ['RX(RS)']], ['STORY_SHEAR_RS', ['RX(RS)']]] as [string, string[] | undefined][])
  await tryIt(`table ${type}`, () => req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'T', TABLE_TYPE: type, UNIT: { FORCE: 'KN', DIST: 'M' }, ...(lcs ? { LOAD_CASE_NAMES: lcs } : {}) } }), (r) => r?.T ? { head: r.T.HEAD, rows: r.T.DATA?.length } : r)

/* 7. 강재 조합 자동 생성 — 스키마 탐색 (현재 LCOM 은 앞에서 GET 해 두고, 결과는 GET 으로 확인) */
const before = await tryIt('LCOM-GEN before', () => req('GET', '/db/LCOM-GEN'), (r) => Object.keys(r?.['LCOM-GEN'] ?? {}).length)
await tryIt('ope/LCOM-STEEL {}', () => req('POST', '/ope/LCOM-STEEL', { Argument: {} }))
await tryIt('ope/LCOM-STEEL GB50017-17', () => req('POST', '/ope/LCOM-STEEL', { Argument: { OPTION: 'ADD', DGNCODE: 'GB50017-17' } }))
await tryIt('LCOM-STEEL after', () => req('GET', '/db/LCOM-STEEL'), (r) => { const c = r?.['LCOM-STEEL'] ?? {}; return { n: Object.keys(c).length, sample: Object.values(c).slice(0, 4) } })
void before

/* 2. 층 자동 생성 엔드포인트 — 스키마만 탐색 (빈 인자 → 오류 메시지의 필수 필드) */
await tryIt('ope/STORY {}', () => req('POST', '/ope/STORY', { Argument: {} }))
await tryIt('ope/STORYPROP {}', () => req('POST', '/ope/STORYPROP', { Argument: {} }), (r) => JSON.stringify(r).slice(0, 800))
