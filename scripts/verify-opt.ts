/* 최적화 최종안 선택 회귀 (pickBest, TW·CN 공통) — 접합 NG 안을 통과안으로 고르지 않는다.
   실행: node --import tsx scripts/verify-opt.ts */
import assert from 'node:assert/strict'
import { pickBest, type OptIter } from '../src/domain/optimize'
import { DEFAULT_SPEC } from '../src/domain/types'

const it = (n: number, o: Partial<OptIter>): OptIter => ({ it: n, sections: DEFAULT_SPEC.sections, weight: 40, plateT: 3, maxRatio: 0.9, svcMax: 0.5, ng: 0, connMax: 0.9, connNg: 0, ...o })

/* 1. 가장 가벼운 안이 접합 NG → 다음으로 가벼운 유효안 */
let r = pickBest([it(1, { weight: 46 }), it(2, { weight: 41, connNg: 1, connMax: 1.08 }), it(3, { weight: 43 })])
assert.equal(r.best.it, 3); assert.equal(r.valid, true)
/* 2. 부재 NG 0 이어도 접합 NG 만 있으면 유효안 없음 → valid false, NG 최소 */
r = pickBest([it(1, { connNg: 2, connMax: 1.2 }), it(2, { connNg: 1, connMax: 1.05 })])
assert.equal(r.valid, false); assert.equal(r.best.it, 2)
/* 3. 판재 포함 총중량 비교 — 부재는 가볍지만 판재가 무거운 안 */
r = pickBest([it(1, { weight: 41, plateT: 4.5 }), it(2, { weight: 42, plateT: 3.0 })])
assert.equal(r.best.it, 2)
/* 4. 부재 NG·접합 NG 합이 같으면 최대비(부재·접합 중 큰 값) 작은 쪽 */
r = pickBest([it(1, { ng: 1, maxRatio: 1.02, connMax: 0.9 }), it(2, { connNg: 1, connMax: 1.01, maxRatio: 0.95 })])
assert.equal(r.valid, false); assert.equal(r.best.it, 2)
/* 5. 모두 유효 → 최경량 */
r = pickBest([it(1, { weight: 46.96, plateT: 3.6 }), it(2, { weight: 42.58, plateT: 3.5 })])
assert.equal(r.best.it, 2); assert.equal(r.valid, true)
console.log('Optimization pick: 5 cases passed (connection NG never chosen as valid; plates in weight; TW/CN same rule)')
