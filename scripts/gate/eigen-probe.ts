/* EIGENVALUEMODE 원본 응답 구조 확인 (열린 모델, 변경 없음). npx tsx scripts/gate/eigen-probe.ts < /dev/null */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'
const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 120000 })
const r: any = await client.request('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', UNIT: { FORCE: 'KN', DIST: 'M' } } })
const ev = r?.EV ?? r
console.log('keys', Object.keys(ev ?? {}), 'rows', ev?.DATA?.length)
const subs = ev?.SUB_TABLES ?? []
for (const s of subs) for (const [k, v] of Object.entries<any>(s)) console.log('SUB', k, JSON.stringify(v?.HEAD), JSON.stringify(v?.DATA?.slice(0, 4)))
