/* 단계 0 게이트 3 — Q355 재료 후보, 사용자 정의 Q355, 재해석 후 고유치·층 표·바닥하중 평형 재확인.
   Run: npx tsx scripts/gate/live-gate3.ts < /dev/null  (live-gate.ts 시험 모델이 열려 있어야 함) */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 10 * 60 * 1000 })
const req = (m: 'GET' | 'PUT' | 'POST' | 'DELETE', p: string, b?: unknown) => client.request(m, p, b as any) as Promise<any>
const errMsg = (e: any) => e?.responseBody?.error?.message ?? e?.responseBody?.message ?? JSON.stringify(e?.responseBody ?? '') ?? e?.message
async function tryIt(name: string, fn: () => Promise<any>, show: (r: any) => unknown = (r) => r) {
  try { const r = await fn(); console.log(`OK   ${name}`, JSON.stringify(show(r))?.slice(0, 900)); return r } catch (e: any) { console.log(`FAIL ${name}`, String(errMsg(e) || e?.message).slice(0, 300)); return undefined }
}
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')

/* 1. Q355 CODE(=제품) 후보 */
for (const code of ['GB/T 1591-2018', 'GB/T1591-2018', 'GB/T 1591', 'GB 50017-2017', 'Steel', 'Plate', 'Section', 'Rolled', 'Hot-rolled', 'GB'])
  if (await tryIt(`MATL GB50017-17(S)/Q355 CODE='${code}'`, () => req('PUT', '/db/MATL', { Assign: { 9: { TYPE: 'STEEL', NAME: 'T9', DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 1, STANDARD: 'GB50017-17(S)', CODE: code, DB: 'Q355', bELAST: false }] } } }), (r) => r?.MATL?.[9]?.PARAM?.[0])) break
await tryIt('MATL GB50017-17(S)/Q355 no CODE', () => req('PUT', '/db/MATL', { Assign: { 9: { TYPE: 'STEEL', NAME: 'T9', DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 1, STANDARD: 'GB50017-17(S)', DB: 'Q355' }] } } }), (r) => r?.MATL?.[9]?.PARAM?.[0])
await tryIt('DELETE MATL 9', () => req('DELETE', '/db/MATL', { Assign: { 9: {} } }), () => 'deleted')

/* 1b. 사용자 정의 Q355 — 재료 1 을 교체 (kN·m: E = 2.06e8 kN/m², 비중 78.5 kN/m³) */
await tryIt('MATL 1 user-defined Q355', () => req('PUT', '/db/MATL', { Assign: { 1: { TYPE: 'STEEL', NAME: 'Q355', DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 2, ELAST: 2.06e8, POISN: 0.3, THERMAL: 1.2e-5, DEN: 78.5, MASS: 78.5 / 9.806 }] } } }), (r) => r?.MATL?.[1])

/* 재해석 */
await tryIt('saveas', () => req('POST', '/doc/saveas', { Argument: `C:/temp/sf_gate3_${stamp}.mgbx` }), (r) => r.message)
await tryIt('doc/anal', () => req('POST', '/doc/anal', {}), (r) => r.message)

const table = (key: string, type: string, lcs?: string[], extra: object = {}) => tryIt(`table ${type}${lcs ? ' ' + lcs.join(',') : ''}`,
  () => req('POST', '/post/TABLE', { Argument: { TABLE_NAME: key, TABLE_TYPE: type, UNIT: { FORCE: 'KN', DIST: 'M' }, ...(lcs ? { LOAD_CASE_NAMES: lcs } : {}), ...extra } }),
  (r: any) => { const t = r?.[key]; return t ? { head: t.HEAD, rows: t.DATA?.length, data: t.DATA?.slice(0, 12) } : JSON.stringify(r).slice(0, 900) })

/* 3. 평형 */
await tryIt('REACTIONG sum', async () => {
  const r = await req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'RE', TABLE_TYPE: 'REACTIONG', UNIT: { FORCE: 'KN', DIST: 'M' }, LOAD_CASE_NAMES: ['DL(ST)', 'LL(ST)'] } })
  const sum: Record<string, number> = {}
  for (const row of r.RE.DATA) sum[row[2]] = (sum[row[2]] ?? 0) + +row[5]
  return sum
}, (s) => ({ ...s, expectLL: 2496, expectDLfloorPlusLine: 6528 + 5 * 80 * 3 + 80 }))

/* 5. 고유치 — 다른 이름 */
await table('EV', 'EIGENVALUEMODE')
await table('EV2', 'EIGENVALUEMODE', undefined, { COMPONENTS: ['Mode', 'Frequency', 'Period'] })
await table('MP', 'MODALPARTICIPATIONMASS')
await table('EVA', 'EIGENVALUE')
await table('VB', 'VIBRATIONMODE')
/* 6. 층 표 (RS) */
await table('DX', 'STORY_DRIFT_X', ['RX(RS)'])
await table('SX', 'STORY_SHEAR_FORCE_COEFFICIENT', ['RX(RS)'])
await table('SY', 'STORY_SHEAR_FORCE_COEFFICIENT', ['RY(RS)'])
await table('TX', 'TORSIONAL_IRREGULARITY_X', ['RX(RS)'])
await table('KX', 'STIFFNESS_IRREGULARITY_X', ['RX(RS)'], { ADDITIONAL: { SET_CALCULATION_METHOD: { STORY_DRIFT_METHOD: 'Drift at the Center of Mass', STORY_STIFFNESS_METHOD: 'Story Shear / Story Drift' } } })
await table('KX2', 'STIFFNESS_IRREGULARITY_X', ['RX(RS)'], { ADDITIONAL: { SET_CALCULATION_METHOD: { STORY_DRIFT_METHOD: 'Drift at the Center of Mass', STORY_STIFFNESS_METHOD: '1 / Story Drift Ratio' } } })
await table('ST', 'STORY_SHEAR_FORCE_RATIO', ['RX(RS)'])
await table('MS', 'STORY_MASS')
await tryIt('ope/STORYPROP', () => req('POST', '/ope/STORYPROP', { Argument: {} }), (r) => r)
