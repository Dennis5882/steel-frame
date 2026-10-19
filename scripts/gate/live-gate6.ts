/* 단계 0 게이트 6 — 최소 모델(캔틸레버 기둥 + 절점질량, 고유치만)에서 EIGENVALUEMODE 가 나오는지 확인 → 빌드 문제 여부.
   Run: npx tsx scripts/gate/live-gate6.ts < /dev/null */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 5 * 60 * 1000 })
const req = (m: 'GET' | 'PUT' | 'POST' | 'DELETE', p: string, b?: unknown) => client.request(m, p, b as any) as Promise<any>
const errMsg = (e: any) => e?.responseBody?.error?.message ?? e?.responseBody?.message ?? JSON.stringify(e?.responseBody ?? '') ?? e?.message
async function tryIt(name: string, fn: () => Promise<any>, show: (r: any) => unknown = (r) => r) {
  try { const r = await fn(); console.log(`OK   ${name}`, JSON.stringify(show(r))?.slice(0, 900)); return r } catch (e: any) { console.log(`FAIL ${name}`, String(errMsg(e) || e?.message).slice(0, 300)); return undefined }
}
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
const ev = (tag: string, arg: object = {}) => tryIt(`EIGENVALUEMODE ${tag}`, () => req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', ...arg } }), (r) => JSON.stringify(r).slice(0, 700))

await tryIt('doc/new', () => req('POST', '/doc/new', {}), (r) => r.message)
await tryIt('UNIT', () => req('PUT', '/db/UNIT', { Assign: { 1: { FORCE: 'KN', DIST: 'M', HEAT: 'KJ', TEMPER: 'C' } } }), () => 'ok')
await tryIt('MATL GB03 Q345', () => req('PUT', '/db/MATL', { Assign: { 1: { TYPE: 'STEEL', NAME: 'Q345', DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 1, STANDARD: 'GB03(S)', CODE: '', DB: 'Q345', bELAST: false }] } } }), () => 'ok')
await tryIt('SECT', () => req('PUT', '/db/SECT', { Assign: { 1: { SECTTYPE: 'DBUSER', SECT_NAME: 'HW250', SECT_BEFORE: { OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0, HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0, VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0, USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: true, SHAPE: 'H', DATATYPE: 1, SECT_I: { DB_NAME: 'GB-YB05', SECT_NAME: 'HW 250x250x9/14' } } } } }), () => 'ok')
await tryIt('NODE', () => req('PUT', '/db/NODE', { Assign: { 1: { X: 0, Y: 0, Z: 0 }, 2: { X: 0, Y: 0, Z: 4 } } }), () => 'ok')
await tryIt('ELEM', () => req('PUT', '/db/ELEM', { Assign: { 1: { TYPE: 'BEAM', MATL: 1, SECT: 1, NODE: [1, 2], ANGLE: 0 } } }), () => 'ok')
await tryIt('CONS', () => req('PUT', '/db/CONS', { Assign: { 1: { ITEMS: [{ ID: 1, CONSTRAINT: '1111111' }] } } }), () => 'ok')
await tryIt('STLD+BODF', async () => { await req('PUT', '/db/STLD', { Assign: { 1: { NAME: 'DL', TYPE: 'D', DESC: '' } } }); return req('PUT', '/db/BODF', { Assign: { 1: { LCNAME: 'DL', GROUP_NAME: '', FV: [0, 0, -1] } } }) }, () => 'ok')
await tryIt('NMAS',() => req('PUT', '/db/NMAS', { Assign: { 2: { mX: 10, mY: 10, mZ: 10, rmX: 0, rmY: 0, rmZ: 0 } } }), () => 'ok')
await tryIt('EIGV lanczos 3', () => req('PUT', '/db/EIGV', { Assign: { 1: { TYPE: 'LANCZOS', iFREQ: 3, iITER: 20, iDIM: 1, TOL: 1e-10, bMINMAX: false, FRMIN: 0, FRMAX: 0, bSTRUM: false } } }), () => 'ok')
await tryIt('saveas', () => req('POST', '/doc/saveas', { Argument: `C:/temp/sf_gate6_${stamp}.mgbx` }), (r) => r.message)
await tryIt('doc/anal', () => req('POST', '/doc/anal', {}), (r) => r.message)
await ev('minimal')
await ev('minimal + UNIT', { UNIT: { FORCE: 'KN', DIST: 'M' } })
await tryIt('PARTICIPATIONVECTORMODE', () => req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'PV', TABLE_TYPE: 'PARTICIPATIONVECTORMODE' } }), (r) => JSON.stringify(r).slice(0, 300))
