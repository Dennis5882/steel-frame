/* 평면 형상 편집 (순수) — 패널(격자 칸) 켜기/끄기, 형상 프리셋, 가새 베이 정리, 스팬 변경 시 번호 유지.
   패널 (i, j) = xs[i]~xs[i+1] × ys[j]~ys[j+1]. 형상은 spec.removed(뺀 패널 번호)로만 저장 → 스팬 길이를 바꿔도 모양 유지 */
import type { Axis, BraceBay, FrameSpec } from './types'

export const PLAN_SHAPES = ['rect', 'L', 'T', 'cross', 'U', 'E', 'court'] as const
export type PlanShape = (typeof PLAN_SHAPES)[number]

/** 프리셋에 필요한 최소 스팬 수 [X, Y] */
export const SHAPE_MIN: Record<PlanShape, [number, number]> = { rect: [1, 1], L: [2, 2], T: [3, 2], cross: [3, 3], U: [3, 2], E: [2, 5], court: [3, 3] }
export const shapeFits = (shape: PlanShape, n: number, m: number) => n >= SHAPE_MIN[shape][0] && m >= SHAPE_MIN[shape][1]

/** 프리셋 → 뺄 패널 목록. n = X 스팬 수, m = Y 스팬 수 (평면 아래가 j = 0) */
export function shapeRemoved(shape: PlanShape, n: number, m: number): [number, number][] {
  const out: [number, number][] = []
  const a = Math.max(1, Math.floor(n / 3)), b = Math.max(1, Math.floor(m / 3))
  const off: (i: number, j: number) => boolean = {
    rect: () => false,
    /* 왼쪽 아래 1/4 제거 (예제 L자) */
    L: (i: number, j: number) => i < Math.ceil(n / 2) && j < Math.ceil(m / 2),
    /* 위쪽 띠 + 가운데 기둥 */
    T: (i: number, j: number) => j < m - Math.max(1, Math.floor(m / 2)) && (i < a || i >= n - a),
    cross: (i: number, j: number) => (i < a || i >= n - a) && (j < b || j >= m - b),
    /* ㄷ: 위쪽이 열린 U */
    U: (i: number, j: number) => i >= a && i < n - a && j >= m - Math.max(1, Math.floor(m / 2)),
    /* E: 왼쪽 등뼈 + 아래·가운데·위 날개 */
    E: (i: number, j: number) => i >= Math.max(1, Math.floor(n / 3)) && j !== 0 && j !== Math.floor(m / 2) && j !== m - 1,
    court: (i: number, j: number) => i >= 1 && i < n - 1 && j >= 1 && j < m - 1,
  }[shape]
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (off(i, j)) out.push([i, j])
  return out
}

const isOff = (spec: FrameSpec, i: number, j: number) => spec.removed.some(([a, b]) => a === i && b === j)

export function setPanel(spec: FrameSpec, i: number, j: number, on: boolean): void {
  spec.removed = spec.removed.filter(([a, b]) => !(a === i && b === j))
  if (!on) spec.removed.push([i, j])
}

/** 패널 연결성 (4방향) — 떨어진 덩어리가 있으면 false */
export function planConnected(spec: FrameSpec): boolean {
  const n = spec.xs.length - 1, m = spec.ys.length - 1
  const on: [number, number][] = []
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (!isOff(spec, i, j)) on.push([i, j])
  if (!on.length) return false
  const seen = new Set([`${on[0][0]},${on[0][1]}`]), stack = [on[0]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${i + di},${j + dj}`
      if (seen.has(k) || i + di < 0 || j + dj < 0 || i + di >= n || j + dj >= m || isOff(spec, i + di, j + dj)) continue
      seen.add(k); stack.push([i + di, j + dj])
    }
  }
  return seen.size === on.length
}

/** 보가 있는 격자 변 — X: (i,j)-(i+1,j), Y: (i,j)-(i,j+1) */
export function edgeExists(spec: FrameSpec, axis: Axis, i: number, j: number): boolean {
  const n = spec.xs.length - 1, m = spec.ys.length - 1
  const P = (a: number, b: number) => a >= 0 && b >= 0 && a < n && b < m && !isOff(spec, a, b)
  return axis === 'X' ? i >= 0 && i < n && (P(i, j - 1) || P(i, j)) : j >= 0 && j < m && (P(i - 1, j) || P(i, j))
}

/** 가새 → 베이 번호 목록 (격자에 없는 것은 버림) */
export function braceBays(spec: FrameSpec): { axis: Axis; i: number; j: number }[] {
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const out: { axis: Axis; i: number; j: number }[] = []
  for (const b of spec.braces) {
    const along = b.axis === 'X' ? spec.xs : spec.ys, across = b.axis === 'X' ? spec.ys : spec.xs
    const L = across.findIndex((v) => eq(v, b.line)), p = along.findIndex((v) => eq(v, b.a)), q = along.findIndex((v) => eq(v, b.b))
    if (L < 0 || p < 0 || q <= p) continue
    for (let s = p; s < q; s++) out.push(b.axis === 'X' ? { axis: 'X', i: s, j: L } : { axis: 'Y', i: L, j: s })
  }
  return out
}

/** 베이 번호 → 가새 (한 베이 = 한 항목, 중복·평면 밖 제거) */
export function baysToBraces(spec: FrameSpec, bays: { axis: Axis; i: number; j: number }[]): BraceBay[] {
  const seen = new Set<string>(), out: BraceBay[] = []
  for (const b of bays) {
    const k = `${b.axis}${b.i},${b.j}`
    if (seen.has(k) || !edgeExists(spec, b.axis, b.i, b.j)) continue
    seen.add(k)
    out.push(b.axis === 'X' ? { axis: 'X', line: spec.ys[b.j], a: spec.xs[b.i], b: spec.xs[b.i + 1], type: 'chevron' } : { axis: 'Y', line: spec.xs[b.i], a: spec.ys[b.j], b: spec.ys[b.j + 1], type: 'chevron' })
  }
  return out
}

export function toggleBrace(spec: FrameSpec, axis: Axis, i: number, j: number): void {
  const bays = braceBays(spec), k = bays.findIndex((b) => b.axis === axis && b.i === i && b.j === j)
  if (k >= 0) bays.splice(k, 1); else bays.push({ axis, i, j })
  spec.braces = baysToBraces(spec, bays)
}

/** 스팬 변경 — 패널·가새를 번호로 유지 (범위 밖은 버림) */
export function setGrid(spec: FrameSpec, xs: number[], ys: number[]): void {
  const bays = braceBays(spec)
  spec.xs = xs; spec.ys = ys
  spec.removed = spec.removed.filter(([i, j]) => i < xs.length - 1 && j < ys.length - 1)
  spec.braces = baysToBraces(spec, bays)
}

/** 형상 변경 후 — 평면 밖이 된 가새 정리 */
export function pruneBraces(spec: FrameSpec): void {
  spec.braces = baysToBraces(spec, braceBays(spec))
}
