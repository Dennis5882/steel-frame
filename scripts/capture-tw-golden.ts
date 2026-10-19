/* 기준 모델 정답 세트 갱신 (TW 기본, --code CN | KR) — 라이브 Gen 해석 결과(부재력·반력·변위)를 fixture 로 저장하고, 그 결과로 계산한 설계·접합 검토를 정답으로 기록.
   verify-tw.ts(TW)·verify-golden.ts(CN) 가 이 fixture 로 Gen 없이 설계·접합 검토를 다시 돌려 정답과 대조한다.
   실행: printf '<key>\n' | node --import tsx scripts/capture-tw-golden.ts [--code CN|KR]   (키: stdin → MAPI_KEY 환경변수 → .env, 인자·커밋 금지)
   설계식을 의도적으로 바꿨으면 Gen 없이 정답만 갱신: verify-tw.ts --update / verify-golden.ts --code CN|KR --update */
import { readMapiKey } from './mapi-key'
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const arg = process.argv[process.argv.indexOf('--code') + 1]
const code = arg === 'CN' || arg === 'KR' ? arg : 'TW'
let key = await readMapiKey(`Code ${code}.`)
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { defaultSpecFor } = await import('../src/domain/types')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { fetchResults } = await import('../src/actions/results')
const { fixtureFor, encodeResults, golden } = await import('./tw-golden')

S.mapiKey = key; key = ''; S.code = code
const spec = structuredClone(defaultSpecFor(code))
await sendModel(spec)
await analyzeCore()
const res = await fetchResults(S.built!)
const fixture = { captured: new Date().toISOString(), spec, reactions: S.reactions, results: encodeResults(res) }
fixture.golden = golden(spec, res) as never
const FIXTURE = fixtureFor(code)
writeFileSync(FIXTURE, gzipSync(JSON.stringify(fixture)))
console.log(`fixture written: ${FIXTURE}`)
console.log(JSON.stringify((fixture as any).golden.summary))
