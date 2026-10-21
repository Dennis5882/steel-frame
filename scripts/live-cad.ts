/* DXF 평면도 → 축망 → Gen NX 라이브. 화면(CadImport)과 같은 순서로 도면을 읽어 스펙을 만들고(부분 축선 전부 포함 = 짧은 스팬·부등 스팬),
   가장자리에 가새를 넣어 runRound(전송·해석·회수·검토)를 돌린 뒤 Gen 모델 동일성(compareGen)·결과 값(유한·평형)·축 번호가 든 계산서·도면을 확인한다.
   Run: npx tsx scripts/live-cad.ts [plan.dxf] < /dev/null   (기본 samples/cad/zg test2.dxf, gitignore)
   현재 문서를 C:/temp 에 백업 저장한 뒤 새 문서에서 진행. 결과: output/frame/live-cad-<시각>.json */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'
import { DEFAULT_TIMEOUT_MS, callTimeout } from '../src/mapi/timeouts'
import { readDxf } from '../src/frame/cad/dxfRead'
import { applyAxisGrid, axisLayers, columnLayers, extractAxisGrid, extractColumns, extractWalls, snapGrid, suggestShape } from '../src/frame/cad/axisGrid'
import { FRAME_TEMPLATES } from '../src/frame/templates'
import { FRAME_SYNC_DBS, expectOk, frameSyncPayload, runRound } from '../src/frame/run'
import { compareGen, diffText } from '../src/domain/genSync'
import { axisLabel } from '../src/frame/plan'
import type { Request } from '../src/frame/results'
import type { FrameSpec } from '../src/frame/types'

;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { setLang } = await import('../src/i18n')
setLang('ko')
const { buildFrameReport } = await import('../src/frame/report')
const { buildFrameDxf } = await import('../src/frame/drawings')

const file = process.argv[2] ?? 'samples/cad/zg test2.dxf'
const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: DEFAULT_TIMEOUT_MS })
const req: Request = (m, p, b) => client.request(m, p, b as any, callTimeout(p)) as Promise<any>
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
let fails = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++ }
const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

/* 1) 도면 → 스펙 (화면과 같은 기본값: 축 레이어 자동, 부분 축선은 전부 넣음, 기둥 제안 켬) */
const d = readDxf(new Uint8Array(readFileSync(file)))
const g = extractAxisGrid(d, { layers: axisLayers(d).use })
const extra = g.axes.filter((a) => !a.main)
const shape = suggestShape(g, extra, extractColumns(d, g, columnLayers(d)), extractWalls(d, g))
const snapped = snapGrid(g, extra)
const spec: FrameSpec = applyAxisGrid(JSON.parse(JSON.stringify(FRAME_TEMPLATES.blank.spec)), g, extra, shape)
const span = (c: number[]) => c.slice(1).map((v, i) => +(v - c[i]).toFixed(3))
console.log(`DXF ${file}: X ${span(spec.xs).join(', ')} · Y ${span(spec.ys).join(', ')} · removed ${spec.removed.length} · partial ${extra.length}`)
console.log(`  span source X ${snapped.srcX.join('/')} · Y ${snapped.srcY.join('/')}`)
console.log(`  labels X ${spec.axisLabels?.x.join(' ')} · Y ${spec.axisLabels?.y.join(' ')}`)
/* 가장자리 가새 — 첫 X 줄·첫 Y 줄의 두 번째 칸 */
spec.braces = [
  { axis: 'X', line: spec.ys[0], a: spec.xs[1], b: spec.xs[2], type: 'chevron' },
  { axis: 'Y', line: spec.xs[0], a: spec.ys[1], b: spec.ys[2], type: 'chevron' },
]

/* 2) Gen: 백업 → runRound (화면 analyzeFrame·designFrame 과 같은 run.ts) */
expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_backup_${stamp}.mgbx` }), 'backup')
const t0 = Date.now()
const r = await runRound(req, spec, { save: async () => expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_frame_cad_${stamp}.mgbx` }), 'save'), log: (m) => console.log('  ', m) })
console.log(`round ${((Date.now() - t0) / 1000).toFixed(1)} s · nodes ${r.model.nodes.length} · elements ${r.model.elements.length} · sent`, r.counts)

/* 3) Gen 모델 = 보낸 것 (assertFrameGen 과 같은 비교) */
const diffs = (await compareGen(frameSyncPayload(r.P), FRAME_SYNC_DBS, async (db) => (await req('GET', `/db/${db}`))?.[db])).diffs
diffs.slice(0, 8).forEach((x) => console.log('  ', diffText(x)))
check(diffs.length === 0, `Gen model matches sent (${FRAME_SYNC_DBS.join(', ')}) — ${diffs.length} diffs`)

/* 4) 결과 값 */
const eig = r.analysis.story.eigen
check(!!eig && fin(eig.periods[0]) && eig.periods[0] > 0, `T1 ${eig?.periods[0]?.toFixed(4)} s · mass X ${eig?.massX.at(-1)?.toFixed(0)}% Y ${eig?.massY.at(-1)?.toFixed(0)}%`)
const eq = r.analysis.equilibrium
if (eq) for (const [k, v] of Object.entries(eq)) check(Math.abs(v.gen - v.app) <= Math.max(0.5, Math.abs(v.app) * 1e-3), `equilibrium ${k}: Gen ${v.gen.toFixed(2)} · app ${v.app.toFixed(2)}`)
check(r.forces.size === r.model.elements.length, `element forces ${r.forces.size} / ${r.model.elements.length} elements`)
const bad = r.design.members.filter((m) => !fin(m.ratio) || !fin(m.detailRatio))
check(r.design.members.length > 0 && bad.length === 0, `member checks ${r.design.members.length}, non-finite ${bad.length}`)
for (const role of ['beam', 'column', 'brace'] as const) { const w = r.design.byRole[role]; if (w) console.log(`  ${role}: max ${w.ratio.toFixed(3)} / detail ${w.detailRatio.toFixed(3)} (member ${w.id}, ${w.worst.combo}, ${w.worst.governing})`) }
check(r.review.length > 0, `story review items ${r.review.length}: ${r.review.map((i) => `${i.key}${i.dir ?? ''}=${i.status}`).join(' ')}`)

/* 5) 축 번호가 계산서·도면에 들어가는지 (DXF 번호, 부분 축선 k/prev) */
const labels = [...spec.xs.map((_, i) => axisLabel(spec, 'X', i)), ...spec.ys.map((_, j) => axisLabel(spec, 'Y', j))]
const html = buildFrameReport({ built: { spec, model: r.model, P: r.P, file: `C:/temp/sf_frame_cad_${stamp}.mgbx` }, analysis: r.analysis, review: r.review, design: r.design })
const dxf = buildFrameDxf({ spec, model: r.model, title: 'live-cad', date: stamp.slice(0, 8), version: 'live', colStrongAxis: r.analysis.colStrongAxis })
const missR = labels.filter((l) => !html.includes(l)), missD = labels.filter((l) => !dxf.includes(l))
check(!missR.length, `report shows all ${labels.length} axis labels${missR.length ? ` — missing ${missR.join(' ')}` : ''}`)
check(!missD.length, `drawing DXF shows all axis labels${missD.length ? ` — missing ${missD.join(' ')}` : ''}`)

mkdirSync('output/frame', { recursive: true })
writeFileSync(`output/frame/live-cad-${stamp}.json`, JSON.stringify({ stamp, file, spec, counts: r.counts, T1: eig?.periods[0], diffs: diffs.length, byRole: r.design.byRole, review: r.review }, null, 1))
console.log(fails ? `${fails} live CAD check(s) failed` : 'all live CAD checks passed', `· evidence output/frame/live-cad-${stamp}.json`)
process.exit(fails ? 1 : 0)
