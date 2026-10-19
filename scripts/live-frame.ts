/* 다층 강골조 라이브 실행 — 기준 예제(docs/tutorial-cn-braced-frame.md)를 Gen NX 에 만들고 해석·층 표·부재 검토 후 목표값과 대조.
   Run: npx tsx scripts/live-frame.ts < /dev/null   (키: stdin → MAPI_KEY → .env)
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
import { storyReview } from '../src/frame/story'
import { analyze, collectAnalysis, collectForces, expectOk, sendFrame } from '../src/frame/run'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 15 * 60 * 1000 })
const req: Request = (m, p, b) => client.request(m, p, b as any) as Promise<any>
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
const log = (...a: unknown[]) => console.log(...a)
const evidence: Record<string, unknown> = { stamp }

const spec = TUTORIAL_SPEC, model = buildFrame(spec), P = framePayloads(spec, model)
log(`model: nodes ${model.nodes.length}, elements ${model.elements.length}, supports ${model.supports.length}, combos ${P.combos.length}`)
for (const w of P.wind) log(`wind ${w.dir}: T1 ${w.T1.toFixed(3)} s, base ${w.base.toFixed(2)} kN, βz ${w.stories.map((s) => s.betaz.toFixed(3)).join('/')}`)

try {
  expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_backup_${stamp}.mgbx` }), 'backup')
  const counts = await sendFrame(req, P, model)
  log('sent / readback', counts)
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
} finally {
  mkdirSync('output/frame', { recursive: true })
  writeFileSync(`output/frame/live-${stamp}.json`, JSON.stringify(evidence, null, 2))
  log(`evidence: output/frame/live-${stamp}.json`)
}
