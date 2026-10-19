/* Render the same PDF definition used in the browser, using the bundled font.
   Run node --import tsx scripts/verify-pdf.ts. No Gen/API key required. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import pdfMake from 'pdfmake'
import { PDFDocument } from 'pdf-lib'
import { drawingsPdfDefinition, reportFontFile, reportPdfDefinition } from '../src/report/pdf'
import { buildDrawingSvgs } from '../src/drawing/drawings'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { reportDocxDocument, reportDocxFont } from '../src/report/docx'
import * as fontkit from 'fontkit'
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { runConnections } from '../src/domain/connections'
import { runDesign } from '../src/domain/design'
import { FIXTURE, decodeResults, fixtureFor } from './tw-golden'
import {additionSpec,phase5Spec,phase6Spec} from './addition-spec'
import {addKo,addEn,addTW,addCN} from '../src/i18n/dict/additions'
import type { ReportInput } from '../src/report/report'
import { krSynthetic } from './kr-synth'
import { defaultSpecFor } from '../src/domain/types'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { buildReport } = await import('../src/report/report')
const { setLang, t } = await import('../src/i18n')
pdfMake.setLocalAccessPolicy((path) => path.startsWith(resolve('public/fonts')))
pdfMake.setUrlAccessPolicy(() => false)
mkdirSync('output/pdf', { recursive: true }); mkdirSync('output/docx', { recursive: true })
/* 1×1 PNG — Node 에는 캔버스가 없어 그림 자리만 확인 */
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const fx = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString())
const model = buildPortal(fx.spec), loads = buildLoadPayloads(fx.spec, model), results = decodeResults(fx.results)
const input: ReportInput = { built: { spec: fx.spec, model, info: loads.info, cases: Object.values(loads.STLD).map((v: any) => v.NAME), combos: Object.keys(loads.info.comboKind).length, comboNames: Object.keys(loads.info.comboKind) }, reactions: fx.reactions, design: runDesign(fx.spec, model, loads.info, results), connections: runConnections(fx.spec, model, loads.info, results) }
/* KR — 합성 결과(경로·글꼴 확인용) */
const krSpec = defaultSpecFor('KR'), kr = krSynthetic(krSpec)
const krInput: ReportInput = { built: { spec: krSpec, model: kr.model, info: kr.loads.info, cases: kr.cases, combos: kr.combos.length, comboNames: kr.combos }, reactions: fx.reactions, design: runDesign(krSpec, kr.model, kr.loads.info, kr.results), connections: runConnections(krSpec, kr.model, kr.loads.info, kr.results) }
/* CN — 라이브 정답 세트 (GB 51022 문구·隅撑 등 CN 전용 글자) */
const cfx = JSON.parse(gunzipSync(readFileSync(fixtureFor('CN'))).toString())
const cModel = buildPortal(cfx.spec), cLoads = buildLoadPayloads(cfx.spec, cModel), cRes = decodeResults(cfx.results)
const cnInput: ReportInput = { built: { spec: cfx.spec, model: cModel, info: cLoads.info, cases: Object.values(cLoads.STLD).map((v: any) => v.NAME), combos: Object.keys(cLoads.info.comboKind).length, comboNames: Object.keys(cLoads.info.comboKind) }, reactions: cfx.reactions, design: runDesign(cfx.spec, cModel, cLoads.info, cRes), connections: runConnections(cfx.spec, cModel, cLoads.info, cRes) }
const aSpec=additionSpec(defaultSpecFor('TW')),aModel=buildPortal(aSpec),aLoads=buildLoadPayloads(aSpec,aModel)
const additionInput:ReportInput={built:{spec:aSpec,model:aModel,info:aLoads.info,cases:Object.values(aLoads.STLD).map((v:any)=>v.NAME),combos:Object.keys(aLoads.info.comboKind).length,comboNames:Object.keys(aLoads.info.comboKind)},reactions:null,design:null,connections:null}
const pSpec=phase5Spec(defaultSpecFor('TW')),pModel=buildPortal(pSpec),pLoads=buildLoadPayloads(pSpec,pModel)
const phase5Input:ReportInput={built:{spec:pSpec,model:pModel,info:pLoads.info,cases:Object.values(pLoads.STLD).map((v:any)=>v.NAME),combos:Object.keys(pLoads.info.comboKind).length,comboNames:Object.keys(pLoads.info.comboKind)},reactions:null,design:null,connections:null}
const qSpec=phase6Spec(defaultSpecFor('TW')),qModel=buildPortal(qSpec),qLoads=buildLoadPayloads(qSpec,qModel)
const phase6Input:ReportInput={built:{spec:qSpec,model:qModel,info:qLoads.info,cases:Object.values(qLoads.STLD).map((v:any)=>v.NAME),combos:Object.keys(qLoads.info.comboKind).length,comboNames:Object.keys(qLoads.info.comboKind)},reactions:null,design:null,connections:null}
for (const [code, inp] of [['TW', input], ['KR', krInput], ['CN', cnInput], ['ADDITIONS',additionInput],['PHASE5',phase5Input],['PHASE6',phase6Input]] as const) for (const lang of ['ko', 'en', 'zh-TW', 'zh-CN'] as const) {
  setLang(lang)
  const html = buildReport(inp)
  /* CN: 선택 라벨(GB 51022)과 별개로 '설계 검토' 근거는 실제 강재 규범, 머리는 판본 포함 */
  if (code === 'CN') { assert.ok(html.includes(t('code_CN_check')) && t('code_CN_check').startsWith('GB 51022-2015'), `${lang}: CN design-check basis`); assert.ok(html.includes('GB 51022-2015 · GB 50017-2017'), `${lang}: CN basis with editions`) }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  /* 언어별 글꼴 + 계산서의 모든 글자가 축소 글꼴에 있는지 (없으면 PDF 에 빈 네모) */
  const htmlLang = (doc as any).documentElement.getAttribute('lang') ?? ''
  const font = resolve('public/fonts', reportFontFile(htmlLang))
  pdfMake.addFonts({ Report: { normal: font, bold: font, italics: font, bolditalics: font } })
  const face = (fontkit as any).openSync ? (fontkit as any).openSync(font) : (fontkit as any).default.openSync(font)
  const text = String((doc as any).documentElement.textContent ?? '') + Object.values(({ko:addKo,en:addEn,'zh-TW':addTW,'zh-CN':addCN})[lang]).join(' ')
  const missing = [...new Set([...text].filter((ch) => ch.codePointAt(0)! > 0x20 && !face.hasGlyphForCodePoint(ch.codePointAt(0)!)))]
  assert.deepEqual(missing, [], `${lang}: glyphs missing from ${font}`)
  assert.equal(reportFontFile(htmlLang), lang === 'zh-TW' ? 'report-tc.otf' : lang === 'zh-CN' ? 'report-sc.otf' : 'report-kr.otf', `${lang} (${htmlLang}) font`)
  const def = reportPdfDefinition(doc as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any))
  const buffer = await pdfMake.createPdf(def).getBuffer()
  const pdf = await PDFDocument.load(buffer)
  assert.ok(pdf.getPageCount() >= (code==='ADDITIONS'?2:8))
  const path = `output/pdf/steel-report-${code}-${lang}.pdf`
  writeFileSync(path, buffer)
  /* Word: 같은 HTML → .docx. 제목 스타일·표·그림 자리·본문 글자가 모두 들어갔는지 */
  let figures = 0
  const word = await reportDocxDocument(doc as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any), async (_svg, width, height) => { figures++; return { data: PNG, width, height } })
  const docxBuf = await Packer.toBuffer(word)
  const zip = await JSZip.loadAsync(docxBuf), xml = await zip.file('word/document.xml')!.async('string')
  const tblCount = (xml.match(/<w:tbl>/g) ?? []).length, drawings = (xml.match(/<w:drawing>/g) ?? []).length
  assert.equal(drawings, figures, `${code}/${lang}: every figure becomes an image`)
  assert.equal(figures, (doc as any).getElementsByTagName('figure').length, `${code}/${lang}: all figures rasterized`)
  assert.ok(tblCount >= (doc as any).getElementsByTagName('table').length, `${code}/${lang}: every report table is a Word table`)
  for (const style of ['Title', 'Heading1']) assert.ok(xml.includes(`w:val="${style}"`), `${code}/${lang}: ${style} style used`)
  const styles = await zip.file('word/styles.xml')!.async('string')
  assert.ok(styles.includes(reportDocxFont(htmlLang)), `${code}/${lang}: language font in styles`)
  const unxml = (x: string) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const docText = unxml((xml.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, '')).join(' '))
  const bodyEl = (doc as any).getElementsByTagName('body')[0]
  for (const svg of Array.from((doc as any).getElementsByTagName('svg')) as any[]) svg.parentNode.removeChild(svg)
  // Cell texts touch in textContent ('박공'+'스팬'), so compare with all whitespace removed; split wide tables reorder columns,
  // so a token may also be satisfied piecewise by the cell texts it is made of
  const flat = docText.replace(/\s+/g, '')
  const lost = [...new Set(String(bodyEl.textContent).split(/\s+/).filter((w) => w && !flat.includes(w) && ![...w].every((ch) => flat.includes(ch))))]
  assert.deepEqual(lost.slice(0, 10), [], `${code}/${lang}: report text missing from Word`)
  writeFileSync(`output/docx/steel-report-${code}-${lang}.docx`, docxBuf)
  console.log(JSON.stringify({ path, font: font.split(/[\\/]/).pop(), pages: pdf.getPageCount(), bytes: buffer.length }))
}

/* 도면 PDF: DXF 와 같은 시트를 A3 가로 한 장씩, 선 굵기는 pt 환산(vector-effect 제거) */
{
  /* 도면 글자는 ASCII — PDF 표준 Helvetica (CJK 글꼴 불필요) */
  pdfMake.addFonts({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } })
  for (const [code, inp] of [['TW', input], ['CN', cnInput], ['PHASE6', phase6Input]] as const) {
    const sheets = buildDrawingSvgs({ spec: inp.built.spec, model: inp.built.model, connections: inp.connections, title: 'STEEL PORTAL FACTORY' })
    const def = drawingsPdfDefinition(sheets, `drawings-${code}`)
    const svgs = (def.content as { svg: string }[]).map((c) => c.svg)
    assert.ok(svgs.every((x) => /^[\t\n\r\x20-\x7e]*$/.test(x)), `${code}: drawing text is ASCII`)
    assert.ok(svgs.every((x) => !x.includes('vector-effect') && /width="[\d.]+" height="[\d.]+"/.test(x)), `${code}: drawing SVG prepared for PDF`)
    const buffer = await pdfMake.createPdf(def).getBuffer()
    const pdf = await PDFDocument.load(buffer)
    assert.equal(pdf.getPageCount(), sheets.length, `${code}: one A3 page per drawing sheet`)
    const { width, height } = pdf.getPage(0).getSize()
    assert.ok(Math.abs(width - 1190.55) < 1 && Math.abs(height - 841.89) < 1, `${code}: A3 landscape`)
    writeFileSync(`output/pdf/steel-drawings-${code}.pdf`, buffer)
    console.log(JSON.stringify({ drawings: code, pages: sheets.length, bytes: buffer.length }))
  }
}
