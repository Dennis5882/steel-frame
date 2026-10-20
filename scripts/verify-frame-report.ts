/* 다층 강골조 계산서·도면·전도모멘트·단면 최적화 (오프라인). Gen·키 불필요.
   1) 고정 라이브 결과(cn-frame.json.gz) → 계산서 HTML 4개 언어 → PDF(pdfmake, 축소 글꼴)·Word(docx) 변환, 글자 누락 없음
   2) 도면: 시트 구성(평면·가새 골조선 입면·부재표), ASCII, A3 PDF 한 장씩, DXF, 부재표 중량 = 독립 계산
   3) 전도모멘트: Gen 표(각도별 Frame/Wall 열 반복) 파싱과 ΣV·h 독립 계산
   4) 최적화: 제안 단면이 모든 부재 비 ≤ 0.95·구조 규정 ≤ 1 이고, 같은 계열에서 한 단계 가벼운 단면은 통과하지 못함 (최경량)
   node --import tsx scripts/verify-frame-report.ts */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import pdfMake from 'pdfmake'
import { PDFDocument } from 'pdf-lib'
import { Packer } from 'docx'
import JSZip from 'jszip'
import * as fontkit from 'fontkit'
import { drawingsPdfDefinition, reportFontFile, reportPdfDefinition } from '../src/report/pdf'
import { reportDocxDocument } from '../src/report/docx'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { buildFrame, elementLength } from '../src/frame/geometry'
import { framePayloads } from '../src/frame/gen'
import { designMembers, hSection, runFrameDesign } from '../src/frame/design'
import { overturning, storyReview } from '../src/frame/story'
import { frameCombos } from '../src/frame/loads'
import { captureShots, comboName } from '../src/frame/captures'
import { captureGen } from '../src/frame/run'
import { buildFrameDrawingSvgs, buildFrameDxf, elevationLines, frameSchedule } from '../src/frame/drawings'
import { xlsxParts } from '../src/report/xlsx'
import { OPT_TARGET, candidatesFor, frameWeight, optIter, pickBest, proposeSections, type FrameOptIter } from '../src/frame/optimize'
import type { ElementForces } from '../src/frame/results'
import type { FrameAnalysis } from '../src/frame/run'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { buildFrameReport } = await import('../src/frame/report')
const { frameQuantities } = await import('../src/frame/quantities')
const { frameQuantitySheet } = await import('../src/frame/quantitySheet')
const { quantityCsv } = await import('../src/report/quantitySheet')
const { setLang, t } = await import('../src/i18n')
pdfMake.setLocalAccessPolicy((path) => path.startsWith(resolve('public/fonts')))
pdfMake.setUrlAccessPolicy(() => false)
mkdirSync('output/pdf', { recursive: true }); mkdirSync('output/docx', { recursive: true })
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
let checks = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++ }
const near = (a: number, b: number, tol: number, m: string) => { assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`); checks++ }

/* 고정 라이브 결과 → 설계 상태 */
const spec = TUTORIAL_SPEC, model = buildFrame(spec), P = framePayloads(spec, model)
const fx = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/cn-frame.json.gz', import.meta.url))).toString())
const forces: ElementForces = new Map(fx.forces.map(([id, loads]: [number, [string, number[][]][]]) =>
  [id, new Map(loads.map(([l, st]) => [l, st.map(([N, Vx, Vy, Mx, My]) => ({ N, Vx, Vy, Mx, My }))]))]))
const combos = frameCombos().map((c) => ({ name: c.name, seismic: c.seismic }))
const analysis: FrameAnalysis = { equilibrium: fx.equilibrium, story: { ...fx.story, eigen: fx.eigen }, colStrongAxis: fx.colStrongAxis, missing: {} }
const review = storyReview(spec, model, analysis.story, analysis.colStrongAxis)
const design = runFrameDesign(spec, designMembers(spec, model, analysis.colStrongAxis), forces, combos)

/* 3) 전도모멘트 — 앱 ΣV·h 독립 계산 + Gen 표 파싱 */
{
  const names = spec.storyNames.slice(0, -1), h = spec.heights
  const V = (dir: 'X' | 'Y', nm: string) => +(dir === 'X' ? fx.story.shearX : fx.story.shearY).find((r: any) => r.Story === nm)[`Shear Force/${dir}`]
  const otm = overturning(spec, analysis.story)
  ok(otm.length === names.length && otm[0].story === names.at(-1), 'OTM rows top → bottom')
  for (const dir of ['X', 'Y'] as const) {
    let acc = 0
    for (let i = names.length - 1; i >= 0; i--) {
      acc += Math.abs(V(dir, names[i])) * h[i]
      near(otm.find((o) => o.story === names[i])!.app[dir]!, acc, 1e-6, `ΣV·h ${dir} ${names[i]}`)
    }
  }
  ok(otm.every((o) => o.gen.X === null && o.gen.Y === null), 'no Gen OTM table in the fixture → null')
  /* Gen 표: 각도마다 Frame·Wall 값 열이 반복, EY 는 첫 각도 열이 '-' (story 앱 라이브 기록) */
  const HEAD = ['Index', 'Story', 'Level', 'Overturning Moment by Vertical Member Types/Frame/Value', 'Overturning Moment by Vertical Member Types/Frame/Ratio',
    'Overturning Moment by Vertical Member Types/Wall/Value', 'Overturning Moment by Vertical Member Types/Frame/Value', 'Overturning Moment by Vertical Member Types/Wall/Value']
  const tb = { HEAD, DATA: [['1', '1F', '-4.5', '1200.5', '1', '0', '-', '-'], ['2', '2F', '0', '-', '1', '-', '-800.25', '0']] }
  const o2 = overturning(spec, { ...analysis.story, otmX: tb, otmY: tb })
  near(o2.find((o) => o.story === '1F')!.gen.X!, 1200.5, 1e-9, 'Gen OTM: Frame+Wall of the first angle')
  near(o2.find((o) => o.story === '2F')!.gen.Y!, 800.25, 1e-9, "Gen OTM: '-' columns skipped, |value| of the second angle")
  ok(o2.find((o) => o.story === '3F')!.gen.X === null, 'Gen OTM: storey missing from the table → null')
  /* 라이브 2026-10-20 실제 머리글·행 (RX) — Gen 값 = ΣV·h 와 같았다 */
  const LIVE_HEAD = ['Index', 'Load Case', 'Story', 'Level', 'Story Height', 'Angle1', 'Overturning Moment by Vertical Member Types/Frame/Value', 'Overturning Moment by Vertical Member Types/Frame/Ratio',
    'Overturning Moment by Vertical Member Types/Wall/Value', 'Overturning Moment by Vertical Member Types/Wall/Ratio', 'Angle2', 'Overturning Moment by Vertical Member Types/Frame/Value',
    'Overturning Moment by Vertical Member Types/Frame/Ratio', 'Overturning Moment by Vertical Member Types/Wall/Value', 'Overturning Moment by Vertical Member Types/Wall/Ratio']
  const live = { HEAD: LIVE_HEAD, DATA: [['1', 'RX(RS)', '4F', '6.600000', '3.300000', '0.000000', '269.902223', '1.000000', '0.000000', '0.000000', '90.000000', '-125.035871', '1.000000', '0.000000', '-0.000000'],
    ['4', 'RX(RS)', '1F', '-4.500000', '4.500000', '0.000000', '4873.723663', '1.000000', '0.000000', '0.000000', '90.000000', '-2257.6', '1.000000', '0.000000', '-0.000000']] }
  const o3 = overturning(spec, { ...analysis.story, otmX: live })
  near(o3.find((o) => o.story === '4F')!.gen.X!, 269.902223, 1e-9, 'live OTM layout: Angle1 frame value (not the Ratio column)')
  near(o3.find((o) => o.story === '1F')!.gen.X!, o3.find((o) => o.story === '1F')!.app.X!, 2, 'live OTM 1F = app ΣV·h (fixture shears)')
}

/* 2) 도면 */
pdfMake.addFonts({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } })
{
  const inp = { spec, model, title: 'STEEL FRAME', date: '2026-10-20', version: 'test', colStrongAxis: analysis.colStrongAxis }
  const lines = elevationLines(spec)
  ok(lines.length === 3 && lines.map((l) => `${l.axis}${l.line}`).join(',') === 'X8,X16,Y24', 'elevations = braced lines C, E, 5 (tutorial)')
  const sheets = buildFrameDrawingSvgs(inp)
  ok(sheets.length === lines.length + 2 && /PLAN/.test(sheets[0].name) && /SCHEDULE/.test(sheets.at(-1)!.name), 'sheets: plan + elevations + schedule')
  const def = drawingsPdfDefinition(sheets, 'frame-drawings')
  const svgs = (def.content as { svg: string }[]).map((c) => c.svg)
  ok(svgs.every((x) => /^[\t\n\r\x20-\x7e]*$/.test(x)), 'drawing text is ASCII')
  const buffer = await pdfMake.createPdf(def).getBuffer()
  const pdf = await PDFDocument.load(buffer)
  ok(pdf.getPageCount() === sheets.length, 'one A3 page per sheet')
  const { width, height } = pdf.getPage(0).getSize()
  ok(Math.abs(width - 1190.55) < 1 && Math.abs(height - 841.89) < 1, 'A3 landscape')
  writeFileSync('output/pdf/steel-frame-drawings.pdf', buffer)
  const dxf = buildFrameDxf(inp)
  ok(dxf.startsWith('0\nSECTION\n2\nHEADER') && dxf.endsWith('0\nEOF\n') && /\nLAYER\n2\nBRACE\n/.test(dxf), 'DXF R12 with layers')
  ok((dxf.match(/\nLINE\n8\nBRACE\n/g) ?? []).length >= model.elements.filter((e) => e.role === 'brace').length, 'every brace drawn in DXF (plan + elevations)')
  /* 부재표: 개수·중량 독립 계산 */
  const sched = frameSchedule(model)
  ok(sched.find((s) => s.role === 'column')!.count === 84 && sched.find((s) => s.role === 'brace')!.count === 48, 'schedule counts (columns 84, braces 48)')
  const tons = model.elements.reduce((a, e) => a + hSection(e.section).A * elementLength(model, e) * 1000 * 7.85e-9, 0)
  near(sched.reduce((a, s) => a + s.tons, 0), tons, 1e-9, 'schedule weight = Σ A·L·ρ')
  near(frameWeight(model), tons, 1e-9, 'optimizer weight = schedule weight')
  writeFileSync('output/pdf/steel-frame-drawings.dxf', dxf)
}

/* 1) 계산서 — 4개 언어 PDF·Word */
const full = { built: { spec, model, P, file: 'C:/temp/sf_model_test.mgb' }, analysis, review, design, date: '2026-10-20' }
for (const lang of ['ko', 'en', 'zh-CN', 'zh-TW'] as const) {
  setLang(lang)
  const html = buildFrameReport(full)
  const doc = new DOMParser().parseFromString(html, 'text/html') as any
  const h2 = Array.from(doc.getElementsByTagName('h2')) as any[]
  ok(h2.length === 8, `${lang}: 8 report sections`)
  ok(html.includes('GB 50017-2017') && html.includes('GB 55001-2021') && html.includes('sLCB34'), `${lang}: codes and all 34 combinations`)
  ok(html.includes(t('rp_otm')) && html.includes(t('rp_gov_member', t('fr_role_brace'), design.byRole.brace!.id)), `${lang}: overturning moment and governing brace detail`)
  ok(html.includes(design.byRole.beam!.ratio.toFixed(3)), `${lang}: beam max ratio printed`)
  ok(doc.getElementsByTagName('figure').length === 2 + 5, `${lang}: iso, ratio and 5 drawing figures`)
  const font = resolve('public/fonts', reportFontFile(doc.documentElement.getAttribute('lang') ?? ''))
  pdfMake.addFonts({ Report: { normal: font, bold: font, italics: font, bolditalics: font } })
  const face = (fontkit as any).openSync ? (fontkit as any).openSync(font) : (fontkit as any).default.openSync(font)
  const text = String(doc.documentElement.textContent ?? '')
  const missing = [...new Set([...text].filter((ch) => ch.codePointAt(0)! > 0x20 && !face.hasGlyphForCodePoint(ch.codePointAt(0)!)))]
  assert.deepEqual(missing, [], `${lang}: glyphs missing from ${font} — run scripts/subset-fonts.py`); checks++
  const def = reportPdfDefinition(doc as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any))
  const buffer = await pdfMake.createPdf(def).getBuffer()
  const pdf = await PDFDocument.load(buffer)
  ok(pdf.getPageCount() >= 12, `${lang}: PDF pages ${pdf.getPageCount()}`)
  writeFileSync(`output/pdf/steel-frame-report-${lang}.pdf`, buffer)
  let figures = 0
  const word = await reportDocxDocument(doc as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any), async (_s, w, h) => { figures++; return { data: PNG, width: w, height: h } })
  const docxBuf = await Packer.toBuffer(word)
  const zip = await JSZip.loadAsync(docxBuf), xml = await zip.file('word/document.xml')!.async('string')
  ok((xml.match(/<w:drawing>/g) ?? []).length === figures && figures === doc.getElementsByTagName('figure').length, `${lang}: Word figures`)
  ok((xml.match(/<w:tbl>/g) ?? []).length >= doc.getElementsByTagName('table').length, `${lang}: Word tables`)
  const unxml = (x: string) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const flat = unxml((xml.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, '')).join(' ')).replace(/\s+/g, '')
  for (const svg of Array.from(doc.getElementsByTagName('svg')) as any[]) svg.parentNode.removeChild(svg)
  const lost = [...new Set(String(doc.getElementsByTagName('body')[0].textContent).split(/\s+/).filter((w) => w && !flat.includes(w) && ![...w].every((ch) => flat.includes(ch))))]
  assert.deepEqual(lost.slice(0, 10), [], `${lang}: report text missing from Word`); checks++
  writeFileSync(`output/docx/steel-frame-report-${lang}.docx`, docxBuf)
  console.log(JSON.stringify({ lang, pdfPages: pdf.getPageCount(), pdfKB: Math.round(buffer.length / 1024), docxKB: Math.round(docxBuf.length / 1024) }))
}
/* 해석 전 계산서 — 모델·하중만, '없음' 문구 */
{
  setLang('ko')
  const html = buildFrameReport({ built: { spec, model, P }, analysis: null, review: null, design: null, date: '2026-10-20' })
  ok(html.includes(t('rp_no_analysis')) && html.includes(t('rp_no_design')) && html.includes(t('rp_sum_no_anal')), 'report before analysis states what is missing')
  const pdf = await PDFDocument.load(await pdfMake.createPdf(reportPdfDefinition(new DOMParser().parseFromString(html, 'text/html') as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any))).getBuffer())
  ok(pdf.getPageCount() >= 5, 'model-only report renders')
}

/* 4) 최적화 */
{
  const t0 = Date.now()
  const prop = proposeSections(spec, forces, combos, analysis.colStrongAxis)
  const ms = Date.now() - t0
  const trial = { ...spec, sections: prop.sections }, tm = buildFrame(trial)
  const d = runFrameDesign(trial, designMembers(trial, tm, analysis.colStrongAxis), forces, combos)
  for (const r of ['beam', 'column', 'brace'] as const) {
    const list = d.members.filter((m) => m.role === r)
    ok(prop.fits[r] && list.every((m) => m.ratio <= OPT_TARGET + 1e-12 && m.detailRatio <= 1 + 1e-12), `${r}: proposed ${prop.sections[r]} passes (ratio ≤ ${OPT_TARGET}, detailing ≤ 1)`)
    /* 최경량: 후보 목록에서 바로 앞(더 가벼운) 단면은 통과하지 못함 */
    const cands = candidatesFor(r), i = cands.indexOf(prop.sections[r])
    ok(i >= 0, `${r}: proposal is a candidate`)
    for (const lighter of cands.slice(0, i)) {
      const s2 = { ...trial, sections: { ...trial.sections, [r]: lighter } }, m2 = buildFrame(s2)
      const d2 = runFrameDesign(s2, designMembers(s2, m2, analysis.colStrongAxis).filter((m) => m.role === r), forces, combos)
      const pass = d2.members.every((m) => m.ratio <= OPT_TARGET && m.detailRatio <= 1)
      assert.ok(!pass, `${r}: lighter ${lighter} should not pass`)
    }
    checks++
  }
  /* 가새: 예제 HW150 은 GB/T 50011 8.4.1 세장비·판폭두께비(二级 9εk) 초과 → 두꺼운 플랜지 단면으로 */
  ok(hSection(prop.sections.brace).A > hSection(spec.sections.brace).A, 'brace grows (8.4.1 detailing governs)')
  ok(ms < 20000, `proposal time ${ms} ms`)
  const it = (n: number, w: number, ng: number, drift = true): FrameOptIter => ({ it: n, sections: spec.sections, weight: w, maxRatio: 0.9, ng, driftOk: drift })
  ok(pickBest([it(0, 60, 3), it(1, 50, 0), it(2, 45, 0, false), it(3, 48, 0)]).best.it === 3, 'pickBest: lightest passing round (drift NG excluded)')
  const nb = pickBest([it(0, 60, 3), it(1, 50, 1)])
  ok(!nb.valid && nb.best.it === 1, 'pickBest: none valid → fewest failures')
}

/* 5) 삼각 패널 대각선 보 — 기둥 K 에 방향 코사인² 로 X·Y 양쪽 기여 (독립 계산) */
{
  const tri = { ...spec, cuts: [[3, 3, 2]] as [number, number, 0 | 1 | 2 | 3][] }, tm = buildFrame(tri)
  const diag = tm.elements.filter((e) => e.diagonal)
  ok(diag.length === spec.heights.length && diag.every((e) => !e.axis), 'one diagonal beam per level, no frame axis')
  const nodes = new Map(tm.nodes.map((n) => [n.id, n]))
  const ms = designMembers(tri, tm, 'X'), byElem = new Map(ms.flatMap((m) => m.elements.map((id) => [id, m] as const)))
  /* 대각선 끝 절점에 위가 있는 기둥(아래 기둥의 위 끝) */
  const end = diag[0].n1, col = tm.elements.find((e) => e.role === 'column' && e.n2 === end)!
  const m = byElem.get(col.id)!
  const memberLen = (id: number) => tm.elements.filter((e) => e.member === id).reduce((a, e) => a + elementLength(tm, e), 0)
  let kx = 0, ky = 0
  for (const id of new Set(tm.elements.filter((e) => e.role === 'beam').map((e) => e.member))) {
    const els = tm.elements.filter((e) => e.member === id), a = els[0].n1, b = els[els.length - 1].n2
    if (a !== end && b !== end) continue
    const k = hSection(els[0].section).Ix / (memberLen(id) * 1000), p = nodes.get(a)!, q = nodes.get(b)!, L2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    kx += els[0].axis ? (els[0].axis === 'X' ? k : 0) : k * (q.x - p.x) ** 2 / L2
    ky += els[0].axis ? (els[0].axis === 'Y' ? k : 0) : k * (q.y - p.y) ** 2 / L2
  }
  const cols = tm.elements.filter((e) => e.role === 'column' && (e.n1 === end || e.n2 === end))
  const kcx = cols.reduce((a, c) => a + hSection(c.section).Ix / (elementLength(tm, c) * 1000), 0), kcy = cols.reduce((a, c) => a + hSection(c.section).Iy / (elementLength(tm, c) * 1000), 0)
  near(m.K!.x[0], kx / kcx, 1e-12, 'diagonal beam in strong-axis K (cos²)')
  near(m.K!.y[0], ky / kcy, 1e-12, 'diagonal beam in weak-axis K (sin²)')
  ok(diag.some((e) => e.n1 === end || e.n2 === end) && ky > 0 && kx > 0, 'diagonal contributes to both directions')
}
/* 6) optIter — NG = memberFails, 층간변위 NG 반영 */
{
  const x = optIter(0, spec, model, review, design)
  ok(x.ng === design.members.filter((m) => m.ratio > 1 || m.detailRatio > 1).length && x.ng === 48 && x.driftOk, 'optIter: 48 brace NG, drift OK (tutorial)')
  near(x.weight, frameWeight(model), 1e-12, 'optIter weight')
}

/* 7) 물량 산출서 — kg/m·도장 둘레 독립 계산, 층별 합 = 부재 합, Excel·CSV 내용 */
{
  setLang('ko')
  const q = frameQuantities(model)
  for (const r of q.rows) {
    const h = hSection(r.section)
    near(r.kgPerM, h.A * 7.85e-3, 1e-9, `${r.section} kg/m = A·ρ`)
    near(r.paint, (2 * h.d + 4 * h.bf - 2 * h.tw) / 1000 * r.length, 1e-9, `${r.section} paint = (2d + 4b − 2tw)·L`)
  }
  near(q.byStory.reduce((a, s) => a + s.t.column + s.t.beam + s.t.brace, 0), q.memberT, 1e-9, 'storey weights sum to member weight')
  ok(q.byStory.length === 4, 'four storeys')
  near(q.orderT, q.memberT * 1.05, 1e-12, 'order weight = members × 1.05')
  near(q.grossArea, model.floorArea * 4, 1e-9, 'gross area = floor area × 4 levels')
  const sheet = frameQuantitySheet(spec, q), parts = xlsxParts(sheet), xml = parts['xl/worksheets/sheet1.xml']
  ok(xml.includes(t('fr_q_title')) && xml.includes('HW 150x150x7/10') && xml.includes(`<v>${q.memberT.toFixed(3)}</v>`), 'xlsx: title, sections, total weight as a number cell')
  ok(/s="2"/.test(xml) && /s="1"/.test(xml), 'xlsx: title and header styles')
  const csv = quantityCsv(sheet)
  ok(csv.startsWith('﻿') && csv.includes(t('fr_q_by_story')), 'csv: BOM and storey table')
}

/* 8) 상세 계산서 — 캡처 목록, 캡처 실행(가짜 Gen), Gen 그림(PNG data URL)·Gen 표가 Word·PDF 에 들어감 */
{
  const shots = captureShots(spec, model, design)
  ok(shots.map((x) => x.key).join(',') === 'model_iso,model_solid,plan,elev_XC,elev_XE,elev_Y5,reaction,displacement,moment,axial,stress', `capture list ${shots.map((x) => x.key).join(',')}`)
  const elev = shots.find((x) => x.key === 'elev_XC')!.capture.ACTIVE as { E_LIST: number[] }
  ok(elev.E_LIST.every((id) => { const e = model.elements.find((x) => x.id === id)!; const ns = [e.n1, e.n2].map((n) => model.nodes.find((x) => x.id === n)!); return ns.every((n) => Math.abs(n.y - 8) < 1e-9) }), 'grid C elevation activates only elements on y = 8')
  ok(comboName('sLCB30(max)') === 'sLCB30' && (shots.find((x) => x.key === 'moment')!.resultGraphic!.LOAD_CASE_COMB as any).NAME === comboName(design.byRole.beam!.worst.combo), 'moment diagram uses the governing beam combination')
  const calls: [string, any][] = []
  const fake = async (_m: string, path: string, body?: any) => {
    calls.push([path, body])
    if (path === '/view/RESULTGRAPHIC' && body.Argument.CURRENT_MODE === 'beamstresses') throw new Error('Invalid Post Mode')
    return { message: 'MIDAS GEN NX command complete' }
  }
  const res = await captureGen(fake as any, shots, 'C:/temp', 'T')
  ok(res.length === shots.length && res.filter((r) => !r.ok).map((r) => r.key).join() === 'stress', 'one failed capture is recorded, the rest continue')
  ok(calls.at(-1)![0] === '/view/CAPTURE' && calls.at(-1)![1].Argument.SET_MODE === undefined && calls.at(-1)![1].Argument.ZOOM_LEVEL === 100, 'ends with ISO zoom fit')
  ok(calls.filter(([p]) => p === '/view/CAPTURE').every(([, b]) => /^C:\/temp\/sf_cap_T_/.test(b.Argument.EXPORT_PATH)), 'captures go to the save folder')
  let threw = false
  try { await captureGen((async () => { throw new RangeError('cancel') }) as any, shots, 'C:/temp', 'T', { fatal: (e) => e instanceof RangeError }) } catch { threw = true }
  ok(threw, 'fatal (cancel) error is rethrown')
  /* 상세 계산서 HTML → Word·PDF: Gen PNG 와 Gen 원본 표 */
  setLang('ko')
  const png = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
  const gen = { figures: shots.filter((x) => x.key !== 'stress').map((x) => ({ key: x.key, section: x.section, caption: x.key, src: png, width: 1200, height: 900 })), failed: ['stress'] }
  const html = buildFrameReport({ ...full, gen })
  ok(html.includes(t('rp_title_detail')) && html.includes(t('rp_gen_t_drift', 'RX')) && html.includes(t('rp_gen_t_torsion', 'RY')) && html.includes(t('rp_gen_failed', 'stress')), 'detailed report: title, Gen tables, missing capture noted')
  const doc = new DOMParser().parseFromString(html, 'text/html') as any
  const word = await reportDocxDocument(doc as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any), async () => null)
  const zip = await JSZip.loadAsync(await Packer.toBuffer(word)), xml = await zip.file('word/document.xml')!.async('string')
  ok((xml.match(/<w:drawing>/g) ?? []).length === gen.figures.length, `Word embeds the ${gen.figures.length} Gen PNG figures`)
  ok(Object.keys(zip.files).filter((f) => f.startsWith('word/media/')).length >= 1, 'Word media part present')
  const font = resolve('public/fonts', reportFontFile('ko'))
  pdfMake.addFonts({ Report: { normal: font, bold: font, italics: font, bolditalics: font } })
  const def = reportPdfDefinition(doc as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any))
  ok(JSON.stringify(def.content).includes('"image":"data:image/png;base64,'), 'PDF definition carries the Gen PNG images')
  const pdf = await PDFDocument.load(await pdfMake.createPdf(def).getBuffer())
  ok(pdf.getPageCount() > 30, 'detailed PDF renders')
}

/* 산출물 선행 조건 — 단계 안내·카드·실행 함수가 같이 쓰는 outputBlocker (고정 상태로 검사) + 키 순서와 무관한 입력 변경 판정 */
{
  const { outputBlocker, frameStale } = await import('../src/frame/state')
  const built = { spec, model, P } as any
  const st = (o: Record<string, unknown>) => ({ built, analysis: null, design: null, busy: false, stale: false, connected: true, ...o }) as any
  const all = ['report', 'detail', 'drawings', 'quantities', 'csv'] as const
  const full = { analysis, design }
  ok(all.every((o) => outputBlocker(st({ ...full, busy: true }), o) === 'busy') && outputBlocker(st({ busy: true })) === 'busy', 'outputs: busy or a confirm dialog blocks the stage and every export')
  ok(all.every((o) => outputBlocker(st({ built: null }), o) === 'flow_need_model'), 'outputs: no model blocks every output')
  ok(all.every((o) => outputBlocker(st({ ...full, stale: true }), o) === 'fr_out_stale') && outputBlocker(st({ stale: true })) === 'fr_out_stale', 'outputs: edited inputs block every output, even with old results')
  ok(all.every((o) => outputBlocker(st({ ...full, stale: true, built: { ...built, trial: true } }), o) === 'fr_out_trial'), 'outputs: an interrupted optimisation says so instead of "inputs changed"')
  ok(['report', 'drawings', 'quantities'].every((o) => outputBlocker(st({ connected: false }), o as any) === null) && outputBlocker(st({})) === null, 'outputs: report/drawings/quantities need only the model (no Gen connection)')
  ok(outputBlocker(st({}), 'detail') === 'fr_detail_need_anal' && outputBlocker(st({ analysis }), 'detail') === null, 'outputs: detailed report waits for the analysis')
  ok(outputBlocker(st({ analysis, connected: false }), 'detail') === 'flow_need_connection' && outputBlocker(st({ analysis, connected: false })) === null, 'outputs: detailed report needs the Gen connection (card only, not the stage)')
  ok(outputBlocker(st({ analysis }), 'csv') === 'fr_csv_need_design' && outputBlocker(st(full), 'csv') === null, 'outputs: check CSV waits for the design checks')
  const reordered = Object.fromEntries(Object.entries(structuredClone(spec)).reverse()) as any
  reordered.sections = Object.fromEntries(Object.entries(spec.sections).reverse())
  ok(!frameStale({ draft: reordered, built }) && frameStale({ draft: { ...spec, heights: spec.heights.map((h, i) => (i ? h : h + 0.3)) }, built }), 'stale: same values in another key order are not a change; a real edit is')
}

console.log(`Frame report/drawings/optimisation: ${checks} checks passed (4 languages PDF + Word, ${elevationLines(spec).length + 2} drawing sheets, OTM, lightest sections)`)
