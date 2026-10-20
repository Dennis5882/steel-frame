/* 상세 계산서 라이브 — 예제 모델을 Gen 에 만들고(runRound) 화면과 같은 캡처 목록(captureShots)을 captureGen 으로 찍은 뒤,
   저장 폴더(C:/temp)의 PNG 를 읽어 상세 계산서 Word(ko)를 만든다. 브라우저의 폴더 읽기 대신 Node fs 를 쓴다.
   Node 에는 캔버스가 없어 앱 자체 SVG 그림(도면·등각)은 빠진다(화면에서는 들어감).
   Run: npx tsx scripts/live-detail.ts < /dev/null   결과: output/frame/report-detail-<시각>.docx */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { MidasClient } from 'midas-nx'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { Packer } from 'docx'
import { readMapiKey } from './mapi-key'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { captureGen, expectOk, runRound } from '../src/frame/run'
import { captureShots } from '../src/frame/captures'
import type { Request } from '../src/frame/results'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { setLang, t } = await import('../src/i18n')
setLang('ko')
const { buildFrameReport } = await import('../src/frame/report')
const { reportDocxDocument } = await import('../src/report/docx')

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 15 * 60 * 1000 })
const req: Request = (m, p, b) => client.request(m, p, b as any) as Promise<any>
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_backup_${stamp}.mgbx` }), 'backup')
const r = await runRound(req, TUTORIAL_SPEC, { viewPath: `C:/temp/sf_view_${stamp}.png`, save: async () => expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_frame_${stamp}_detail.mgbx` }), 'save'), log: (m) => console.log(' ', m) })
console.log(`model ${r.model.nodes.length} nodes · T1 ${r.analysis.story.eigen?.periods[0]?.toFixed(4)} s · beam ${r.design.byRole.beam?.ratio.toFixed(3)}`)
const shots = captureShots(r.spec, r.model, r.design)
const t0 = Date.now()
const res = await captureGen(req, shots, 'C:/temp', stamp, { onShot: (i, n, k) => console.log(`  capture ${i + 1}/${n} ${k}`) })
console.log(`captures ${res.filter((x) => x.ok).length}/${res.length} in ${((Date.now() - t0) / 1000).toFixed(1)} s`, res.filter((x) => !x.ok).map((x) => `${x.key}: ${x.error}`))
const figures = [], failed: string[] = []
for (const [i, x] of res.entries()) {
  const s = shots[i], caption = (t as any)(s.caption[0], ...s.caption.slice(1))
  try {
    const buf = readFileSync(`C:/temp/${x.file}`)
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20) // PNG IHDR
    figures.push({ key: s.key, section: s.section, caption, src: `data:image/png;base64,${buf.toString('base64')}`, width: w, height: h })
  } catch { failed.push(caption) }
}
const html = buildFrameReport({ built: { spec: r.spec, model: r.model, P: r.P, file: `C:/temp/sf_frame_${stamp}_detail.mgbx` }, analysis: r.analysis, review: r.review, design: r.design, gen: { figures, failed } })
const doc = await reportDocxDocument(new DOMParser().parseFromString(html, 'text/html') as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any), async () => null)
mkdirSync('output/frame', { recursive: true })
const out = `output/frame/report-detail-${stamp}.docx`
writeFileSync(out, await Packer.toBuffer(doc))
writeFileSync(out.replace(/\.docx$/, '.html'), html)
console.log(`detailed report: ${out} (${figures.length} Gen figures, failed ${failed.length})`)
