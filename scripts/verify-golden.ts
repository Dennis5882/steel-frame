/* 기준 모델 정답 세트 대조 (CN 기본, --code TW | KR) — 라이브 Gen 결과 fixture 로 설계·접합 검토를 다시 돌려 정답과 비교.
   Gen 반력 합 = 손계산(지붕 활하중 q·B·L, 지진 V) 도 확인. TW 의 손계산·하중 평형 전체는 verify-tw.ts.
   실행: node --import tsx scripts/verify-golden.ts [--code TW|KR] [--update]   (--update = 설계식을 의도적으로 바꿨을 때 정답만 갱신) */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { buildLoadPayloads } from '../src/domain/loads'
import { buildPortal } from '../src/domain/portal'
import { defaultSpecFor } from '../src/domain/types'
import { decodeResults, fixtureFor, golden, type EncodedResults, type Golden } from './tw-golden'

const arg = process.argv[process.argv.indexOf('--code') + 1]
const code = arg === 'TW' || arg === 'KR' ? arg : 'CN'
const spec = structuredClone(defaultSpecFor(code))
const path = fixtureFor(code)
const fx = JSON.parse(gunzipSync(readFileSync(path)).toString()) as { captured: string; spec: typeof spec; reactions: { lc: string; fx: number; fy: number; fz: number }[]; results: EncodedResults; golden: Golden }
let n = 0
const eq = <T>(a: T, b: T, what: string) => { n++; assert.deepEqual(a, b, what) }
const near = (a: number, b: number, rel: number, what: string) => { n++; assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: Gen ${a} vs hand ${b}`) }

eq(JSON.stringify(fx.spec), JSON.stringify(spec), `fixture spec = current ${code} default (re-capture if defaults changed)`)
const model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
const BL = spec.span * spec.bays * spec.baySpacing
const rx = (lc: string) => fx.reactions.find((x) => x.lc === lc)!
near(Math.abs(rx('LR').fz), loads.info.roofLive * BL, 1e-4, 'Gen LR reaction = q·B·L')
near(Math.abs(rx('EX').fx), loads.info.seismic.X.V, 1e-4, 'Gen EX reaction = V_X')
near(Math.abs(rx('EY').fy), loads.info.seismic.Y.V, 1e-4, 'Gen EY reaction = V_Y')
if (code === 'CN' && loads.info.snow) near(Math.abs(rx('SN').fz), loads.info.snow * BL, 1e-4, 'Gen SN reaction = s·B·L')
if (code === 'KR') near(Math.abs(rx('SN').fz), loads.info.kr!.Ss * BL, 1e-4, 'Gen SN reaction = S_s·B·L (KDS balanced)')

const originalResults = JSON.stringify(fx.results)
const now = golden(spec, decodeResults(fx.results))
eq(JSON.stringify(fx.results), originalResults, 'golden evaluation must preserve captured Gen results')
if (process.argv.includes('--update')) {
  writeFileSync(path, gzipSync(JSON.stringify({ ...fx, golden: now })))
  console.log('golden updated (design/connection answers only; Gen results unchanged)')
}
const G = process.argv.includes('--update') ? now : fx.golden
eq(now.members.length, G.members.length, 'member count')
const diffs = now.members.filter((m, i) => JSON.stringify(m) !== JSON.stringify(G.members[i]))
eq(diffs.slice(0, 5), [], `members differ from golden (${diffs.length}) — --update if intended`)
n += now.members.length - 1
eq(now.summary, G.summary, 'summary (max ratio, NG, by role, serviceability, connections)')
eq(now.conns, G.conns, 'connection dims and per-item ratios')
console.log(`${code} golden: ${n} checks passed (${now.members.length} members, fixture ${fx.captured.slice(0, 10)}, max ${G.summary.maxRatio}, NG ${G.summary.ng}, conns ${G.summary.conns.map((c) => `${c.type} ${c.ratio.toFixed(3)}`).join(', ')})`)
