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
import { buildFrame } from '../src/frame/geometry'
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
/* 가장자리 가새 — 방향마다 첫 X 줄·첫 Y 줄에서 평면 안에 있는 첫 칸 (두 번째 칸부터, 없으면 첫 칸). 백업 전에 정해 도면이 맞지 않으면 Gen 을 건드리지 않는다 */
const fits = (b: FrameSpec['braces'][number]) => { try { buildFrame({ ...spec, braces: [b] }); return true } catch { return false } }
const edgeBrace = (axis: 'X' | 'Y'): FrameSpec['braces'][number] | undefined => {
  const c = axis === 'X' ? spec.xs : spec.ys, line = axis === 'X' ? spec.ys[0] : spec.xs[0]
  const bays = c.slice(1).map((b, i) => ({ axis, line, a: c[i], b, type: 'chevron' as const }))
  return [...bays.slice(1), ...bays.slice(0, 1)].find(fits)
}
spec.braces = (['X', 'Y'] as const).map(edgeBrace).filter((b) => !!b)
check(spec.braces.length === 2, `edge braces ${spec.braces.map((b) => `${b.axis} ${b.a}–${b.b} @ ${b.line}`).join(' · ') || 'none fit the plan'}`)
if (spec.braces.length < 2) { console.log('stopped before touching Gen: the plan has no edge bay for a brace in each direction'); process.exit(1) }

/* 2) Gen: 백업 → runRound (화면 analyzeFrame·designFrame 과 같은 run.ts). 백업 뒤 Gen 호출이 실패하면 백업 경로와 증거를 남기고 끝낸다 */
const backup = `C:/temp/sf_backup_${stamp}.mgbx`
const evidence = (extra: object) => {
  mkdirSync('output/frame', { recursive: true })
  writeFileSync(`output/frame/live-cad-${stamp}.json`, JSON.stringify({ stamp, file, backup, spec, ...extra }, null, 1))
}
const bail = (e: unknown): never => {
  const error = e instanceof Error ? e.message : String(e)
  console.log(`FAIL Gen step: ${error}`)
  console.log(`the open Gen document was replaced — original saved as ${backup}`)
  evidence({ error })
  process.exit(1)
}
expectOk(await req('POST', '/doc/saveas', { Argument: backup }), 'backup')
const t0 = Date.now()
const r = await runRound(req, spec, { save: async () => expectOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_frame_cad_${stamp}.mgbx` }), 'save'), log: (m) => console.log('  ', m) }).catch(bail)
console.log(`round ${((Date.now() - t0) / 1000).toFixed(1)} s · nodes ${r.model.nodes.length} · elements ${r.model.elements.length} · sent`, r.counts)

/* 3) Gen 모델 = 보낸 것 (assertFrameGen 과 같은 비교) */
const diffs = (await compareGen(frameSyncPayload(r.P), FRAME_SYNC_DBS, async (db) => (await req('GET', `/db/${db}`))?.[db]).catch(bail)).diffs
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
/* 계산서: 축망 표의 스팬 칸 '라벨–라벨 길이' (report.ts spanRow). 도면: GRID 레이어 TEXT 의 글자(축 번호 원) — 짧은 번호가 다른 글자에 섞여 통과하지 않게 자리를 정해 찾는다 */
const spanCells = (['X', 'Y'] as const).flatMap((ax) => (ax === 'X' ? spec.xs : spec.ys).slice(1).map((_, i) => `${axisLabel(spec, ax, i)}–${axisLabel(spec, ax, i + 1)} `))
const gridTexts = new Set(dxf.split('\n0\nTEXT\n').slice(1).filter((e) => e.startsWith('8\nGRID\n')).map((e) => e.split('\n1\n')[1]?.split('\n')[0]))
const missR = spanCells.filter((c) => !html.includes(c)), missD = labels.filter((l) => !gridTexts.has(l))
check(!missR.length, `report span table names all ${labels.length} axis labels${missR.length ? ` — missing ${missR.join(' ')}` : ''}`)
check(!missD.length, `drawing DXF grid bubbles show all axis labels${missD.length ? ` — missing ${missD.join(' ')}` : ''}`)

evidence({ counts: r.counts, T1: eig?.periods[0], diffs: diffs.length, byRole: r.design.byRole, review: r.review })
console.log(fails ? `${fails} live CAD check(s) failed` : 'all live CAD checks passed', `· evidence output/frame/live-cad-${stamp}.json · original Gen document ${backup}`)
process.exit(fails ? 1 : 0)
