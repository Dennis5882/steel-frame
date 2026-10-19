/* 다층 강골조 형상 생성 (순수) — 격자 + 빈 영역(L자 등) → 절점·기둥·보·가새.
   人자형 가새는 아래층 양 기둥 하단 → 위층 보 중앙. 보 중앙에 절점을 넣어 보를 둘로 나누고, 설계 부재는 원래 보 하나(member)로 묶는다.
   예제 검증: 절점 129 · 요소 284 (docs/tutorial-cn-braced-frame.md 1절). */
import type { FrameElement, FrameModel, FrameNode, FrameSpec } from './types'
import { planConnected } from './plan'

const EPS = 1e-6
const near = (a: number, b: number) => Math.abs(a - b) < EPS

export function levelsOf(spec: FrameSpec): number[] {
  const z = [spec.baseZ]
  for (const h of spec.heights) z.push(+(z[z.length - 1] + h).toFixed(6))
  return z
}

/** 패널(i,j) = xs[i]~xs[i+1] × ys[j]~ys[j+1] 존재 여부 */
export function panelExists(spec: FrameSpec, i: number, j: number): boolean {
  const { xs, ys } = spec
  if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false
  return !spec.removed.some(([a, b]) => a === i && b === j)
}

export function validateSpec(spec: FrameSpec): string[] {
  const errs: string[] = []
  const inc = (a: number[]) => a.every((v, i) => i === 0 || v > a[i - 1])
  if (spec.xs.length < 2 || !inc(spec.xs)) errs.push('xs must have ≥2 increasing grid lines')
  if (spec.ys.length < 2 || !inc(spec.ys)) errs.push('ys must have ≥2 increasing grid lines')
  if (!spec.heights.length || spec.heights.some((h) => !(h > 0))) errs.push('story heights must be > 0')
  if (spec.storyNames.length !== spec.heights.length + 1) errs.push('storyNames length must be heights + 1')
  if (!errs.length && !planConnected(spec)) errs.push('plan must be one connected region of panels')
  return errs
}

export function buildFrame(spec: FrameSpec): FrameModel {
  const errs = validateSpec(spec)
  if (errs.length) throw new Error(errs.join('; '))
  const { xs, ys } = spec
  const nx = xs.length, ny = ys.length
  const levels = levelsOf(spec), ns = spec.heights.length
  const P = (i: number, j: number) => panelExists(spec, i, j)
  const gridNode = (i: number, j: number) => P(i - 1, j - 1) || P(i, j - 1) || P(i - 1, j) || P(i, j)

  /* 절점: 레벨 → j → i */
  const nodes: FrameNode[] = []
  const at = new Map<string, number>()
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`
  for (let k = 0; k <= ns; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!gridNode(i, j)) continue
    const id = nodes.length + 1
    nodes.push({ id, x: xs[i], y: ys[j], z: levels[k], level: k })
    at.set(key(i, j, k), id)
  }
  const supports = nodes.filter((n) => n.level === 0).map((n) => n.id)

  /* 가새 베이 → (축, 골조선, 베이 시작 index) 집합 */
  const ix = (v: number) => xs.findIndex((x) => near(x, v)), jy = (v: number) => ys.findIndex((y) => near(y, v))
  const bracedBays: { axis: 'X' | 'Y'; i: number; j: number }[] = []
  for (const b of spec.braces) {
    if (b.axis === 'X') {
      const j = jy(b.line), i0 = ix(b.a), i1 = ix(b.b)
      if (j < 0 || i0 < 0 || i1 <= i0) throw new Error(`brace X line ${b.line} ${b.a}–${b.b} not on grid`)
      for (let i = i0; i < i1; i++) bracedBays.push({ axis: 'X', i, j })
    } else {
      const i = ix(b.line), j0 = jy(b.a), j1 = jy(b.b)
      if (i < 0 || j0 < 0 || j1 <= j0) throw new Error(`brace Y line ${b.line} ${b.a}–${b.b} not on grid`)
      for (let j = j0; j < j1; j++) bracedBays.push({ axis: 'Y', i, j })
    }
  }
  const edgeX = (i: number, j: number) => P(i, j - 1) || P(i, j) // (i,j)-(i+1,j)
  const edgeY = (i: number, j: number) => P(i - 1, j) || P(i, j) // (i,j)-(i,j+1)
  for (const b of bracedBays) if (!(b.axis === 'X' ? edgeX(b.i, b.j) : edgeY(b.i, b.j))) throw new Error(`brace bay outside plan: ${b.axis} ${b.i},${b.j}`)

  /* 보 중앙 절점 (가새 꼭짓점) — 레벨 1..ns */
  const mid = new Map<string, number>()
  for (let k = 1; k <= ns; k++) for (const b of bracedBays) {
    const [x, y] = b.axis === 'X' ? [(xs[b.i] + xs[b.i + 1]) / 2, ys[b.j]] : [xs[b.i], (ys[b.j] + ys[b.j + 1]) / 2]
    const id = nodes.length + 1
    nodes.push({ id, x, y, z: levels[k], level: k })
    mid.set(`${b.axis}${b.i},${b.j},${k}`, id)
  }

  const elements: FrameElement[] = []
  let member = 0
  const add = (e: Omit<FrameElement, 'id'>) => { elements.push({ id: elements.length + 1, ...e }) }

  /* 기둥 */
  for (let k = 1; k <= ns; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = at.get(key(i, j, k - 1)), b = at.get(key(i, j, k))
    if (a && b) add({ role: 'column', n1: a, n2: b, section: spec.sections.column, story: k, member: ++member })
  }
  /* 보 — 가새 꼭짓점이 있으면 둘로 나눔 */
  const beam = (k: number, a: number, b: number, axis: 'X' | 'Y', line: number, edge: boolean, m?: number) => {
    const mm = ++member
    if (m) {
      add({ role: 'beam', n1: a, n2: m, section: spec.sections.beam, story: k, axis, line, member: mm, edge })
      add({ role: 'beam', n1: m, n2: b, section: spec.sections.beam, story: k, axis, line, member: mm, edge })
    } else add({ role: 'beam', n1: a, n2: b, section: spec.sections.beam, story: k, axis, line, member: mm, edge })
  }
  for (let k = 1; k <= ns; k++) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx - 1; i++) {
      if (!edgeX(i, j)) continue
      beam(k, at.get(key(i, j, k))!, at.get(key(i + 1, j, k))!, 'X', ys[j], P(i, j - 1) !== P(i, j), mid.get(`X${i},${j},${k}`))
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny - 1; j++) {
      if (!edgeY(i, j)) continue
      beam(k, at.get(key(i, j, k))!, at.get(key(i, j + 1, k))!, 'Y', xs[i], P(i - 1, j) !== P(i, j), mid.get(`Y${i},${j},${k}`))
    }
  }
  /* 가새 — 층 k: 레벨 k-1 의 베이 양 끝 → 레벨 k 의 보 중앙 */
  for (let k = 1; k <= ns; k++) for (const b of bracedBays) {
    const apex = mid.get(`${b.axis}${b.i},${b.j},${k}`)!
    const [p, q] = b.axis === 'X' ? [key(b.i, b.j, k - 1), key(b.i + 1, b.j, k - 1)] : [key(b.i, b.j, k - 1), key(b.i, b.j + 1, k - 1)]
    const line = b.axis === 'X' ? ys[b.j] : xs[b.i]
    add({ role: 'brace', n1: at.get(p)!, n2: apex, section: spec.sections.brace, story: k, axis: b.axis, line, member: ++member })
    add({ role: 'brace', n1: at.get(q)!, n2: apex, section: spec.sections.brace, story: k, axis: b.axis, line, member: ++member })
  }

  /* 바닥 영역: 패널마다 4 꼭짓점 (FBLA 양방향 분배) */
  const floorRegions: FrameModel['floorRegions'] = []
  let floorArea = 0, perimeter = 0
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) if (P(i, j)) floorArea += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx - 1; i++) if (edgeX(i, j) && P(i, j - 1) !== P(i, j)) perimeter += xs[i + 1] - xs[i]
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny - 1; j++) if (edgeY(i, j) && P(i - 1, j) !== P(i, j)) perimeter += ys[j + 1] - ys[j]
  for (let k = 1; k <= ns; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!P(i, j)) continue
    floorRegions.push({ level: k, nodes: [key(i, j, k), key(i + 1, j, k), key(i + 1, j + 1, k), key(i, j + 1, k)].map((s) => at.get(s)!) })
  }
  return { nodes, elements, supports, levels, floorRegions, floorArea, perimeter }
}

export const elementLength = (m: FrameModel, e: FrameElement) => {
  const a = m.nodes[e.n1 - 1], b = m.nodes[e.n2 - 1]
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}
