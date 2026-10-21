/* 평면도 DXF → 축망(격자) (순수). 로직 출처: StruXureAI geometry.ts extractGrid·extractGridLabeled (축 레이어 키워드, 축선 묶기, 버블 번호 붙이기).
   바꾼 것: 허용오차를 캔버스 px 가 아니라 실제 mm 로 둔다(그쪽 CLAUDE.md 가 px 상수를 반복 버그로 기록), 주축/부분 축선을 나눈다,
   회전된 직교 축망을 풀고, 天正 레이어 관례(DOTE = 축선, AXIS = 축 번호·치수)를 따른다.
   순서: 범위(box) → 단위(mm/cm/m, $INSUNITS 또는 축 간격으로 추정) → 축척(drawingScale, 2× 출도) → 축 레이어 → 회전 → 축선 묶기 → 주축/부분 → 번호.
   결과는 스펙의 xs·ys (m, 첫 주축 = 0). 부분 축선(평면 일부만 지나는 附加轴线)은 기본으로 빼고 사용자가 고른다. */
import type { FrameSpec } from '../types'
import type { CadDrawing, CadEntity, Pt } from './dxfRead'
import { analyzeDrawingScale, type ScaleAnalysis, type ScaleBox } from './drawingScale'

/** 축선 레이어 이름 (天正 DOTE, 探索者 AXIS, 영문 GRID, 한·중·번체) */
export const AXIS_LAYER = /AXIS|AXN|GRID|DOTE|CEN|轴|軸|通|网|축|통/i
/** 축 레이어지만 축선이 아닌 것 — 치수·번호·글자 (AXIS_DIM, AXIS_NUM, 轴号, 尺寸 …) */
export const AXIS_NOT_LINE = /DIM|NUM|TEXT|TXT|LABEL|BUBBLE|标注|標註|尺寸|编号|編號|轴号|軸號|文字|치수|번호/i

const INS_UNIT_MM: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }
/** 묶음 허용오차·최소 길이 (실제 mm) */
const SAME_AXIS_MM = 5, MIN_AXIS_MM = 1500, ORTHO_DEG = 0.5
/** 주축: 직교 축망 범위의 이만큼을 지나야 한다 */
const MAIN_COVER = 0.9

export interface AxisLine {
  dir: 'X' | 'Y'
  /** 위치 (mm, 회전을 푼 좌표) — X 축 = x 좌표(세로선), Y 축 = y 좌표(가로선) */
  pos: number
  /** 선이 지나는 구간 (mm, 직교 방향) */
  from: number; to: number
  main: boolean
  label: string
  labelFrom: 'drawing' | 'auto'
}

export type GridWarning = 'no_axis_layer' | 'few_axes' | 'unit_guessed' | 'scale_corrected' | 'scale_mixed' | 'rotated' | 'labels_auto' | 'diagonal_skipped' | 'partial_axes'

export interface GridImport {
  /** 쓴 축 레이어와 후보 (사용자가 바꿀 수 있게) */
  layers: string[]; candidates: string[]
  /** 도면 단위 → mm: unitMm(단위) ÷ 축척 */
  unitMm: number; unitGuessed: boolean; scale: ScaleAnalysis | null; mmPerUnit: number
  /** 축망 회전 (도, 반시계) — 0 이 아니면 풀어서 읽었다 */
  rotationDeg: number
  axes: AxisLine[]
  /** 주축만 — 스펙 좌표 (m, 첫 주축 = 0) */
  xs: number[]; ys: number[]
  skippedDiagonal: number
  warnings: GridWarning[]
}

export interface GridOptions {
  /** 축 레이어를 직접 고른 경우 */
  layers?: string[]
  /** 가져올 평면 영역 (도면 단위) — 한 파일에 여러 장이 있을 때(axisRegions). 축선은 이 안의 것만 */
  box?: ScaleBox
  /** 영역 둘레 여유 (도면 단위) — 축 번호 버블·치수 문자는 축선 끝 바깥에 있다 */
  pad?: number
  /** 단위를 직접 고른 경우 (도면 단위 1 = ? mm) */
  unitMm?: number
  /** 축척 보정을 끄거나 직접 준 경우 (기하 ÷ 참값) */
  scaleFactor?: number
}

const inBox = (p: Pt, b?: ScaleBox) => !b || (p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY)
const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN }
const rot = (p: Pt, rad: number): Pt => ({ x: p.x * Math.cos(rad) - p.y * Math.sin(rad), y: p.x * Math.sin(rad) + p.y * Math.cos(rad) })

/** 축 레이어 고르기 — 天正 도면은 DOTE 에 축선, AXIS 에 축 번호·치수 선이 있으므로 DOTE 가 있으면 그것만 */
export function axisLayers(d: CadDrawing): { use: string[]; candidates: string[] } {
  const candidates = d.layers.filter((l) => l.lines > 0 && AXIS_LAYER.test(l.name) && !AXIS_NOT_LINE.test(l.name)).map((l) => l.name)
  const dote = candidates.filter((n) => /DOTE/i.test(n))
  return { use: dote.length ? dote : candidates, candidates }
}

/** 지배 방향 (도, 0~90) — 길이 가중 */
function dominantAngle(lines: { a: Pt; b: Pt }[]): number {
  const bins = new Map<number, number>()
  for (const { a, b } of lines) {
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (!len) continue
    const deg = ((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 90 + 90) % 90
    const k = Math.round(deg * 10) / 10 % 90
    bins.set(k, (bins.get(k) ?? 0) + len)
  }
  let best = 0, w = -1
  for (const [k, v] of bins) if (v > w) { best = k; w = v }
  return best > 45 ? best - 90 : best
}

/** 축 간격 중앙값으로 단위 추정 (도면 단위) — 보통 스팬 3~12 m */
function guessUnitMm(spacing: number): number {
  if (!(spacing > 0)) return 1
  if (spacing < 50) return 1000 // m
  if (spacing < 1500) return 10 // cm
  return 1 // mm
}

interface Cluster { pos: number; from: number; to: number; len: number }
/** 같은 위치(허용오차 tol)의 선을 하나의 축으로 — 위치는 길이 가중 평균, 구간은 합집합의 끝 */
function cluster(segs: { pos: number; a: number; b: number }[], tol: number): Cluster[] {
  const s = [...segs].sort((p, q) => p.pos - q.pos)
  const out: { w: number; sum: number; from: number; to: number; len: number }[] = []
  for (const g of s) {
    const len = Math.abs(g.b - g.a), last = out.at(-1)
    if (last && g.pos - last.sum / last.w <= tol) {
      last.w += len; last.sum += g.pos * len; last.from = Math.min(last.from, g.a, g.b); last.to = Math.max(last.to, g.a, g.b); last.len += len
    } else out.push({ w: len, sum: g.pos * len, from: Math.min(g.a, g.b), to: Math.max(g.a, g.b), len })
  }
  return out.map((c) => ({ pos: c.sum / c.w, from: c.from, to: c.to, len: c.len }))
}

/** 축 번호 기본값 — 세로축 1, 2, 3 … (좌→우), 가로축 A, B, C … (아래→위, I·O·Z 제외: GB/T 50001 7.0.4) */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXY'.split('')
export const autoLabel = (dir: 'X' | 'Y', i: number) => dir === 'X' ? String(i + 1) : i < LETTERS.length ? LETTERS[i] : `${LETTERS[Math.floor(i / LETTERS.length) - 1]}${LETTERS[i % LETTERS.length]}`
/** 축 번호로 볼 글자: 1, 12, A, AB, A1, 1/2, 1/A, X1 … */
const LABEL_TEXT = /^(?:\d{1,3}|[A-Z]{1,2}\d{0,2}|\d{1,2}\/[A-Z0-9]{1,3}|[A-Z]\/\d{1,2})$/i

export function extractAxisGrid(d: CadDrawing, o: GridOptions = {}): GridImport {
  const warnings: GridWarning[] = []
  const padded = o.box && { minX: o.box.minX - (o.pad ?? 0), minY: o.box.minY - (o.pad ?? 0), maxX: o.box.maxX + (o.pad ?? 0), maxY: o.box.maxY + (o.pad ?? 0) }
  const ents = d.entities.filter((e) => inBox(e.type === 'LINE' ? e.a : e.p, padded))
  const { use, candidates } = axisLayers(d)
  const layers = o.layers?.length ? o.layers : use
  if (!layers.length) warnings.push('no_axis_layer')
  const lines = ents.filter((e): e is Extract<CadEntity, { type: 'LINE' }> => e.type === 'LINE' && layers.includes(e.layer) && inBox(e.a, o.box) && inBox(e.b, o.box))

  /* 회전 — 지배 방향이 0 이 아니면 풀어서 읽는다 */
  const rotationDeg = lines.length ? dominantAngle(lines) : 0
  if (Math.abs(rotationDeg) > 0.05) warnings.push('rotated')
  const rad = -rotationDeg * Math.PI / 180
  const tl = lines.map((l) => ({ a: rot(l.a, rad), b: rot(l.b, rad) }))
  const vert: { pos: number; a: number; b: number }[] = [], horiz: { pos: number; a: number; b: number }[] = []
  let skippedDiagonal = 0
  for (const { a, b } of tl) {
    const deg = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 180
    if (Math.abs(deg - 90) <= ORTHO_DEG) vert.push({ pos: (a.x + b.x) / 2, a: a.y, b: b.y })
    else if (deg <= ORTHO_DEG || deg >= 180 - ORTHO_DEG) horiz.push({ pos: (a.y + b.y) / 2, a: a.x, b: b.x })
    else skippedDiagonal++
  }
  if (skippedDiagonal) warnings.push('diagonal_skipped')

  /* 단위·축척 — 축척은 치수 문자로(2× 출도), 단위는 $INSUNITS 또는 축 간격 */
  const scale = analyzeDrawingScale(ents, padded)
  const factor = o.scaleFactor ?? (scale && !scale.reject ? scale.factor : 1)
  if (factor !== 1 && o.scaleFactor === undefined) warnings.push('scale_corrected')
  if (scale?.reject === 'low-confidence') warnings.push('scale_mixed')
  const rough = (segs: typeof vert) => cluster(segs, 1e-6 + 1e-9 * Math.max(1, ...segs.map((s) => Math.abs(s.pos)))).map((c) => c.pos)
  const gaps = (p: number[]) => p.slice(1).map((v, i) => v - p[i]).filter((g) => g > 0)
  let unitMm = o.unitMm ?? INS_UNIT_MM[d.insUnits]
  const unitGuessed = !unitMm
  if (!unitMm) {
    unitMm = guessUnitMm(median([...gaps(rough(vert)), ...gaps(rough(horiz))]) / factor)
    warnings.push('unit_guessed')
  }
  const mmPerUnit = unitMm / factor
  const tol = SAME_AXIS_MM / mmPerUnit, minLen = MIN_AXIS_MM / mmPerUnit

  const cx = cluster(vert, tol).filter((c) => c.to - c.from >= minLen)
  const cy = cluster(horiz, tol).filter((c) => c.to - c.from >= minLen)

  /* 주축/부분 — 직교 방향 축망 범위(첫 축 ~ 끝 축)를 MAIN_COVER 이상 지나면 주축 */
  const span = (c: Cluster[]) => c.length ? [Math.min(...c.map((q) => q.pos)), Math.max(...c.map((q) => q.pos))] : [0, 0]
  const covers = (c: Cluster, range: number[]) => range[1] - range[0] <= tol || (Math.min(c.to, range[1]) - Math.max(c.from, range[0])) >= MAIN_COVER * (range[1] - range[0]) - tol
  const ry = span(cy), rx = span(cx)
  const toAxis = (dir: 'X' | 'Y', c: Cluster, range: number[]): AxisLine => ({ dir, pos: c.pos * mmPerUnit, from: c.from * mmPerUnit, to: c.to * mmPerUnit, main: covers(c, range), label: '', labelFrom: 'auto' })
  const axes = [...cx.map((c) => toAxis('X', c, ry)), ...cy.map((c) => toAxis('Y', c, rx))]
  if (axes.some((a) => !a.main)) warnings.push('partial_axes')

  /* 번호 — 축선 끝 너머의 원(버블) 안 글자, 원이 없으면 축선 연장선 위 글자. 같은 축 양 끝 번호가 다르면 많은 쪽 */
  const texts = ents.filter((e): e is Extract<CadEntity, { type: 'TEXT' }> => e.type === 'TEXT' && LABEL_TEXT.test(e.text.trim()))
    .map((t) => ({ text: t.text.trim().toUpperCase(), p: rot(t.p, rad), h: t.h }))
  const circles = ents.filter((e): e is Extract<CadEntity, { type: 'CIRCLE' }> => e.type === 'CIRCLE').map((c) => ({ p: rot(c.p, rad), r: c.r }))
    .filter((c) => c.r * mmPerUnit >= 150 && c.r * mmPerUnit <= 1500)
  const bubbleText = (c: { p: Pt; r: number }) => texts.filter((t) => Math.hypot(t.p.x - c.p.x, t.p.y - c.p.y) <= c.r * 1.2)
  for (const ax of axes) {
    const along = (p: Pt) => (ax.dir === 'X' ? p.y : p.x) * mmPerUnit, across = (p: Pt) => (ax.dir === 'X' ? p.x : p.y) * mmPerUnit
    const beyond = (v: number, reach: number) => (v > ax.to && v - ax.to <= reach) || (v < ax.from && ax.from - v <= reach)
    const votes = new Map<string, number>()
    for (const c of circles) {
      const r = c.r * mmPerUnit
      if (Math.abs(across(c.p) - ax.pos) > r * 0.5 || !beyond(along(c.p), r * 12)) continue
      for (const t of bubbleText(c)) votes.set(t.text, (votes.get(t.text) ?? 0) + 1)
    }
    if (!votes.size && !circles.length) for (const t of texts) {
      const h = Math.max(t.h * mmPerUnit, 300)
      if (Math.abs(across(t.p) - ax.pos) <= h * 1.5 && beyond(along(t.p), h * 10)) votes.set(t.text, (votes.get(t.text) ?? 0) + 1)
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best) { ax.label = best[0]; ax.labelFrom = 'drawing' }
  }
  /* 번호가 없거나 겹치면 자동 번호 (주축 1·2·3 / A·B·C, 부분 축선은 '부분/앞 주축' 1/2 식) */
  for (const dir of ['X', 'Y'] as const) {
    const list = axes.filter((a) => a.dir === dir).sort((a, b) => a.pos - b.pos)
    const main = list.filter((a) => a.main)
    const labels = main.map((a) => a.label)
    const usable = main.length > 0 && labels.every((l) => l) && new Set(labels).size === labels.length
    if (!usable) { main.forEach((a, i) => { a.label = autoLabel(dir, i); a.labelFrom = 'auto' }); if (main.length) warnings.push('labels_auto') }
    let prev = '', k = 0
    for (const a of list) {
      if (a.main) { prev = a.label; k = 0; continue }
      k++
      if (a.labelFrom !== 'drawing' || !usable) { a.label = `${k}/${prev || '0'}`; a.labelFrom = 'auto' }
    }
  }
  const mains = (dir: 'X' | 'Y') => axes.filter((a) => a.dir === dir && a.main).map((a) => a.pos).sort((a, b) => a - b)
  const toM = (p: number[]) => p.map((v) => Math.round(v - p[0]) / 1000)
  const xs = toM(mains('X')), ys = toM(mains('Y'))
  if (xs.length < 2 || ys.length < 2) warnings.push('few_axes')
  return { layers, candidates, unitMm, unitGuessed, scale, mmPerUnit, rotationDeg, axes, xs, ys, skippedDiagonal, warnings: [...new Set(warnings)] }
}

export interface AxisRegion { box: ScaleBox; lines: number }
/** 한 파일에 평면이 여러 장일 때 — 축선끼리 닿는(범위가 겹치는) 묶음이 평면 한 장. 축선이 많은 순.
    축 레이어 선의 범위를 서로 겹치면 합친다(교차하는 축선은 한 묶음). 영역 경계는 축선 범위 그대로(도면 단위) */
export function axisRegions(d: CadDrawing, layers: string[]): AxisRegion[] {
  const L = d.entities.filter((e): e is Extract<CadEntity, { type: 'LINE' }> => e.type === 'LINE' && layers.includes(e.layer)).slice(0, 5000)
  const box = L.map((l) => ({ minX: Math.min(l.a.x, l.b.x), minY: Math.min(l.a.y, l.b.y), maxX: Math.max(l.a.x, l.b.x), maxY: Math.max(l.a.y, l.b.y) }))
  const parent = box.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const eps = 1e-6 * Math.max(1, ...box.map((b) => Math.max(Math.abs(b.maxX), Math.abs(b.maxY))))
  const meet = (a: ScaleBox, b: ScaleBox) => a.minX <= b.maxX + eps && b.minX <= a.maxX + eps && a.minY <= b.maxY + eps && b.minY <= a.maxY + eps
  for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) if (find(i) !== find(j) && meet(box[i], box[j])) parent[find(i)] = find(j)
  const groups = new Map<number, AxisRegion>()
  box.forEach((b, i) => {
    const g = groups.get(find(i))
    if (!g) groups.set(find(i), { box: { ...b }, lines: 1 })
    else { g.lines++; g.box = { minX: Math.min(g.box.minX, b.minX), minY: Math.min(g.box.minY, b.minY), maxX: Math.max(g.box.maxX, b.maxX), maxY: Math.max(g.box.maxY, b.maxY) } }
  })
  return [...groups.values()].filter((g) => g.lines >= 2).sort((a, b) => b.lines - a.lines)
}
/** 영역 둘레 여유 — 영역 크기의 25 % (버블·치수 문자가 들어오게) */
export const regionPad = (r: AxisRegion) => 0.25 * Math.max(r.box.maxX - r.box.minX, r.box.maxY - r.box.minY)

/** 가져온 축망을 스펙에 넣기 — 주축 + 고른 부분 축선. 평면 형상(뺀 패널·삼각)과 가새는 축 번호가 바뀌므로 비운다 */
export function applyAxisGrid(spec: FrameSpec, g: GridImport, extra: AxisLine[] = []): FrameSpec {
  const pick = (dir: 'X' | 'Y') => [...g.axes.filter((a) => a.dir === dir && a.main), ...extra.filter((a) => a.dir === dir)].map((a) => a.pos).sort((a, b) => a - b)
  const px = pick('X'), py = pick('Y'), x0 = px[0] ?? 0, y0 = py[0] ?? 0
  const m = (p: number[], o: number) => [...new Set(p.map((v) => Math.round(v - o) / 1000))]
  return { ...spec, xs: m(px, x0), ys: m(py, y0), removed: [], cuts: [], braces: [] }
}
