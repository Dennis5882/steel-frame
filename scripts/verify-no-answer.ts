/* 작업 단위 '응답 없음' (오프라인) — mapi() 가 한 번 응답 없이 끊기면 같은 작업의 다음 호출은 보내지 않고,
   자동 저장(autoSave)도 그 표시를 넘겨 실패 문구에 Gen 대화상자 안내(gen_no_answer)가 붙는다. 닫힌 포트(127.0.0.1:9)로 연결 실패를 만든다.
   node --import tsx scripts/verify-no-answer.ts */
import assert from 'node:assert/strict'
;(globalThis as any).document = { documentElement: { lang: 'en', dataset: {} } }
;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { setLang, t } = await import('../src/i18n')
setLang('en')
const { S } = await import('../src/state/store')
const { mapi } = await import('../src/mapi/client')
const { beginJob, endJob, failMsg } = await import('../src/actions/job')
const { autoSave } = await import('../src/actions/save')
const { isConnectionError } = await import('../src/mapi/timeouts')

S.mapiKey = 'offline-test'
S.baseUrl = 'http://127.0.0.1:9'
let checks = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++ }

assert.ok(beginJob('anal'))
const e1 = await mapi('GET', '/db/NODE').catch((e) => e)
ok(isConnectionError(e1) && /NODE/.test(S.job?.noAnswer ?? ''), 'first call with no answer marks the job')
const t0 = Date.now()
const e2 = await mapi('GET', '/db/ELEM').catch((e) => e)
ok(isConnectionError(e2) && e2.message === S.job?.noAnswer && Date.now() - t0 < 50, 'the next call in the same job is not sent (fails at once with the first reason)')
ok(failMsg(e2, (m) => m).includes(t('gen_no_answer')), 'failure message carries the Gen dialog hint')
endJob()

assert.ok(beginJob('build'))
const e3 = await autoSave('backup').catch((e) => e)
ok(isConnectionError(e3) && failMsg(e3, (m) => m).includes(t('gen_no_answer')), 'autoSave keeps the no-answer mark (hint shown when the first call, saveas, times out)')
endJob()

assert.ok(beginJob('anal'))
ok(!S.job?.noAnswer, 'a new job starts without the mark')
endJob()

console.log(`No-answer handling: ${checks} checks passed`)
