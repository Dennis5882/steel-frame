/* 단계 0 게이트 5 — EIGENVALUEMODE "Unknown Error" 원인 분리.
   live-gate.ts 직후 열린 시험 모델에서 DSTL → LCOM-GEN → SPLC → STOR 순으로 URL 번호 DELETE 후 재해석해 표가 나오는 시점을 찾는다.
   (본문 Assign DELETE 는 DB 전체를 지우므로 쓰지 않는다.) 최종 모델은 live-gate 가 _final.mgbx 로 이미 저장했다.
   Run: npx tsx scripts/gate/live-gate5.ts < /dev/null */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 10 * 60 * 1000 })
const req = (m: 'GET' | 'PUT' | 'POST' | 'DELETE', p: string, b?: unknown) => client.request(m, p, b as any) as Promise<any>
const errMsg = (e: any) => e?.responseBody?.error?.message ?? e?.responseBody?.message ?? JSON.stringify(e?.responseBody ?? '') ?? e?.message
async function tryIt(name: string, fn: () => Promise<any>, show: (r: any) => unknown = (r) => r) {
  try { const r = await fn(); console.log(`OK   ${name}`, JSON.stringify(show(r))?.slice(0, 900)); return r } catch (e: any) { console.log(`FAIL ${name}`, String(errMsg(e) || e?.message).slice(0, 300)); return undefined }
}
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
let n = 0
const ev = async (tag: string) => {
  await tryIt('saveas', () => req('POST', '/doc/saveas', { Argument: `C:/temp/sf_gate5_${stamp}_${++n}.mgbx` }), (r) => r.message)
  await tryIt(`doc/anal ${tag}`, () => req('POST', '/doc/anal', {}), (r) => r.message)
  return tryIt(`EIGENVALUEMODE ${tag}`, () => req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', UNIT: { FORCE: 'KN', DIST: 'M' } } }),
    (r) => { const s = JSON.stringify(r); const i = s.indexOf('Period'); return { len: s.length, around: i > 0 ? s.slice(i - 80, i + 700) : s.slice(0, 300) } })
}

if (await ev('baseline')) process.exit(0)
for (const [db, ids] of [['DSTL', [1]], ['LCOM-GEN', [1, 2, 3]], ['SPLC', [1, 2]], ['SPFC', [1]], ['STOR', [1, 2, 3, 4, 5]]] as [string, number[]][]) {
  await tryIt(`DELETE ${db} ${ids.join(',')}`, async () => { for (const id of ids) await req('DELETE', `/db/${db}/${id}`); return Object.keys((await req('GET', `/db/${db}`))?.[db] ?? {}).length }, (k) => ({ remaining: k }))
  if (await ev(`without ${db}`)) break
}
