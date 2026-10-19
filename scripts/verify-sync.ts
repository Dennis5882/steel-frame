/* Gen 모델 동일성 비교 회귀 (domain/genSync, 순수) — 실행: node --import tsx scripts/verify-sync.ts
   라이브 형식(ELEM NODE 0 채움·STYPE 추가)은 같다고 보고, 단면·재료·절점·하중 변경과 추가·삭제는 잡는다. */
import assert from 'node:assert/strict'
import { dbDifferences, diffText } from '../src/domain/genSync'
import { buildGenPayloads } from '../src/domain/gen'
import { buildLoadPayloads } from '../src/domain/loads'
import { buildPortal } from '../src/domain/portal'
import { DEFAULT_SPEC } from '../src/domain/types'

const spec = structuredClone(DEFAULT_SPEC), model = buildPortal(spec)
const p = buildGenPayloads(spec, model) as Record<string, Record<string, any>>, l = buildLoadPayloads(spec, model) as unknown as Record<string, Record<string, any>>
const clone = <T>(x: T): T => structuredClone(x)
/* Gen 응답 흉내: ELEM NODE 8칸 0 채움 + STYPE (라이브 2026-10-15) */
const genElem = () => Object.fromEntries(Object.entries(p.ELEM).map(([id, e]) => [id, { ...e, NODE: [...e.NODE, ...Array(8 - e.NODE.length).fill(0)], STYPE: 0 }]))
let n = 0
const none = (db: string, sent: any, got: any, what: string) => { n++; assert.deepEqual(dbDifferences(db, sent, got), [], what) }
const some = (db: string, sent: any, got: any, what: string, re: RegExp) => {
  n++; const d = dbDifferences(db, sent, got); assert.ok(d.length > 0, what); assert.match(diffText(d[0]), re, `${what}: ${diffText(d[0])}`)
}

none('ELEM', p.ELEM, genElem(), 'ELEM: Gen padding/STYPE accepted')
for (const db of ['MATL', 'SECT', 'NODE', 'FRLS', 'CONS']) none(db, p[db], clone(p[db]), `${db}: identical`)
for (const db of ['STLD', 'BMLD', 'CNLD', 'LCOM-GEN']) none(db, l[db], clone(l[db]), `${db}: identical`)

/* 단면 변경 (같은 ID) */
const sect = clone(p.SECT); const sid = Object.keys(sect)[0]
sect[sid].SECT_BEFORE.SECT_I.SECT_NAME = 'RH 700x300x13x24'
some('SECT', p.SECT, sect, 'SECT name changed', /SECT \d+ SECT_BEFORE\.SECT_I\.SECT_NAME: .* → RH 700x300x13x24/)
/* 요소의 단면 번호 변경 */
const el = genElem(); el['12'].SECT = 99
some('ELEM', p.ELEM, el, 'ELEM section id changed', /ELEM 12 SECT: \d+ → 99/)
/* 요소 절점 바뀜 (0 채움이 아닌 값) */
const el2 = genElem(); el2['5'].NODE[2] = 7
some('ELEM', p.ELEM, el2, 'ELEM extra node', /ELEM 5 NODE/)
/* 절점 이동 */
const nd = clone(p.NODE); nd['3'].Z += 0.5
some('NODE', p.NODE, nd, 'NODE moved', /NODE 3 Z/)
/* 재료 강도 */
const mt = clone(p.MATL); const mid = Object.keys(mt)[0]; mt[mid].TYPE = 'CONC'
some('MATL', p.MATL, mt, 'MATL changed', /MATL/)
/* 요소 추가·삭제 */
const add = genElem(); add['9999'] = { ...add['1'] }
some('ELEM', p.ELEM, add, 'ELEM added', /ELEM: \+1 \/ −0/)
const del = genElem(); delete del['7']
some('ELEM', p.ELEM, del, 'ELEM removed', /ELEM: \+0 \/ −1/)
/* 하중 값 변경 */
const bm = clone(l.BMLD); const bid = Object.keys(bm)[0]; bm[bid].ITEMS[0].P[0] *= 1.1
some('BMLD', l.BMLD, bm, 'BMLD value changed', /BMLD \d+ ITEMS\[ID=\d+\]\.P\[0\]/)
/* 조합 계수 변경 */
const lc = clone(l['LCOM-GEN']); const cid = Object.keys(lc)[0]; lc[cid].vCOMB[0].FACTOR = 9
some('LCOM-GEN', l['LCOM-GEN'], lc, 'combo factor changed', /LCOM-GEN \d+ vCOMB\[0\]\.FACTOR/)
/* 지점 조건 */
const cs = clone(p.CONS); const cnid = Object.keys(cs)[0]; cs[cnid].ITEMS[0].CONSTRAINT = '1110000'
some('CONS', p.CONS, cs, 'support changed', /CONS \d+ ITEMS\[ID=1\]\.CONSTRAINT: 1111111 → 1110000/)
/* 응답 형식 오류 */
some('NODE', p.NODE, undefined, 'missing response', /response/)
console.log(`Gen sync: ${n} checks passed (Gen padding accepted; section/element/node/material/load/combo/support/add/remove detected)`)
