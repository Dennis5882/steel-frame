/* 평면도 DXF → 축망 (오프라인). 합성 DXF(R12)로 관례별 경우를 검사하고, 로컬 샘플(samples/cad, gitignore)이 있으면 그것도 대조한다.
   1) 天正 관례: DOTE = 축선, AXIS = 축 번호 원·글자와 치수선 (AXIS 의 긴 치수선을 축으로 읽지 않음), 버블 번호
   2) 30° 회전한 직교 축망  3) 2배로 그린 도면(치수 문자는 참값) → 축척 보정  4) $INSUNITS = m  5) GBK 레이어 이름 '轴线'
   6) 부분 축선(附加轴线) 구분·선택 반영  7) 자동 번호 I·O 제외  8) zg test2.dxf (探索者 AXIS / AXIS_NUM / AXIS_DIM, 분해된 버블 → 자동 번호)
   node --import tsx scripts/verify-cad-grid.ts */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { readDxf } from '../src/frame/cad/dxfRead'
import { applyAxisGrid, autoLabel, axisRegions, extractAxisGrid, regionPad } from '../src/frame/cad/axisGrid'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { buildFrame } from '../src/frame/geometry'

let checks = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++ }
const same = (a: number[], b: number[], m: string) => { assert.deepEqual(a, b, `${m}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); checks++ }

/* 최소 R12 DXF 작성 (문자열 → 바이트, 레이어 이름은 bytes 로 직접 넣을 수 있게) */
type E = ['LINE', string, number, number, number, number] | ['CIRCLE', string, number, number, number] | ['TEXT', string, number, number, number, string]
function dxf(ents: E[], header: [string, number, string | number][] = []): string {
  const g = (c: number | string, v: unknown) => `${c}\n${v}\n`
  let s = g(0, 'SECTION') + g(2, 'HEADER')
  for (const [k, code, v] of header) s += g(9, k) + g(code, v)
  s += g(0, 'ENDSEC') + g(0, 'SECTION') + g(2, 'ENTITIES')
  for (const e of ents) {
    if (e[0] === 'LINE') s += g(0, 'LINE') + g(8, e[1]) + g(10, e[2]) + g(20, e[3]) + g(30, 0) + g(11, e[4]) + g(21, e[5]) + g(31, 0)
    else if (e[0] === 'CIRCLE') s += g(0, 'CIRCLE') + g(8, e[1]) + g(10, e[2]) + g(20, e[3]) + g(30, 0) + g(40, e[4])
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

/* 8) 로컬 샘플 (있을 때만) */
const SAMPLE = 'samples/cad/zg test2.dxf'
if (existsSync(SAMPLE)) {
  const g = extractAxisGrid(readDxf(new Uint8Array(readFileSync(SAMPLE))))
  same(g.layers, ['AXIS'], 'zg test2: AXIS (AXIS_NUM, AXIS_DIM left out)')
  same(g.xs, [0, 8.4, 16.8, 25.2, 33.6], 'zg test2: X main axes'); same(g.ys, [0, 8.4, 18.65, 27.05], 'zg test2: Y main axes')
  ok(g.axes.filter((a) => !a.main).length === 5 && g.warnings.includes('labels_auto') && g.scale?.factor === 1, 'zg test2: 5 partial axes, exploded bubbles → auto numbers, scale 1')
} else console.log(`(skip ${SAMPLE}: local sample not present)`)

console.log(`CAD axis grid import: ${checks} checks passed`)
