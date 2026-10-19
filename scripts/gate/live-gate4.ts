/* 단계 0 게이트 4 — 고유치 표 실패 원인 분리(가새 TRUSS 유무), Q355 를 받는 다른 규격 확인.
   Run: npx tsx scripts/gate/live-gate4.ts < /dev/null  (live-gate 시험 모델이 열려 있어야 함) */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 10 * 60 * 1000 })
const req = (m: 'GET' | 'PUT' | 'POST' | 'DELETE', p: string, b?: unknown) => client.request(m, p, b as any) as Promise<any>
const errMsg = (e: any) => e?.responseBody?.error?.message ?? e?.responseBody?.message ?? JSON.stringify(e?.responseBody ?? '') ?? e?.message
async function tryIt(name: string, fn: () => Promise<any>, show: (r: any) => unknown = (r) => r) {
  try { const r = await fn(); console.log(`OK   ${name}`, JSON.stringify(show(r))?.slice(0, 900)); return r } catch (e: any) { console.log(`FAIL ${name}`, String(errMsg(e) || e?.message).slice(0, 300)); return undefined }
}
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
const ev = (tag: string) => tryIt(`EIGENVALUEMODE ${tag}`, () => req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', UNIT: { FORCE: 'KN', DIST: 'M' } } }),
  (r) => { const s = JSON.stringify(r); const m = s.match(/"Period\(sec\)"[\s\S]{0,40}/); return { len: s.length, keys: Object.keys(r?.EV ?? r ?? {}), head: s.slice(0, 500), m: m?.[0] } })
const pv = () => tryIt('PARTICIPATIONVECTORMODE', () => req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'PV', TABLE_TYPE: 'PARTICIPATIONVECTORMODE', UNIT: { FORCE: 'KN', DIST: 'M' } } }), (r) => JSON.stringify(r).slice(0, 400))

await ev('as is')
await pv()

/* Q355 를 받는 규격 (시험 번호 9 → DELETE) */
for (const std of ['BC1:12-GB(S)', 'JTG D64-2015(S)', 'GB/T50018-25(S)', 'JTG3362-18(S)', 'GB 50917-13(S)'])
  await tryIt(`MATL ${std}/Q355`, () => req('PUT', '/db/MATL', { Assign: { 9: { TYPE: 'STEEL', NAME: 'T9', DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 1, STANDARD: std, CODE: '', DB: 'Q355', bELAST: false }] } } }), (r) => r?.MATL?.[9]?.PARAM?.[0])
await tryIt('MATL GET 9', () => req('GET', '/db/MATL/9'), (r) => r)
await tryIt('DELETE MATL 9', () => req('DELETE', '/db/MATL', { Assign: { 9: {} } }), () => 'deleted')

/* 가새 제거 → 재해석 → 고유치 표 */
const elems = (await req('GET', '/db/ELEM')).ELEM as Record<string, any>
const truss = Object.entries(elems).filter(([, e]) => e.TYPE === 'TRUSS')
console.log('truss count', truss.length)
await tryIt('DELETE truss', () => req('DELETE', '/db/ELEM', { Assign: Object.fromEntries(truss.map(([id]) => [id, {}])) }), () => 'deleted')
await tryIt('saveas', () => req('POST', '/doc/saveas', { Argument: `C:/temp/sf_gate4_nobrace_${stamp}.mgbx` }), (r) => r.message)
await tryIt('doc/anal (no brace)', () => req('POST', '/doc/anal', {}), (r) => r.message)
await ev('no brace')
/* 원복 */
await tryIt('PUT truss back', () => req('PUT', '/db/ELEM', { Assign: Object.fromEntries(truss) }), () => 'restored')
await tryIt('saveas', () => req('POST', '/doc/saveas', { Argument: `C:/temp/sf_gate4_${stamp}.mgbx` }), (r) => r.message)
await tryIt('doc/anal (braced)', () => req('POST', '/doc/anal', {}), (r) => r.message)
await ev('braced again')
