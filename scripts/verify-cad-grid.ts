/* 평면도 DXF → 축망 (오프라인). 합성 DXF(R12)로 관례별 경우를 검사하고, 로컬 샘플(samples/cad, gitignore)이 있으면 그것도 대조한다.
   1) 天正 관례: DOTE = 축선, AXIS = 축 번호 원·글자와 치수선 (AXIS 의 긴 치수선을 축으로 읽지 않음), 버블 번호
   2) 30° 회전한 직교 축망  3) 2배로 그린 도면(치수 문자는 참값) → 축척 보정  4) $INSUNITS = m  5) GBK 레이어 이름 '轴线'
   6) 부분 축선(附加轴线) 구분·선택 반영  7) 자동 번호 I·O 제외  8) zg test2.dxf (探索者 AXIS / AXIS_NUM / AXIS_DIM, 분해된 버블 → 자동 번호)
   node --import tsx scripts/verify-cad-grid.ts */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { readDxf } from '../src/frame/cad/dxfRead'
import { applyAxisGrid, autoLabel, axisRegions, extractAxisGrid, extractColumns, extractWalls, regionPad, snapGrid, suggestShape, underlayLines } from '../src/frame/cad/axisGrid'
import { axisLabel, axisLabels, deleteSpan, insertSpan, parseLabels, setAxisLabels, setGrid } from '../src/frame/plan'
import { buildFrameDrawingSvgs } from '../src/frame/drawings'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { buildFrame } from '../src/frame/geometry'

let checks = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++ }
const same = (a: number[], b: number[], m: string) => { assert.deepEqual(a, b, `${m}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); checks++ }

/* 최소 R12 DXF 작성 (문자열 → 바이트, 레이어 이름은 bytes 로 직접 넣을 수 있게) */
type E = ['LINE', string, number, number, number, number] | ['CIRCLE', string, number, number, number] | ['TEXT', string, number, number, number, string]
  | ['DIM', string, string, number, number, number, number]
function dxf(ents: E[], header: [string, number, string | number][] = [], blocks: [string, string][] = []): string {
  const g = (c: number | string, v: unknown) => `${c}\n${v}\n`
  let s = g(0, 'SECTION') + g(2, 'HEADER')
  for (const [k, code, v] of header) s += g(9, k) + g(code, v)
  s += g(0, 'ENDSEC')
  if (blocks.length) {
    /* 치수 블록 *D… — 표시 글자(MTEXT) 하나 */
    s += g(0, 'SECTION') + g(2, 'BLOCKS')
    for (const [name, text] of blocks) s += g(0, 'BLOCK') + g(8, '0') + g(2, name) + g(70, 1) + g(10, 0) + g(20, 0) + g(30, 0) + g(3, name)
      + g(0, 'MTEXT') + g(8, 'DIM') + g(10, 0) + g(20, 0) + g(30, 0) + g(40, 300) + g(1, text) + g(0, 'ENDBLK') + g(8, '0')
    s += g(0, 'ENDSEC')
  }
  s += g(0, 'SECTION') + g(2, 'ENTITIES')
  for (const e of ents) {
    if (e[0] === 'LINE') s += g(0, 'LINE') + g(8, e[1]) + g(10, e[2]) + g(20, e[3]) + g(30, 0) + g(11, e[4]) + g(21, e[5]) + g(31, 0)
    else if (e[0] === 'CIRCLE') s += g(0, 'CIRCLE') + g(8, e[1]) + g(10, e[2]) + g(20, e[3]) + g(30, 0) + g(40, e[4])
    else if (e[0] === 'DIM') s += g(0, 'DIMENSION') + g(8, e[1]) + g(2, e[2]) + g(10, e[5]) + g(20, e[4] - 2000) + g(30, 0) + g(11, (e[3] + e[5]) / 2) + g(21, e[4] - 2000) + g(31, 0) + g(70, 0) + g(13, e[3]) + g(23, e[4]) + g(33, 0) + g(14, e[5]) + g(24, e[6]) + g(34, 0)
    else s += g(0, 'TEXT') + g(8, e[1]) + g(10, e[2]) + g(20, e[3]) + g(30, 0) + g(40, e[4]) + g(1, e[5])
  }
  return s + g(0, 'ENDSEC') + g(0, 'EOF')
}
const bytes = (s: string) => new TextEncoder().encode(s)

/** 직교 축망 (mm): 축선 + 양 끝 버블(원 r400 + 번호) + 축 레이어의 치수선·치수 문자 */
function grid(xs: number[], ys: number[], o: { axisLayer?: string; labelLayer?: string; k?: number; rotDeg?: number; dims?: boolean } = {}): E[] {
  const k = o.k ?? 1, th = (o.rotDeg ?? 0) * Math.PI / 180
  const P = (x: number, y: number): [number, number] => [k * (x * Math.cos(th) - y * Math.sin(th)), k * (x * Math.sin(th) + y * Math.cos(th))]
  const L = o.axisLayer ?? 'DOTE', B = o.labelLayer ?? 'AXIS', e: E[] = []
  const x0 = xs[0] - 1500, x1 = xs.at(-1)! + 1500, y0 = ys[0] - 1500, y1 = ys.at(-1)! + 1500
  const line = (layer: string, a: [number, number], b: [number, number]) => e.push(['LINE', layer, a[0], a[1], b[0], b[1]])
  const bubble = (c: [number, number], label: string) => { e.push(['CIRCLE', B, c[0], c[1], 400 * k]); e.push(['TEXT', B, c[0] - 150 * k, c[1] - 250 * k, 500 * k, label]) }
  xs.forEach((x, i) => { line(L, P(x, y0), P(x, y1)); line(B, P(x, y1), P(x, y1 + 1000)); bubble(P(x, y1 + 1400), String(i + 1)); bubble(P(x, y0 - 1400), String(i + 1)) })
  ys.forEach((y, i) => { line(L, P(x0, y), P(x1, y)); bubble(P(x0 - 1400, y), autoLabel('Y', i)) })
  if (o.dims) {
    /* 치수선(축 레이어, 축과 같은 방향의 긴 선)과 치수 문자(참값, 스팬 중앙) */
    line(B, P(xs[0], y0 - 3500), P(xs.at(-1)!, y0 - 3500)); line(B, P(x0 - 3500, ys[0]), P(x0 - 3500, ys.at(-1)!))
    xs.slice(1).forEach((x, i) => e.push(['TEXT', B, ...P((x + xs[i]) / 2, y0 - 3300), 350 * k, String(x - xs[i])] as E))
    ys.slice(1).forEach((y, i) => e.push(['TEXT', B, ...P(x0 - 3300, (y + ys[i]) / 2), 350 * k, String(y - ys[i])] as E))
  }
  return e
}

const XS = [0, 6000, 12000, 18000, 24000, 30000, 36000], YS = [0, 7000, 14000, 21000, 28000, 34000]
const XM = XS.map((v) => v / 1000), YM = YS.map((v) => v / 1000)

/* 1) 天正 — DOTE 축선, AXIS 버블·치수선 */
{
  const g = extractAxisGrid(readDxf(bytes(dxf(grid(XS, YS, { dims: true }), [['$INSUNITS', 70, 4]]))))
  same(g.layers, ['DOTE'], 'TArch: DOTE is the axis layer (AXIS holds bubbles and dimension lines)')
  same(g.xs, XM, 'TArch: X axes'); same(g.ys, YM, 'TArch: Y axes')
  ok(g.axes.every((a) => a.main && a.labelFrom === 'drawing'), 'TArch: every axis is main and keeps the bubble number')
  same(g.axes.filter((a) => a.dir === 'Y').map((a) => a.label as any), ['A', 'B', 'C', 'D', 'E', 'F'], 'TArch: Y labels from bubbles')
  ok(!g.unitGuessed && g.unitMm === 1 && g.scale?.factor === 1 && !g.warnings.includes('scale_corrected'), 'TArch: $INSUNITS mm, scale 1')
}
/* 2) 회전 30° */
{
  const g = extractAxisGrid(readDxf(bytes(dxf(grid(XS, YS, { rotDeg: 30 }), [['$INSUNITS', 70, 4]]))))
  ok(Math.abs(g.rotationDeg - 30) < 0.11 && g.warnings.includes('rotated'), `rotated: angle found (${g.rotationDeg})`)
  same(g.xs, XM, 'rotated: X axes after unrotating'); same(g.ys, YM, 'rotated: Y axes after unrotating')
}
/* 3) 2배 출도 — 기하 ×2, 치수 문자는 참값 */
{
  const g = extractAxisGrid(readDxf(bytes(dxf(grid(XS, YS, { k: 2, dims: true }), [['$INSUNITS', 70, 4]]))))
  ok(g.scale?.factor === 2 && g.warnings.includes('scale_corrected') && g.mmPerUnit === 0.5, `2x drawing: factor ${g.scale?.factor}, mm per unit ${g.mmPerUnit}`)
  same(g.xs, XM, '2x drawing: X axes in true size'); same(g.ys, YM, '2x drawing: Y axes in true size')
  ok(g.axes.every((a) => a.labelFrom === 'drawing'), '2x drawing: bubbles (r 800 in drawing units) still read')
}
/* 4) 단위 m ($INSUNITS 6) */
{
  const g = extractAxisGrid(readDxf(bytes(dxf(grid(XS, YS, { k: 0.001 }), [['$INSUNITS', 70, 6]]))))
  ok(g.unitMm === 1000 && !g.unitGuessed, 'metres: $INSUNITS 6 read'); same(g.xs, XM, 'metres: X axes')
  const g2 = extractAxisGrid(readDxf(bytes(dxf(grid(XS, YS, { k: 0.001 })))))
  ok(g2.unitMm === 1000 && g2.unitGuessed && g2.warnings.includes('unit_guessed'), 'metres: no $INSUNITS → guessed from axis spacing'); same(g2.ys, YM, 'metres (guessed): Y axes')
}
/* 5) GBK 레이어 이름 '轴线' + $DWGCODEPAGE ANSI_936 */
{
  const gbk = new Uint8Array([0xd6, 0xe1, 0xcf, 0xdf])
  assert.equal(new TextDecoder('gbk').decode(gbk), '轴线')
  const text = dxf(grid(XS, YS, { axisLayer: '@@AX@@', labelLayer: 'BUBBLE' }), [['$DWGCODEPAGE', 3, 'ANSI_936'], ['$INSUNITS', 70, 4]])
  const parts = text.split('@@AX@@').map((p) => new TextEncoder().encode(p))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0) + gbk.length * (parts.length - 1))
  let at = 0
  parts.forEach((p, i) => { out.set(p, at); at += p.length; if (i < parts.length - 1) { out.set(gbk, at); at += gbk.length } })
  const g = extractAxisGrid(readDxf(out))
  same(g.layers, ['轴线'], 'GBK: layer name decoded and recognised'); same(g.xs, XM, 'GBK: X axes')
}
/* 6) 부분 축선 */
{
  const e = grid(XS, YS)
  e.push(['LINE', 'DOTE', 9000, 7000, 9000, 21000]) // X 3~4 사이, Y B~D 구간만
  const g = extractAxisGrid(readDxf(bytes(dxf(e, [['$INSUNITS', 70, 4]]))))
  const part = g.axes.filter((a) => !a.main)
  ok(part.length === 1 && part[0].dir === 'X' && part[0].pos === 9000 && part[0].label === '1/2' && g.warnings.includes('partial_axes'), `partial axis: kept out of the grid, labelled after its main axis (${part.map((a) => a.label)})`)
  same(g.xs, XM, 'partial axis: main X axes unchanged')
  const spec = applyAxisGrid({ ...TUTORIAL_SPEC, removed: [[0, 0]] }, g, part)
  same(spec.xs, [0, 6, 9, 12, 18, 24, 30, 36], 'apply: chosen partial axis becomes a grid line')
  ok(spec.removed.length === 0 && spec.braces.length === 0 && buildFrame(spec).nodes.length > 0, 'apply: plan shape and braces cleared, model builds')
}
/* 6-1) 한 파일에 평면 두 장 (둘째는 2배로 그리고 멀리 떨어짐) — 영역을 나눠 각각 읽는다 */
{
  const far = grid([0, 8000, 16000], [0, 6000, 12000], { k: 2, dims: false }).map((e) => (e[0] === 'LINE' ? ['LINE', e[1], e[2] + 200000, e[3], e[4] + 200000, e[5]] : [e[0], e[1], (e as any)[2] + 200000, ...(e as any).slice(3)]) as E)
  const d = readDxf(bytes(dxf([...grid(XS, YS, { dims: true }), ...far], [['$INSUNITS', 70, 4]])))
  const rs = axisRegions(d, ['DOTE'])
  ok(rs.length === 2 && rs[0].lines === XS.length + YS.length, `regions: two plans found (${rs.map((r) => r.lines)})`)
  const g1 = extractAxisGrid(d, { box: rs[0].box, pad: regionPad(rs[0]) }), g2 = extractAxisGrid(d, { box: rs[1].box, pad: regionPad(rs[1]), scaleFactor: 2 })
  same(g1.xs, XM, 'regions: first plan X axes only'); same(g1.ys, YM, 'regions: first plan Y axes only')
  same(g2.xs, [0, 8, 16], 'regions: second plan (2x, scale set by hand)'); same(g2.ys, [0, 6, 12], 'regions: second plan Y')
  ok(g1.axes.every((a) => a.labelFrom === 'drawing'), 'regions: bubbles outside the axis box still read (pad)')
}
/* 7) 자동 번호 — I·O 제외 (GB/T 50001) */
same(Array.from({ length: 10 }, (_, i) => autoLabel('Y', i)) as any, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'], 'auto labels skip I')
ok(autoLabel('Y', 13) === 'P' && autoLabel('X', 0) === '1', 'auto labels skip O; X axes are numbers')

/* 9) 기둥 위치 → 뺀 패널 제안 (4 × 3 축선 = 3 × 2 패널, 기둥 600 각 LINE 4개) */
{
  const GX = [0, 6000, 12000, 18000], GY = [0, 6000, 12000]
  const col = (x: number, y: number, layer = 'COLUMN'): E[] => { const h = 300; return [['LINE', layer, x - h, y - h, x + h, y - h], ['LINE', layer, x + h, y - h, x + h, y + h], ['LINE', layer, x + h, y + h, x - h, y + h], ['LINE', layer, x - h, y + h, x - h, y - h]] }
  const run = (skip: [number, number][], more: E[] = [], pickPartial = false) => {
    const e = [...grid(GX, GY), ...more]
    for (const x of GX) for (const y of GY) if (!skip.some(([a, b]) => a === x && b === y)) e.push(...col(x, y))
    const d = readDxf(bytes(dxf(e, [['$INSUNITS', 70, 4]])))
    const g = extractAxisGrid(d), extra = pickPartial ? g.axes.filter((a) => !a.main) : []
    return { g, extra, s: suggestShape(g, extra, extractColumns(d, g), extractWalls(d, g)), d }
  }
  const key = (r?: [number, number][]) => JSON.stringify(r)
  ok(key(run([]).s?.removed) === '[]', 'shape: every node has a column -> nothing removed')
  ok(key(run([[18000, 12000]]).s?.removed) === '[[2,1]]', `shape: L plan, one outer corner column missing -> that panel out (${key(run([[18000, 12000]]).s?.removed)})`)
  ok(key(run([[12000, 12000], [18000, 12000]]).s?.removed) === '[[1,1],[2,1]]', 'shape: L plan, two panels cut away')
  const dr = run([[6000, 6000]]).s
  ok(key(dr?.removed) === '[]' && dr?.dropped === 1, 'shape: one inner column missing with support all around -> kept (long-span beam)')
  ok(key(run([[18000, 12000]], [['LINE', 'WALL', 15000, 12000, 21000, 12000]]).s?.removed) === '[]', 'shape: a wall through the node counts as support')
  ok(key(run([[18000, 12000]], [['CIRCLE', 'COLUMN', 18000, 12000, 300]]).s?.removed) === '[]', 'shape: a round column (circle) counts')
  ok(key(run([[18000, 12000]], col(18000, 12000, '柱钢筋')).s?.removed) === '[[2,1]]', 'shape: rebar layer (柱钢筋) is not a column')
  /* 부분 축선 X=9000 이 아래 칸(0~6000)에만 그려짐 — 위쪽 교점(9000, 12000)은 가상 교점이라 세지 않는다 */
  const pv = run([], [['LINE', 'DOTE', 9000, -300, 9000, 6300], ...col(9000, 0), ...col(9000, 6000)], true)
  ok(pv.extra.length === 1 && key(pv.s?.removed) === '[]', `shape: partial axis nodes outside its drawn length are not counted (${key(pv.s?.removed)})`)
  const spec = applyAxisGrid(TUTORIAL_SPEC, pv.g, pv.extra, pv.s)
  same(spec.axisLabels?.x ?? [], ['1', '2', '1/2', '3', '4'], 'apply: partial axis number kept in the spec')
  ok(!spec.axisLabels || spec.axisLabels.y.join() === 'A,B,C', 'apply: Y numbers from the drawing')
  const lo = run([[18000, 12000]])
  ok(key(applyAxisGrid(TUTORIAL_SPEC, lo.g, [], lo.s).removed) === '[[2,1]]' && applyAxisGrid(TUTORIAL_SPEC, lo.g, [], lo.s).axisLabels === undefined, 'apply: suggested panels go in; default numbers are not stored')
  const none = (() => { const d = readDxf(bytes(dxf(grid(GX, GY), [['$INSUNITS', 70, 4]]))); const g = extractAxisGrid(d); return suggestShape(g, [], extractColumns(d, g)) })()
  ok(none === null, 'shape: no column layer -> no suggestion')
}
/* 10) 축 번호 (plan.ts) — 기본·입력·스팬 편집·입력 변경 판정·도면 */
{
  const s = structuredClone(TUTORIAL_SPEC) as typeof TUTORIAL_SPEC
  ok(axisLabel(s, 'Y', 8) === 'J' && axisLabel(s, 'X', 0) === '1', 'labels: default skips I')
  ok(parseLabels('1, 2, 3', 3)?.join() === '1,2,3' && !parseLabels('1, 1, 3', 3) && !parseLabels('1, 2', 3) && !parseLabels('1, 2, 轴', 3), 'labels: input must be n different ASCII labels')
  const nx = s.xs.length
  setAxisLabels(s, 'X', Array.from({ length: nx }, (_, i) => `X${i + 1}`))
  ok(s.axisLabels?.x[0] === 'X1' && s.axisLabels?.y[0] === 'A', 'labels: set one direction, the other keeps defaults')
  insertSpan(s, 'X', 0, 3)
  ok(axisLabels(s, 'X').join() === ['X1', '1/X1', ...Array.from({ length: nx - 1 }, (_, i) => `X${i + 2}`)].join(), `labels: inserted axis is numbered 1/previous (${axisLabels(s, 'X')})`)
  deleteSpan(s, 'X', 0)
  ok(axisLabels(s, 'X').join() === Array.from({ length: nx }, (_, i) => `X${i + 1}`).join(), 'labels: deleting the span removes that axis number')
  setGrid(s, [...s.xs, s.xs.at(-1)! + 6], s.ys)
  ok(axisLabels(s, 'X').at(-1) === String(nx + 1) && axisLabels(s, 'X').length === nx + 1, 'labels: a span added at the end gets the default number')
  setAxisLabels(s, 'X', null)
  ok(s.axisLabels === undefined, 'labels: back to defaults -> not stored')
  const built = structuredClone(TUTORIAL_SPEC) as typeof TUTORIAL_SPEC, draft = structuredClone(TUTORIAL_SPEC) as typeof TUTORIAL_SPEC
  setAxisLabels(draft, 'Y', axisLabels(draft, 'Y').map((l) => `G${l}`))
  ;(globalThis as any).document ??= { documentElement: { lang: 'en', dataset: {} } }; (globalThis as any).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  const { frameStale } = await import('../src/frame/state') // store·i18n 을 불러오므로 문서 흉내 뒤에
  ok(!frameStale({ draft, built: { spec: built } as any }), 'labels: renaming axes is not an input change (no rebuild)')
  const sheets = buildFrameDrawingSvgs({ spec: draft, model: buildFrame(draft), title: 'T', date: 'd', version: 'v' })
  ok(sheets[0].svg.includes('>GA<') && sheets.some((x) => /ELEVATION GRID G/.test(x.name)), 'labels: drawings use the axis numbers')
}

/* 11) 치수 우선 스팬 — 선이 8399.6 mm 로 조금 어긋나게 그려진 도면 */
{
  const AX = [0, 8399.6, 16800], AY = [0, 6000]
  const base = grid(AX, AY)
  const read = (more: E[], blocks: [string, string][] = []) => { const d = readDxf(bytes(dxf([...base, ...more], [['$INSUNITS', 70, 4]], blocks))); const g = extractAxisGrid(d); return { g, sg: snapGrid(g), d } }
  const geo = read([]).sg
  same(geo.xs, [0, 8.4, 16.8], 'dims: none -> line positions (1 mm)')
  ok(geo.srcX.every((k) => k === 'geom'), 'dims: none -> span source = drawing')
  const t = read([['TEXT', 'DIM', 4100, -2500, 300, '8400'], ['TEXT', 'DIM', 12500, -2500, 300, '8400'], ['TEXT', 'DIM', -2500, 2900, 300, '6000']]).sg
  ok(t.srcX.join() === 'dim,dim' && t.srcY.join() === 'dim', `dims: exploded dimension texts are used (${t.srcX}, ${t.srcY})`)
  const off = read([], []).sg
  ok(off.xs[1] === 8.4, 'dims: rounding keeps 8.4 here (8399.6 -> 8400 mm)')
  const AX2 = [0, 8397.3, 16800]
  const d2 = readDxf(bytes(dxf([...grid(AX2, AY), ['TEXT', 'DIM', 4100, -2500, 300, '8400']], [['$INSUNITS', 70, 4]])))
  const s2 = snapGrid(extractAxisGrid(d2))
  same(s2.xs, [0, 8.4, 16.803], 'dims: 8397.3 drawn, dimension 8400 -> 8.4; next span has no dimension -> 8402.7 rounded')
  ok(s2.srcX.join() === 'dim,geom', 'dims: per-span source')
  const dm = read([['DIM', 'DIM', '*D1', 0, 0, 8399.6, 0], ['DIM', 'DIM', '*D2', 8399.6, 0, 16800, 0]], [['*D1', '8400'], ['*D2', '\\A1;8400']])
  ok(dm.sg.srcX.join() === 'dim,dim' && dm.g.dims.length === 2, `dims: DIMENSION value read from its block (${dm.sg.srcX}, ${dm.g.dims.length})`)
  const cf = read([['DIM', 'DIM', '*D1', 0, 0, 8399.6, 0]], [['*D1', '9000']]).sg
  ok(cf.srcX[0] === 'conflict' && cf.dimX[0] === 9000 && cf.xs[1] === 8.4, 'dims: a dimension that disagrees (9000 vs 8400) -> drawing kept, flagged')
  const sp = applyAxisGrid(TUTORIAL_SPEC, read([['TEXT', 'DIM', 4100, -2500, 300, '8400'], ['TEXT', 'DIM', 12500, -2500, 300, '8400']]).g)
  same(sp.xs, [0, 8.4, 16.8], 'apply: uses the dimension-first spans')
  const ul = underlayLines(dm.d, dm.g, dm.sg.origin, ['DOTE'])
  ok(ul.length === 5 && ul.some(([x1, , x2]) => x1 === 0 && x2 === 0), 'underlay: axis-layer lines in spec coordinates (first grid line = 0)')
}

/* 8) 로컬 샘플 (있을 때만) */
const SAMPLE = 'samples/cad/zg test2.dxf'
if (existsSync(SAMPLE)) {
  const g = extractAxisGrid(readDxf(new Uint8Array(readFileSync(SAMPLE))))
  same(g.layers, ['AXIS'], 'zg test2: AXIS (AXIS_NUM, AXIS_DIM left out)')
  same(g.xs, [0, 8.4, 16.8, 25.2, 33.6], 'zg test2: X main axes'); same(g.ys, [0, 8.4, 18.65, 27.05], 'zg test2: Y main axes')
  ok(g.axes.filter((a) => !a.main).length === 5 && g.warnings.includes('labels_auto') && g.scale?.factor === 1, 'zg test2: 5 partial axes, exploded bubbles → auto numbers, scale 1')
  const sg = snapGrid(g)
  console.log(`  zg test2 span sources X ${sg.srcX} · Y ${sg.srcY}`)
  ok(sg.srcX.every((k) => k !== 'conflict') && sg.srcY.every((k) => k !== 'conflict'), 'zg test2: no dimension conflicts')
} else console.log(`(skip ${SAMPLE}: local sample not present)`)

console.log(`CAD axis grid import: ${checks} checks passed`)
