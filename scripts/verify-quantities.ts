import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { quantities } from '../src/domain/quantities'
import { CN_DEFAULT_SPEC } from '../src/domain/types'
import { buildPortal } from '../src/domain/portal'
import { runCnConnections } from '../src/domain/cnConnections'
import { runConnections, type ConnResult } from '../src/domain/connections'
import { buildLoadPayloads } from '../src/domain/loads'
import { FIXTURE, decodeResults } from './tw-golden'
import type { Results } from '../src/actions/results'

const spec = structuredClone(CN_DEFAULT_SPEC), model = buildPortal(spec)
const c = (type: ConnResult['type'], dims: ConnResult['dims']): ConnResult => ({ type, dims, elem: 1, combo: 'test', ratio: 0, notes: [], checks: [] })
const base = c('base', { plate: 'PL 500x500x20', shearKey: 'PL 200x100x10', anchors: '8-M24' })
const knee = c('knee', { stiffener: '2-PL 83.75x20' })
const q = quantities(spec, model, [base, knee])
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
// Seven frames: 14 bases/knees. Independent physical volume × density.
near(q.plates.find((p) => p.part === 'shearKey')!.kg, 200 * 100 * 10 * 14 * 7.85e-6)
near(q.plates.find((p) => p.part === 'stiffener')!.kg, 83.75 * 358 * 20 * 2 * 14 * 7.85e-6)
assert.match(q.plates.find((p) => p.part === 'stiffener')!.size, /83\.75/)
near(q.plateT, (500 * 500 * 20 * 14 + 200 * 100 * 10 * 14 + 83.75 * 358 * 20 * 2 * 14) * 7.85e-9)
near(q.orderT, q.memberT * 1.05 + q.plateT * 1.1)
assert.equal(q.bolts[0].total, 112)
assert.throws(() => quantities(spec, model, [c('base', { shearKey: 'invalid-size' })]), /Invalid connection quantity/)

// The actual CN producer retains fractional stiffener widths as numbers.
const fractional = { ...spec, sections: { ...spec.sections, column: 'HW 175x175x7.5/11' } }
const fm = buildPortal(fractional)
const results: Results = { beam: new Map(fm.elements.filter((e) => e.role !== 'brace').map((e) => [e.id, new Map([['test', Array.from({ length: 5 }, () => ({ P: -10, My: 1, Mz: 0, Vy: 0, Vz: 1 }))]])])), truss: new Map(fm.elements.filter((e) => e.role === 'brace').map((e) => [e.id, new Map([['test', 10]])])), sway: new Map(), disp: new Map(), combos: ['test'] }
const cn = runCnConnections(fractional, fm, results)
assert.equal(cn.find((x) => x.type === 'knee')!.parts!.plates.find((p) => p.part === 'stiffener')!.width, 83.75)
const numeric = quantities(fractional, fm, cn)
assert.ok(numeric.plates.some((p) => p.part === 'shearKey'))
// Legacy dimensions never encoded the newly detailed brace weld lengths.
const legacy = quantities(fractional, fm, cn.map(({ parts: _, ...x }) => x))
assert.deepEqual(numeric.plates, legacy.plates)
assert.deepEqual(numeric.bolts, legacy.bolts)
near(numeric.netT, legacy.netT)
assert.ok(numeric.filletM > legacy.filletM)
const renamed = structuredClone(cn)
for (const x of renamed) x.dims = { plate: 'display only' }
assert.deepEqual(numeric, quantities(fractional, fm, renamed))

// Existing TW takeoff remains equivalent to its legacy text representation.
const fixture = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString())
const twModel = buildPortal(fixture.spec), info = buildLoadPayloads(fixture.spec, twModel).info
const tw = runConnections(fixture.spec, twModel, info, decodeResults(fixture.results))
assert.ok(tw.every((x) => x.parts))
assert.deepEqual(quantities(fixture.spec, twModel, tw), quantities(fixture.spec, twModel, tw.map(({ parts: _, ...x }) => x)))
/* 물량 산출서: CSV·Excel 같은 행. xlsx 파트는 올바른 XML, 숫자는 숫자 칸, 제목·머리 행 굵게, zip 으로 다시 열림 */
{
  const { DOMParser } = await import('@xmldom/xmldom')
  const JSZip = (await import('jszip')).default
  ;(globalThis as any).document ??= { documentElement: { lang: 'ko', dataset: {} } }
  const { setLang, t } = await import('../src/i18n')
  const { quantitySheet, quantityCsv } = await import('../src/report/quantitySheet')
  const { xlsxParts } = await import('../src/report/xlsx')
  for (const lang of ['ko', 'en', 'zh-TW', 'zh-CN'] as const) {
    setLang(lang)
    const tq = quantities(fixture.spec, twModel, tw), sheet = quantitySheet(fixture.spec, tq)
    const csv = quantityCsv(sheet)
    assert.ok(csv.startsWith('\ufeff') && csv.split('\r\n').length === sheet.rows.length, `${lang}: CSV rows`)
    const parts = xlsxParts(sheet)
    for (const [path, xml] of Object.entries(parts)) {
      const errors: string[] = []
      new DOMParser({ onError: (level: string, msg: string) => { if (level !== 'warning') errors.push(msg) } } as any).parseFromString(xml, 'text/xml')
      assert.deepEqual(errors, [], `${lang}: ${path} is well-formed XML`)
    }
    const ws = parts['xl/worksheets/sheet1.xml']
    assert.equal((ws.match(/<row /g) ?? []).length, sheet.rows.length, `${lang}: one xlsx row per CSV row`)
    assert.ok(ws.includes(`<v>${tq.orderT.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}</v>`), `${lang}: order weight is a numeric cell`)
    assert.ok(ws.includes(`s="1"><is><t xml:space="preserve">${t('q_members')}</t>`), `${lang}: section title bold`)
    assert.equal((ws.match(/ s="2"/g) ?? []).length, sheet.rows[1].length + sheet.rows.find((r, i) => i > 0 && sheet.rows[i - 1][0] === t('q_plates'))!.length + sheet.rows.find((r, i) => i > 0 && sheet.rows[i - 1][0] === t('q_bolts'))!.length, `${lang}: three header rows shaded`)
    const zip = new JSZip(); for (const [path, xml] of Object.entries(parts)) zip.file(path, xml)
    const back = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }))
    assert.ok(back.file('xl/workbook.xml') && back.file('[Content_Types].xml'), `${lang}: xlsx package reopens`)
  }
  setLang('ko')
}
console.log('Quantity regression passed: shear key, fractional stiffener, totals, structured CN/TW parts, legacy compatibility')
