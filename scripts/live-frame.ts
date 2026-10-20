/* 다층 강골조 라이브 실행 — 기준 예제(docs/tutorial-cn-braced-frame.md)를 Gen NX 에 만들고 해석·층 표·부재 검토 후 목표값과 대조.
   Run: npx tsx scripts/live-frame.ts [--snow 0.45] [--tri] [--opt] < /dev/null   (키: stdin → MAPI_KEY → .env)
   --opt: 단면 최적화 반복(화면과 같은 optimizeLoop)을 Gen 에서 실행하고 최종 상태 계산서(ko HTML·PDF)를 output/frame 에 저장
   현재 문서를 C:/temp 에 백업 저장한 뒤 새 문서에서 진행. 결과: output/frame/live-<시각>.json
   Gen 단계는 화면과 같은 src/frame/run.ts 를 쓴다. 주의(gen-api-cautions.md): Assign 본문 DELETE·STEELCODECHECK 호출 금지. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'
import { buildFrame } from '../src/frame/geometry'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { framePayloads } from '../src/frame/gen'
import { n, type Request } from '../src/frame/results'
import { designMembers, runFrameDesign } from '../src/frame/design'
import { overturning, storyReview } from '../src/frame/story'
import { analyze, collectAnalysis, collectForces, expectOk, fitView, runRound, sendFrame, type FrameRound } from '../src/frame/run'
import { optIter, optSummary, optimizeLoop, sectionsKey, type FrameSections } from '../src/frame/optimize'
import type { FrameSpec } from '../src/frame/types'

/* 화면(src/mapi/client.ts)과 같은 대기 한도 — 기본 3분, 해석만 15분 */
const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 3 * 60 * 1000 })
const req: Request = (m, p, b) => client.request(m, p, b as any, p.toLowerCase() === '/doc/anal' ? { timeout: 15 * 60 * 1000 } : undefined) as Promise<any>
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
const log = (...a: unknown[]) => console.log(...a)
const evidence: Record<string, unknown> = { stamp }

/* --snow <s0> : 예제에 지붕 적설을 더해 적설 케이스·조합(GB 50009 5.3.3, GB 55001)을 확인 */
const snowArg = process.argv.indexOf('--snow'), s0 = snowArg > 0 ? Number(process.argv[snowArg + 1]) : 0
const base = s0 > 0 ? { ...TUTORIAL_SPEC, loads: { ...TUTORIAL_SPEC.loads, roofSnow: s0 } } : TUTORIAL_SPEC
/* --tri : 오른쪽 위 패널(3,3)의 우상 모서리를 대각선으로 잘라 삼각 바닥(FBLA 3절점)·대각선 보를 확인 */
const spec = process.argv.includes('--tri') ? { ...base, cuts: [[3, 3, 2]] as [number, number, 0 | 1 | 2 | 3][] } : base
const model = buildFrame(spec), P = framePayloads(spec, model)
log(`model: nodes ${model.nodes.length}, elements ${model.elements.length}, supports ${model.supports.length}, combos ${P.combos.length}`)
for (const w of P.wind) log(`wind ${w.dir}: T1 ${w.T1.toFixed(3)} s, base ${w.base.toFixed(2)} kN, βz ${w.stories.map((s) => s.betaz.toFixed(3)).join('/')}`)

try {
  expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_backup_${stamp}.mgbx` }), 'backup')
  const counts = await sendFrame(req, P, model)
  log('sent / readback', counts, '· ISO zoom fit', await fitView(req, `C:/temp/sf_view_${stamp}.png`))
  evidence.counts = counts

  expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_frame_${stamp}.mgbx` }), 'save model')
  const t0 = Date.now()
  await analyze(req)
  log(`analysis ${((Date.now() - t0) / 1000).toFixed(1)} s`)

  const A = await collectAnalysis(req, spec, model, P, (m) => log(`  ${m}`))
  const { story, colStrongAxis } = A
  log('equilibrium', A.equilibrium)
  evidence.equilibrium = A.equilibrium
  evidence.story = story
  evidence.colStrongAxis = colStrongAxis
  if (Object.keys(A.missing).length) log('missing tables', A.missing)

  const eigen = story.eigen
  if (eigen) log(`periods ${eigen.periods.slice(0, 4).map((t) => t.toFixed(4)).join(' / ')} s (target T1 1.044) · mass X ${eigen.massX.at(-1)}% Y ${eigen.massY.at(-1)}%`)
  const { mass, shearX: sx, shearY: sy, driftX: dx, driftY: dy, stiffX: kx } = story
  if (mass) log('story mass (t)', mass.map((r) => `${r.Story}:${(+r['X-DIR']).toFixed(2)}`).join(' '), '| target Roof 84.69 · 4F 231.55 · 3F 231.55 · 2F 232.64')
  if (sx) log('RX shear (kN)', sx.map((r) => `${r.Story}:${(+r['Shear Force/X']).toFixed(1)}/${(+r['Weight Sum/X']).toFixed(0)}/${(+r['Story Shear Force Coefficient/X']).toFixed(4)}`).join(' '), '| target 1F 515.23 / 7653 / 0.0673')
  if (sy) log('RY shear (kN)', sy.map((r) => `${r.Story}:${(+r['Shear Force/Y']).toFixed(1)}/${(+r['Story Shear Force Coefficient/Y']).toFixed(4)}`).join(' '), '| target 1F 279.98 / 0.0366')
  const driftCol = (r: Record<string, string>) => r['Maximum Drift of All Vertical Elements/Story Drift Ratio']
  if (dx) log('RX drift ratio', dx.map((r) => `${r.Story}:1/${Math.round(1 / n(driftCol(r)))}`).join(' '), '| target 4F 1/7177 · 3F 1/3749 · 2F 1/2782 · 1F 1/2357')
  if (dy) log('RY drift ratio', dy.map((r) => `${r.Story}:1/${Math.round(1 / n(driftCol(r)))}`).join(' '))
  if (kx) log('RX stiffness (kN/m)', kx.map((r) => `${r.Story}:${(+r['Story Stiffness']).toFixed(0)}`).join(' '), '| target 4F 237122 · 3F 418193 · 2F 481185 · 1F 354125 (N/mm)')
  log(`column strong axis bends in ${colStrongAxis} frames`)

  const t1 = Date.now()
  const forces = await collectForces(req, model, P, (d, t) => log(`  BEAMFORCE ${d}/${t} combos`))
  const loadNames = new Set<string>(); for (const m of forces.values()) for (const k of m.keys()) loadNames.add(k)
  log(`element forces: ${forces.size} elements, loads [${[...loadNames].slice(0, 6).join(', ')} …] (${loadNames.size}) in ${((Date.now() - t1) / 1000).toFixed(1)} s`)

  /* 오프라인 회귀용 요소력 보관 (scripts/fixtures/cn-frame.json.gz 로 복사해 고정) */
  const { gzipSync } = await import('node:zlib')
  mkdirSync('output/frame', { recursive: true })
  writeFileSync(`output/frame/forces-${stamp}.json.gz`, gzipSync(JSON.stringify({ stamp, colStrongAxis, story, equilibrium: A.equilibrium,
    forces: [...forces].map(([id, m]) => [id, [...m].map(([load, st]) => [load, st.map((p) => [p.N, p.Vx, p.Vy, p.Mx, p.My])])]) })))

  const review = storyReview(spec, model, story, colStrongAxis)
  for (const it of review) log(`story ${it.key}${it.dir ? ' ' + it.dir : ''} [${it.status}] ${it.clause}: ${it.rows.map((r) => `${r.story} ${it.key === 'drift' ? '1/' + Math.round(1 / r.value) : r.value.toFixed(3)}${r.status !== 'ok' ? '(' + r.status + ')' : ''}`).join(' · ')}`)
  evidence.review = review

  const members = designMembers(spec, model, colStrongAxis)
  const design = runFrameDesign(spec, members, forces, P.combos.map((c) => ({ name: c.name, seismic: c.seismic })))
  for (const role of ['beam', 'column', 'brace'] as const) {
    const m = design.byRole[role]!
    log(`${role}: max ratio ${m.ratio.toFixed(3)} (member ${m.id}, elems ${m.elements.join('+')}, story ${m.story}, ${m.worst.combo}, ${m.worst.governing}) μx ${m.muX.toFixed(3)} μy ${m.muY.toFixed(3)} detail ${m.detailRatio.toFixed(3)} class S${m.st.cls}`)
  }
  log('target (Gen fig 5-12): beam 0.912 sLCB14 · column 0.455 sLCB20 · brace 0.689 sLCB30 (no ψ)')
  evidence.design = design.members.map((m) => ({ id: m.id, role: m.role, story: m.story, elements: m.elements, L: m.L, muX: m.muX, muY: m.muY, ratio: m.ratio, combo: m.worst.combo, governing: m.worst.governing, detail: m.detailRatio, items: m.worst.items }))
  evidence.model = `C:/temp/sf_frame_${stamp}.mgbx`

  /* 전도모멘트 — Gen OVERTURNING_MOMENT 머리글·값 + 앱 ΣV·h */
  for (const k of ['otmX', 'otmY'] as const) { const tb = story[k]; if (tb) log(`${k} HEAD`, JSON.stringify(tb.HEAD), '\n  rows', JSON.stringify(tb.DATA.slice(0, 6))) }
  const otm = overturning(spec, story)
  log('overturning (Gen | ΣV·h) kN·m', otm.map((o) => `${o.story}: X ${o.gen.X?.toFixed(1) ?? '-'} | ${o.app.X?.toFixed(1)}  Y ${o.gen.Y?.toFixed(1) ?? '-'} | ${o.app.Y?.toFixed(1)}`).join(' · '))
  evidence.otm = otm

  if (process.argv.includes('--opt')) {
    const combos = P.combos.map((c) => ({ name: c.name, seismic: c.seismic }))
    /* 한 회 = src/frame/run.ts runRound (화면 최적화와 같은 순서), 기록 = optIter */
    type St = Pick<FrameRound, 'spec' | 'model' | 'P' | 'forces' | 'review' | 'design'> & { A: FrameRound['analysis'] }
    let cur: St = { spec, model, P, A, forces, review, design }
    const iterOf = (c: St, it: number) => optIter(it, c.spec, c.model, c.review, c.design)
    const runSpec = async (s2: FrameSpec, tag: string): Promise<St> => {
      const r = await runRound(req, s2, { viewPath: `C:/temp/sf_view_${stamp}_${tag}.png`, save: async () => expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_frame_${stamp}_${tag}.mgbx` }), 'save opt model'), log: (m) => log(`  ${m}`) })
      return { ...r, A: r.analysis }
    }
    const show = (c: St, it: number) => { const x = iterOf(c, it); log(`  round ${it}: ${sectionsKey(x.sections)} · ${x.weight.toFixed(2)} t · max ${x.maxRatio.toFixed(3)} · NG ${x.ng} · drift ${x.driftOk ? 'OK' : 'NG'} · T1 ${c.A.story.eigen?.periods[0]?.toFixed(3)} s`); return x }
    const t2 = Date.now()
    show(cur, 0)
    const r = await optimizeLoop({
      start: iterOf(cur, 0),
      state: () => ({ spec: cur.spec, forces: cur.forces, combos, colStrongAxis: cur.A.colStrongAxis }),
      onPropose: (it, p) => log(`opt round ${it} proposal ${sectionsKey(p.sections)} ratio ${JSON.stringify(p.ratio)} fits ${JSON.stringify(p.fits)}`),
      evaluate: async (sec: FrameSections, it) => { cur = await runSpec({ ...cur.spec, sections: { ...sec } }, `opt${it}`); return show(cur, it) },
    })
    if (sectionsKey(r.best.sections) !== sectionsKey(cur.spec.sections)) { log(`restoring best round ${r.best.it}`); cur = await runSpec({ ...cur.spec, sections: { ...r.best.sections } }, 'optbest') }
    const D = cur.design, ratio = { column: D.byRole.column?.ratio ?? null, beam: D.byRole.beam?.ratio ?? null, brace: D.byRole.brace?.ratio ?? null }
    const opt = optSummary(cur.model, r.iters, iterOf(cur, r.best.it), ratio, r.valid ? r.end : 'none_valid')
    log(`optimisation ${opt.end} in ${((Date.now() - t2) / 1000).toFixed(0)} s: ${opt.weightBefore.toFixed(2)} t → ${opt.weightAfter.toFixed(2)} t`, opt.rows.map((x) => `${x.role} ${x.before} → ${x.after} (${x.ratio?.toFixed(3)})`).join(' · '))
    evidence.opt = opt

    /* 최종 상태 계산서 (ko) — HTML + PDF */
    ;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
    const { setLang } = await import('../src/i18n')
    setLang('ko')
    const { buildFrameReport } = await import('../src/frame/report')
    const html = buildFrameReport({ built: { spec: cur.spec, model: cur.model, P: cur.P, file: `C:/temp/sf_frame_${stamp}_optbest.mgbx` }, analysis: cur.A, review: cur.review, design: cur.design, opt })
    writeFileSync(`output/frame/report-${stamp}.html`, html)
    const [{ DOMParser, XMLSerializer }, pdfMake, { PDFDocument }, { reportPdfDefinition }, { resolve }] = await Promise.all([import('@xmldom/xmldom'), import('pdfmake').then((m) => m.default), import('pdf-lib'), import('../src/report/pdf'), import('node:path')])
    const font = resolve('public/fonts/report-kr.otf')
    pdfMake.setLocalAccessPolicy((p: string) => p.startsWith(resolve('public/fonts'))); pdfMake.setUrlAccessPolicy(() => false)
    pdfMake.addFonts({ Report: { normal: font, bold: font, italics: font, bolditalics: font } })
    const buf = await pdfMake.createPdf(reportPdfDefinition(new DOMParser().parseFromString(html, 'text/html') as unknown as Document, (el) => new XMLSerializer().serializeToString(el as any))).getBuffer()
    writeFileSync(`output/frame/report-${stamp}.pdf`, buf)
    log(`report: output/frame/report-${stamp}.pdf (${(await PDFDocument.load(buf)).getPageCount()} pages)`)
  }
} finally {
  mkdirSync('output/frame', { recursive: true })
  writeFileSync(`output/frame/live-${stamp}.json`, JSON.stringify(evidence, null, 2))
  log(`evidence: output/frame/live-${stamp}.json`)
}
