/* 다층 강골조 간단 도면 — 공장 앱 Dxf(src/drawing/dxf.ts)로 DXF 와 계산서용 SVG 를 같은 그리기 명령에서 만든다.
   S1 표준층 구조 평면 · S2.. 골조선 입면(가새가 있는 선, 없으면 1축·A축) · 마지막 부재표 + 일반 사항 + 표제란.
   좌표: 모델 m → mm. 격자 이름: X 1,2,3… / Y A,B,C… (FramePlan 과 같음). 문자는 ASCII (DXF R12). */
import { Dxf, toSvgSheets, type SvgLayerStyle } from '../drawing/dxf'
import { hSection } from './design'
import { elementLength } from './geometry'
import { SFI } from './loads'
import type { Axis, FrameModel, FrameRole, FrameSpec } from './types'

const LAYERS = [
  { name: 'GRID', color: 8 }, { name: 'COLUMN', color: 4 }, { name: 'BEAM', color: 3 }, { name: 'BRACE', color: 6 },
  { name: 'DIM', color: 2 }, { name: 'TEXT', color: 7 }, { name: 'BORDER', color: 7 },
]
const SVG_STYLE: Record<string, SvgLayerStyle> = {
  GRID: { color: '#9aa1ad', width: 0.5, dash: '6 4' }, COLUMN: { color: '#0b6e99', width: 1.6 }, BEAM: { color: '#1d8653', width: 1.3 },
  BRACE: { color: '#c2399b', width: 1.1 }, DIM: { color: '#7a5d00', width: 0.5 }, TEXT: { color: '#111', width: 0.5 }, BORDER: { color: '#111', width: 0.8 },
}
const LAYER_OF: Record<FrameRole, string> = { column: 'COLUMN', beam: 'BEAM', brace: 'BRACE' }
/** 부재 기호 (GB/T 50105 관용: 钢柱 GZ · 钢梁 GL · 支撑 ZC) */
export const FRAME_MARK: Record<FrameRole, string> = { column: 'GZ1', beam: 'GL1', brace: 'ZC1' }
const ROLE_EN: Record<FrameRole, string> = { column: 'Column', beam: 'Beam', brace: 'Brace (inverted V)' }
const TXT = 250
const STEEL_T_PER_MM3 = 7.85e-9

export const gridX = (i: number) => String(i + 1)
export const gridY = (j: number) => String.fromCharCode(65 + j)

export interface FrameDrawingInput { spec: FrameSpec; model: FrameModel; title: string; date: string; version: string; colStrongAxis?: Axis }

export interface ScheduleRow { role: FrameRole; mark: string; section: string; count: number; length: number; tons: number }
/** 부재표 — 종류별 단면·개수(요소 기준)·길이·중량 */
export function frameSchedule(model: FrameModel): ScheduleRow[] {
  const out: ScheduleRow[] = []
  for (const role of ['column', 'beam', 'brace'] as const) {
    const els = model.elements.filter((e) => e.role === role)
    if (!els.length) continue
    for (const section of [...new Set(els.map((e) => e.section))]) {
      const list = els.filter((e) => e.section === section)
      const length = list.reduce((a, e) => a + elementLength(model, e), 0)
      const members = new Set(list.map((e) => e.member)).size
      out.push({ role, mark: FRAME_MARK[role], section, count: members, length, tons: hSection(section).A * length * 1000 * STEEL_T_PER_MM3 })
    }
  }
  return out
}

export function buildFrameDxf(input: FrameDrawingInput): string { return drawFrame(input).toString() }
export function buildFrameDrawingSvgs(input: FrameDrawingInput): { name: string; svg: string }[] { return toSvgSheets(drawFrame(input), SVG_STYLE) }

/** 입면을 그릴 골조선 — 가새가 있는 선(중복 제거), 없으면 1축(Y 방향)·A축(X 방향) */
export function elevationLines(spec: FrameSpec): { axis: Axis; line: number }[] {
  const seen = new Map<string, { axis: Axis; line: number }>()
  for (const b of spec.braces) seen.set(`${b.axis}${b.line}`, { axis: b.axis, line: b.line })
  const out = [...seen.values()].sort((a, b) => (a.axis === b.axis ? a.line - b.line : a.axis === 'X' ? -1 : 1))
  return out.length ? out : [{ axis: 'X', line: spec.ys[0] }, { axis: 'Y', line: spec.xs[0] }]
}

function drawFrame({ spec, model, title, date, version, colStrongAxis = 'X' }: FrameDrawingInput): Dxf {
  const d = new Dxf(LAYERS)
  const mm = (m: number) => Math.round(m * 1e6) / 1e3
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const { xs, ys } = spec
  const Lx = mm(xs.at(-1)! - xs[0]), Ly = mm(ys.at(-1)! - ys[0])
  const M = 4000
  let ox = 0
  const sheet = (w: number, h: number, name: string, below = M, left = M) => {
    d.beginSheet(name, ox - left, -below, w + left + M, h + M + below)
    d.rect('BORDER', ox - left, -below, w + left + M, h + M + below)
    d.text('TEXT', ox - left + 600, h + M - 900, TXT * 2, name)
  }
  const bubble = (x: number, y: number, label: string) => { d.circle('GRID', x, y, 450); d.text('GRID', x, y - TXT / 2, TXT * 1.4, label, 1) }
  const secOf = (role: FrameRole) => spec.sections[role]
  const levelName = (k: number) => spec.storyNames[k] ?? `L${k}`

  /* ── S1 표준층 구조 평면 (모든 층 같은 평면) ── */
  {
    const P = (x: number, y: number) => [ox + mm(x - xs[0]), mm(y - ys[0])] as const
    sheet(Lx, Ly + 3000, 'S1  TYPICAL FLOOR FRAMING PLAN', 7000, 6000)
    xs.forEach((x, i) => { const [px] = P(x, 0); d.line('GRID', px, -1500, px, Ly + 1500); bubble(px, Ly + 2100, gridX(i)) })
    ys.forEach((y, j) => { const [, py] = P(0, y); d.line('GRID', ox - 1500, py, ox + Lx + 1500, py); bubble(ox - 2100, py, gridY(j)) })
    /* 보 — 1층 위 레벨(모든 층 같음) */
    for (const e of model.elements) {
      if (e.role !== 'beam') continue
      const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
      if (a.level !== 1) continue
      const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y)
      d.line('BEAM', x1, y1, x2, y2)
    }
    /* 가새 베이 — 보 옆에 평행선 + ZC 표기 */
    for (const e of model.elements) {
      if (e.role !== 'brace') continue
      const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
      if (a.level !== 0 && b.level !== 0) continue
      const lo = a.level === 0 ? a : b, hi = a.level === 0 ? b : a
      const [x1, y1] = P(lo.x, lo.y), [x2, y2] = P(hi.x, hi.y)
      const off = 260, [dx, dy] = e.axis === 'X' ? [0, -off] : [off, 0]
      d.line('BRACE', x1 + dx, y1 + dy, x2 + dx, y2 + dy)
      /* 베이당 한 번 — 오른쪽(위쪽) 기둥에서 올라가는 가새에만 표기 */
      if (lo.x > hi.x || lo.y > hi.y) d.text('BRACE', (x1 + x2) / 2 + dx * 3.2, (y1 + y2) / 2 + dy * 3.2 - TXT / 2, TXT, FRAME_MARK.brace, 1)
    }
    /* 기둥 — H 단면 모양 (강축 휨 방향 = 웨브 방향) */
    const col = hSection(secOf('column')), dd = col.d, bf = col.bf
    const [w, h] = colStrongAxis === 'X' ? [dd, bf] : [bf, dd]
    for (const n of model.nodes) {
      if (n.level !== 0) continue
      const [cx, cy] = P(n.x, n.y)
      if (colStrongAxis === 'X') {
        d.line('COLUMN', cx - w / 2, cy - h / 2, cx - w / 2, cy + h / 2); d.line('COLUMN', cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2); d.line('COLUMN', cx - w / 2, cy, cx + w / 2, cy)
      } else {
        d.line('COLUMN', cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2); d.line('COLUMN', cx - w / 2, cy + h / 2, cx + w / 2, cy + h / 2); d.line('COLUMN', cx, cy - h / 2, cx, cy + h / 2)
      }
    }
    /* 치수 — 스팬별 + 전체 */
    xs.slice(1).forEach((x, i) => { const [a] = P(xs[i], 0), [b] = P(x, 0); d.dim('DIM', a, 0, b, 0, 2600, TXT) })
    d.dim('DIM', ox, 0, ox + Lx, 0, 3800, TXT)
    ys.slice(1).forEach((y, j) => { const [, a] = P(0, ys[j]), [, b] = P(0, y); d.dim('DIM', ox, a, ox, b, 3300, TXT) })
    d.dim('DIM', ox, 0, ox, Ly, 4500, TXT)
    const notes = [
      `${FRAME_MARK.column}  ${secOf('column')}   ${FRAME_MARK.beam}  ${secOf('beam')}${spec.braces.length ? `   ${FRAME_MARK.brace}  ${secOf('brace')}` : ''}`,
      `All floors ${spec.storyNames.slice(1).join(', ')} use this plan. Diagonal beams at cut panels. ${FRAME_MARK.brace} = inverted-V brace bay (see elevations).`,
    ]
    notes.forEach((s, i) => d.text('TEXT', ox, -5200 - i * TXT * 1.8, TXT, s))
    ox += Lx + M + 6000 + 3000
  }

  /* ── S2.. 골조선 입면 ── */
  const z0 = model.levels[0], H = mm(model.levels.at(-1)! - z0)
  elevationLines(spec).forEach((ln, k) => {
    const along = ln.axis === 'X' ? xs : ys, L = mm(along.at(-1)! - along[0])
    const on = (n: { x: number; y: number }) => near(ln.axis === 'X' ? n.y : n.x, ln.line)
    const u = (n: { x: number; y: number }) => ln.axis === 'X' ? n.x : n.y
    const P = (n: { x: number; y: number; z: number }) => [ox + mm(u(n) - along[0]), mm(n.z - z0)] as const
    const label = ln.axis === 'X' ? `GRID ${gridY(ys.findIndex((y) => near(y, ln.line)))}` : `GRID ${gridX(xs.findIndex((x) => near(x, ln.line)))}`
    sheet(L + 4000, H + 2000, `S${k + 2}  ELEVATION ${label}`, 6000)
    along.forEach((v, i) => {
      const px = ox + mm(v - along[0])
      d.line('GRID', px, -1500, px, H + 1000)
      bubble(px, -2100, ln.axis === 'X' ? gridX(i) : gridY(i))
    })
    model.levels.forEach((z, lv) => {
      const py = mm(z - z0)
      d.line('GRID', ox - 800, py, ox + L + 800, py)
      d.text('TEXT', ox + L + 1200, py + 80, TXT, `${levelName(lv)}  ${z >= 0 ? '+' : ''}${z.toFixed(3)}`)
    })
    for (const e of model.elements) {
      const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
      if (!on(a) || !on(b)) continue
      if (e.role !== 'column' && e.axis !== ln.axis) continue
      const [x1, y1] = P(a), [x2, y2] = P(b)
      d.line(LAYER_OF[e.role], x1, y1, x2, y2)
    }
    /* 단면 표기 — 각 층 첫 기둥·보·가새 하나씩 */
    for (let s = 1; s < model.levels.length; s++) {
      const br = model.elements.find((e) => e.role === 'brace' && e.axis === ln.axis && near(e.line ?? NaN, ln.line) && e.story === s)
      if (br) {
        /* 人자 아래 가운데(빈 곳)에 — 가새 위 끝 = 베이 가운데 */
        const a = nodes.get(br.n1)!, b = nodes.get(br.n2)!, [xt] = P(a.z > b.z ? a : b)
        d.text('BRACE', xt, mm(model.levels[s - 1] - z0) + 350, TXT * 0.8, `${FRAME_MARK.brace} ${secOf('brace')}`, 1)
      }
    }
    d.text('TEXT', ox, H + 600, TXT * 0.8, `${FRAME_MARK.column} ${secOf('column')}   ${FRAME_MARK.beam} ${secOf('beam')}`)
    /* 치수 — 층고(왼쪽)·스팬(아래) */
    model.levels.slice(1).forEach((z, i) => d.dim('DIM', ox, mm(model.levels[i] - z0), ox, mm(z - z0), 1600, TXT))
    along.slice(1).forEach((v, i) => d.dim('DIM', ox + mm(along[i] - along[0]), 0, ox + mm(v - along[0]), 0, 3400, TXT))
    ox += L + 4000 + 2 * M + 3000
  })

  /* ── 부재표 + 일반 사항 + 표제란 ── */
  {
    const W = 30000, Hs = 21000
    sheet(W, Hs, `S${elevationLines(spec).length + 2}  MEMBER SCHEDULE AND GENERAL NOTES`)
    const sched = frameSchedule(model)
    const cols = [0, 2200, 6600, 13400, 16600, 19000, 22600, 26000]
    const head = ['MARK', 'MEMBER', 'SECTION (GB/T 11263)', 'MATERIAL', 'QTY', 'LENGTH (m)', 'WEIGHT (t)']
    const top = Hs - 1200, rh = 900
    const rowsTxt = [head, ...sched.map((r) => [r.mark, ROLE_EN[r.role], r.section, spec.material, String(r.count), r.length.toFixed(1), r.tons.toFixed(2)]),
      ['', 'TOTAL', '', '', String(sched.reduce((a, r) => a + r.count, 0)), sched.reduce((a, r) => a + r.length, 0).toFixed(1), sched.reduce((a, r) => a + r.tons, 0).toFixed(2)]]
    rowsTxt.forEach((cells, i) => {
      const y = top - i * rh
      d.line('BORDER', ox + cols[0], y, ox + cols[7], y)
      cells.forEach((c, j) => d.text('TEXT', ox + cols[j] + 200, y - rh + 260, TXT, c))
    })
    const bottom = top - rowsTxt.length * rh
    d.line('BORDER', ox + cols[0], bottom, ox + cols[7], bottom)
    cols.forEach((c) => d.line('BORDER', ox + c, top, ox + c, bottom))
    const s = spec.seismic, L = spec.loads
    const notes = [
      'GENERAL NOTES',
      '1. Codes: GB 50017-2017, GB/T 50011-2010 (2024 ed.), GB 55001-2021, GB 55002-2021, GB 55006-2021, GB 50009-2012.',
      `2. Steel ${spec.material} (GB/T 1591). Rolled H sections GB/T 11263. Dimensions in mm, elevations in m.`,
      `3. Floor: dead ${L.floorDead} / live ${L.floorLive} kN/m2. Roof: dead ${L.roofDead} / live ${L.roofLive} kN/m2${L.roofSnow > 0 ? `, snow s0 ${L.roofSnow} kN/m2` : ''}. Edge beams ${L.edgeFloor} / ${L.edgeRoof} kN/m.`,
      `4. Wind w0 ${spec.wind.w0} kN/m2, terrain ${spec.wind.terrain}. Seismic intensity ${s.intensity.split('_')[0]} (${SFI[s.intensity]}), group ${s.group}, site ${s.site}, steel seismic grade ${spec.design.seismicGrade}.`,
      '5. Column bases fixed. Beam-column joints rigid in the analysis model. Braces: inverted-V, ends as modelled.',
      '6. Connections, base plates, panel zones and brace unbalanced force (GB/T 50011 8.2.6) are not designed here.',
      '7. Preliminary drawing generated from the analysis model. Not for construction.',
    ]
    notes.forEach((t, i) => d.text('TEXT', ox, bottom - 1600 - i * TXT * 2.2, i ? TXT : TXT * 1.3, t))
    /* 표제란 */
    const tbW = 12000, tbH = 3200, tx = ox + W - tbW, ty = 0
    d.rect('BORDER', tx, ty, tbW, tbH)
    d.line('BORDER', tx, ty + tbH / 2, tx + tbW, ty + tbH / 2)
    d.text('TEXT', tx + 300, ty + tbH / 2 + 500, TXT * 1.4, title)
    d.text('TEXT', tx + 300, ty + 500, TXT, `Steel Frame Agent v${version}  /  ${date}  /  MIDAS Gen NX`)
  }
  return d
}
