/* Gen 모델 동일성 비교(assertFrameGen)·끊긴 호출 구분·고유치 COMPONENTS 최소 목록 라이브 확인.
   Run: npx tsx scripts/live-sync.ts < /dev/null   (키: stdin → MAPI_KEY → .env)
   현재 문서를 C:/temp 에 백업 저장한 뒤 새 문서에 예제를 만들고 해석한다.
   1) 보낸 그대로면 FRAME_SYNC_DBS 차이 0  2) 절점 하나를 Gen 에서 옮기면 차이를 잡고, 되돌리면 다시 0
   2-1) 되돌린 모델을 화면과 같은 analyze 로 다시 해석 — 층 확인 창(gen-api-cautions.md 4-2) 없이 끝나고 고유치가 같은지
   2-2) 층 정의(STOR)·층 자료 DB(EIGV)를 Gen 에서 바꾸면 차이를 잡고, 되돌리면 다시 0
   시험으로 바꾼 값은 바꾸기 전에 GET 한 값으로 되돌린다(Gen 이 다시 계산해 둔 필드까지 원래대로 — CLAUDE.md)
   3) 1 ms 한도 호출 → MidasConnectionError (isConnectionError)  4) EIGENVALUEMODE COMPONENTS ['Mode'] 가 SUB_TABLES 를 주는지 (읽기만) */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'
import { DEFAULT_TIMEOUT_MS, callTimeout, isConnectionError } from '../src/mapi/timeouts'
import { buildFrame } from '../src/frame/geometry'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { framePayloads } from '../src/frame/gen'
import type { Request } from '../src/frame/results'
import { FRAME_SYNC_DBS, analyze, eigenRequest, expectOk, frameSyncPayload, sendFrame } from '../src/frame/run'
import { parseEigen } from '../src/frame/story'
import { compareGen, diffText } from '../src/domain/genSync'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: DEFAULT_TIMEOUT_MS })
const req: Request = (m, p, b) => client.request(m, p, b as any, callTimeout(p)) as Promise<any>
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
let fails = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++ }

expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_backup_${stamp}.mgbx` }), 'backup')
const model = buildFrame(TUTORIAL_SPEC), P = framePayloads(TUTORIAL_SPEC, model)
await sendFrame(req, P, model)
const save = async () => expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_frame_${stamp}_sync.mgbx` }), 'save')
await analyze(req, P, save)

const sent = frameSyncPayload(P)
/* 화면 assertGenSync 와 같은 비교 (domain/genSync.ts compareGen) */
const sync = async () => (await compareGen(sent, FRAME_SYNC_DBS, async (db) => (await req('GET', `/db/${db}`))?.[db])).diffs
const d0 = await sync()
d0.slice(0, 10).forEach((d) => console.log('  ', diffText(d)))
check(d0.length === 0, `sent model matches Gen (${Object.keys(sent).join(', ')}) — ${d0.length} diffs`)

/* 고유치 — 절점 PUT 전에 (모델을 바꾸면 해석 결과가 무효가 되어 표가 Unknown Error) */
const full = await req('POST', '/post/TABLE', eigenRequest())
const small = await req('POST', '/post/TABLE', { Argument: { ...eigenRequest().Argument, COMPONENTS: ['Mode'] } }).catch((e: Error) => ({ error: e.message }))
const ef = parseEigen(full?.EV), es = parseEigen((small as any)?.EV)
console.log(`  eigen full ${JSON.stringify(full ?? null).length} B · ['Mode'] ${JSON.stringify(small ?? null).length} B`, (small as any)?.error ?? '')
check(!!ef && ef.periods[0] > 0, `full COMPONENTS: T1 ${ef?.periods[0]} s, mass X ${ef?.massX.at(-1)}%`)
console.log(`INFO ['Mode'] only: ${es ? `T1 ${es.periods[0]} s, mass X ${es.massX.at(-1)}% Y ${es.massY.at(-1)}% — same as full: ${JSON.stringify(es) === JSON.stringify(ef)}` : 'no eigen table'}`)

/* Gen 에서 한 항목을 바꿔 잡히는지 보고, 바꾸기 전 GET 값으로 되돌려 차이 0 인지 */
const tryEdit = async (db: string, id: string, change: (v: any) => object, what: string) => {
  const before = (await req('GET', `/db/${db}/${id}`))?.[db]?.[id]
  await req('PUT', `/db/${db}`, { Assign: { [id]: change(before) } })
  const d = await sync()
  check(d.some((x) => x.db === db && x.id === id), `${what} is caught: ${d.map(diffText).join('; ')}`)
  await req('PUT', `/db/${db}`, { Assign: { [id]: before } })
  check((await sync()).length === 0, `${what} → reverted to the value read before the edit → no diffs`)
}
const nid = Object.keys((P as any).NODE)[0]
await tryEdit('NODE', nid, (n) => ({ ...n, X: n.X + 0.1 }), `moved node ${nid}`)

/* 되돌린 모델 재해석 — 층 자료를 다시 만들지 않으면 여기서 Gen 확인 창이 떠 doc/anal 이 멈춘다 */
const t0 = Date.now()
await analyze(req, P, save)
const ea = parseEigen((await req('POST', '/post/TABLE', eigenRequest()))?.EV)
check(!!ea && !!ef && Math.abs(ea.periods[0] - ef.periods[0]) <= 1e-6 * ef.periods[0], `re-analysis after the revert: ${((Date.now() - t0) / 1000).toFixed(1)} s, T1 ${ea?.periods[0]} s (before ${ef?.periods[0]})`)

await tryEdit('STOR', Object.keys((P as any).STOR)[0], (s) => ({ ...s, STORY_LEVEL: s.STORY_LEVEL + 0.1 }), 'changed story level')
await tryEdit('EIGV', '1', (e) => ({ ...e, iFREQ: e.iFREQ + 1 }), 'changed eigen mode count (EIGV)')

try { await client.request('GET', '/db/NODE', undefined, { timeout: 1 }); check(false, '1 ms call should time out') }
catch (e) { check(isConnectionError(e), `1 ms call → ${(e as Error).name}: connection error`) }

console.log(fails ? `${fails} FAILED` : 'all live sync checks passed')
process.exit(fails ? 1 : 0)
