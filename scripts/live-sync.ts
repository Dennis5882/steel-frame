/* Gen 모델 동일성 비교(assertFrameGen)·끊긴 호출 구분·고유치 COMPONENTS 최소 목록 라이브 확인.
   Run: npx tsx scripts/live-sync.ts < /dev/null   (키: stdin → MAPI_KEY → .env)
   현재 문서를 C:/temp 에 백업 저장한 뒤 새 문서에 예제를 만들고 해석한다.
   1) 보낸 그대로면 FRAME_SYNC_DBS 차이 0  2) 절점 하나를 Gen 에서 옮기면 차이를 잡고, 되돌리면 다시 0
   3) 1 ms 한도 호출 → MidasConnectionError (isConnectionError)  4) EIGENVALUEMODE COMPONENTS ['Mode'] 가 SUB_TABLES 를 주는지 (읽기만) */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'
import { DEFAULT_TIMEOUT_MS, callTimeout, isConnectionError } from '../src/mapi/timeouts'
import { buildFrame } from '../src/frame/geometry'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { framePayloads } from '../src/frame/gen'
import type { Request } from '../src/frame/results'
import { analyze, eigenRequest, expectOk, frameSyncPayload, sendFrame } from '../src/frame/run'
import { parseEigen } from '../src/frame/story'
import { dbDifferences, diffText, type SyncDiff } from '../src/domain/genSync'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: DEFAULT_TIMEOUT_MS })
const req: Request = (m, p, b) => client.request(m, p, b as any, callTimeout(p)) as Promise<any>
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
let fails = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++ }

expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_backup_${stamp}.mgbx` }), 'backup')
const model = buildFrame(TUTORIAL_SPEC), P = framePayloads(TUTORIAL_SPEC, model)
await sendFrame(req, P, model)
expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_frame_${stamp}_sync.mgbx` }), 'save')
await analyze(req)

const sent = frameSyncPayload(P)
const sync = async () => {
  const out: SyncDiff[] = []
  for (const [db, rec] of Object.entries(sent)) out.push(...dbDifferences(db, rec, (await req('GET', `/db/${db}`))?.[db]))
  return out
}
const d0 = await sync()
d0.slice(0, 10).forEach((d) => console.log('  ', diffText(d)))
check(d0.length === 0, `sent model matches Gen (${Object.keys(sent).join(', ')}) — ${d0.length} diffs`)

/* 고유치 — 절점 PUT 전에 (모델을 바꾸면 해석 결과가 무효가 되어 표가 Unknown Error) */
const full = await req('POST', '/post/TABLE', eigenRequest())
const small = await req('POST', '/post/TABLE', { Argument: { ...eigenRequest().Argument, COMPONENTS: ['Mode'] } }).catch((e: Error) => ({ error: e.message }))
const ef = parseEigen(full?.EV), es = parseEigen((small as any)?.EV)
console.log(`  eigen full ${JSON.stringify(full).length} B · ['Mode'] ${JSON.stringify(small).length} B`, (small as any).error ?? '')
check(!!ef && ef.periods[0] > 0, `full COMPONENTS: T1 ${ef?.periods[0]} s, mass X ${ef?.massX.at(-1)}%`)
console.log(`INFO ['Mode'] only: ${es ? `T1 ${es.periods[0]} s, mass X ${es.massX.at(-1)}% Y ${es.massY.at(-1)}% — same as full: ${JSON.stringify(es) === JSON.stringify(ef)}` : 'no eigen table'}`)

const id = Object.keys((P as any).NODE)[0], orig = (P as any).NODE[id]
await req('PUT', '/db/NODE', { Assign: { [id]: { ...orig, X: orig.X + 0.1 } } })
const d1 = await sync()
check(d1.some((d) => d.db === 'NODE' && d.id === id), `moved node ${id} is caught: ${d1.map(diffText).join('; ')}`)
await req('PUT', '/db/NODE', { Assign: { [id]: orig } })
check((await sync()).length === 0, 'node moved back → no diffs')

try { await client.request('GET', '/db/NODE', undefined, { timeout: 1 }); check(false, '1 ms call should time out') }
catch (e) { check(isConnectionError(e), `1 ms call → ${(e as Error).name}: connection error`) }

console.log(fails ? `${fails} FAILED` : 'all live sync checks passed')
process.exit(fails ? 1 : 0)
