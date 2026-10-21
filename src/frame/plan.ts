/* 평면 형상 편집 (순수) — 패널(격자 칸) 상태, 형상 프리셋, 삼각형 자르기, 스팬 삽입·삭제, 가새 베이 정리.
   패널 (i, j) = xs[i]~xs[i+1] × ys[j]~ys[j+1]. 상태: 전체 / 없음(spec.removed) / 삼각(spec.cuts, 한 모서리를 대각선으로 잘라냄).
   형상은 번호로만 저장 → 스팬 길이를 바꿔도 모양 유지, 스팬을 넣고 빼면 번호를 밀어서 유지. geometry.ts 가 이 규칙으로 절점·보를 만든다 */
import type { Axis, BraceBay, FrameSpec } from './types'

/** 패널 모서리: 0 = 좌하(SW), 1 = 우하(SE), 2 = 우상(NE), 3 = 좌상(NW) */
export type Corner = 0 | 1 | 2 | 3
/** 모서리의 격자점 오프셋 [di, dj] */
export const CORNER_OFF: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
/** 변: 아래(SW–SE), 오른쪽(SE–NE), 위(NE–NW), 왼쪽(NW–SW) — 양 끝 모서리 */
export const SIDES = { bottom: [0, 1], right: [1, 2], top: [2, 3], left: [3, 0] } as const
export type Side = keyof typeof SIDES

export type PanelState = 'full' | 'off' | Corner

export function panelState(spec: FrameSpec, i: number, j: number): PanelState {
  if (i < 0 || j < 0 || i >= spec.xs.length - 1 || j >= spec.ys.length - 1) return 'off'
  if (spec.removed.some(([a, b]) => a === i && b === j)) return 'off'
  const c = (spec.cuts ?? []).find(([a, b]) => a === i && b === j)
  return c ? c[2] : 'full'
}
export const panelOn = (spec: FrameSpec, i: number, j: number) => panelState(spec, i, j) !== 'off'
export function cornerKept(spec: FrameSpec, i: number, j: number, c: Corner): boolean {
  const s = panelState(spec, i, j)
  return s !== 'off' && s !== c
}
export function sideKept(spec: FrameSpec, i: number, j: number, side: Side): boolean {
  const s = panelState(spec, i, j)
  return s !== 'off' && !(SIDES[side] as readonly number[]).includes(s as number)
}
/** 삼각 패널의 대각선 양 끝 모서리 (잘린 모서리의 이웃 둘) */
export const diagonalOf = (cut: Corner): [Corner, Corner] => [((cut + 1) % 4) as Corner, ((cut + 3) % 4) as Corner]
/** 남은 모서리 (반시계) */
export const keptCorners = (s: PanelState): Corner[] => s === 'off' ? [] : ([0, 1, 2, 3] as Corner[]).filter((c) => c !== s)

/** 삼각 도구 — 누른 모서리 c 에 따른 다음 상태.
    빈 칸: c 를 포함하는 삼각형을 붙임(맞은편 모서리를 자른 상태) · 전체 칸: c 를 잘라냄
    삼각 칸: 잘린 모서리 → 전체로 복구, 직각 모서리(잘린 것의 맞은편) → 지움, 대각선 끝 → 그쪽으로 돌림 */
export function triNext(st: PanelState, c: Corner): PanelState {
  const opp = ((c + 2) % 4) as Corner
  if (st === 'off') return opp
  if (st === 'full') return c
  if (st === c) return 'full'
  if (st === opp) return 'off'
  return c
}
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

export function applyShape(spec: FrameSpec, shape: PlanShape): void {
  spec.removed = shapeRemoved(shape, spec.xs.length - 1, spec.ys.length - 1)
  spec.cuts = []
  pruneBraces(spec)
}

/** 패널 상태 설정 (전체 / 없음 / 삼각) */
export function setPanelState(spec: FrameSpec, i: number, j: number, s: PanelState): void {
  spec.removed = spec.removed.filter(([a, b]) => !(a === i && b === j))
  spec.cuts = (spec.cuts ?? []).filter(([a, b]) => !(a === i && b === j))
  if (s === 'off') spec.removed.push([i, j])
  else if (s !== 'full') spec.cuts.push([i, j, s])
  pruneBraces(spec)
}
export const setPanel = (spec: FrameSpec, i: number, j: number, on: boolean) => setPanelState(spec, i, j, on ? 'full' : 'off')

/** 패널 연결성 — 두 패널이 공유 변을 모두 가지고 있을 때 이어진 것으로 본다 (삼각 패널 포함) */
export function planConnected(spec: FrameSpec): boolean {
  const n = spec.xs.length - 1, m = spec.ys.length - 1
  const on: [number, number][] = []
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (panelOn(spec, i, j)) on.push([i, j])
  if (!on.length) return false
  const link: [number, number, Side, Side][] = [[1, 0, 'right', 'left'], [-1, 0, 'left', 'right'], [0, 1, 'top', 'bottom'], [0, -1, 'bottom', 'top']]
  const seen = new Set([`${on[0][0]},${on[0][1]}`]), stack = [on[0]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    for (const [di, dj, s1, s2] of link) {
      const a = i + di, b = j + dj, k = `${a},${b}`
      if (seen.has(k) || !panelOn(spec, a, b) || !sideKept(spec, i, j, s1) || !sideKept(spec, a, b, s2)) continue
      seen.add(k); stack.push([a, b])
    }
  }
  return seen.size === on.length
}

/** 보가 있는 격자 변 — X: (i,j)-(i+1,j), Y: (i,j)-(i,j+1). 인접 패널 중 하나라도 그 변을 가지면 있음 */
export function edgeExists(spec: FrameSpec, axis: Axis, i: number, j: number): boolean {
  return axis === 'X' ? sideKept(spec, i, j - 1, 'top') || sideKept(spec, i, j, 'bottom') : sideKept(spec, i - 1, j, 'right') || sideKept(spec, i, j, 'left')
}
/** 외곽 변 (한쪽 패널만 가짐) — 외곽 보 선하중·외곽 길이 */
export function edgeIsPerimeter(spec: FrameSpec, axis: Axis, i: number, j: number): boolean {
  return axis === 'X' ? sideKept(spec, i, j - 1, 'top') !== sideKept(spec, i, j, 'bottom') : sideKept(spec, i - 1, j, 'right') !== sideKept(spec, i, j, 'left')
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

/** 형상 변경 후 — 평면 밖이 된 가새 정리 */
export function pruneBraces(spec: FrameSpec): void {
  spec.braces = baysToBraces(spec, braceBays(spec))
}

const r6 = (v: number) => +v.toFixed(6)
export const spansOf = (a: number[]) => a.slice(1).map((v, i) => r6(v - a[i]))
export const coordsOf = (spans: number[], start = 0) => spans.reduce<number[]>((acc, s) => [...acc, r6(acc.at(-1)! + s)], [start])

/* 축 번호 — 기본은 세로축 1, 2, 3 … (좌→우), 가로축 A, B, C … (아래→위). I·O·Z 는 숫자와 헷갈려 쓰지 않는다 (GB/T 50001 7.0.4).
   spec.axisLabels 가 있으면 그것 (DXF 가져오기·사용자 입력). 스팬을 넣고 빼면 번호도 같이 움직인다 */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXY'.split('')
export const autoLabel = (dir: Axis, i: number) => dir === 'X' ? String(i + 1) : i < LETTERS.length ? LETTERS[i] : `${LETTERS[Math.floor(i / LETTERS.length) - 1]}${LETTERS[i % LETTERS.length]}`
const labelKey = (axis: Axis) => (axis === 'X' ? 'x' : 'y')
/** 축 번호 목록 (축 수만큼) */
export function axisLabels(spec: FrameSpec, axis: Axis): string[] {
  const n = (axis === 'X' ? spec.xs : spec.ys).length, own = spec.axisLabels?.[labelKey(axis)]
  return Array.from({ length: n }, (_, i) => own?.[i] || autoLabel(axis, i))
}
export const axisLabel = (spec: FrameSpec, axis: Axis, i: number) => spec.axisLabels?.[labelKey(axis)]?.[i] || autoLabel(axis, i)
/** 축 번호로 쓸 수 있는 글자 — 도면(DXF R12)·계산서 글꼴에 있는 ASCII, 6자 이내 (1, A, 1/2, A1, 2' …) */
export const LABEL_OK = /^[A-Za-z0-9/'.-]{1,6}$/
/** 사용자 입력 "1, 2, 3" → 축 수와 같고 겹치지 않으면 목록, 아니면 null */
export function parseLabels(text: string, n: number): string[] | null {
  const v = text.split(/[,\s，、]+/).filter(Boolean)
  return v.length === n && v.every((l) => LABEL_OK.test(l)) && new Set(v).size === n ? v : null
}
/** 한 방향 번호 바꾸기 (null = 기본으로) */
export function setAxisLabels(spec: FrameSpec, axis: Axis, list: string[] | null): void {
  const cur = { x: axisLabels(spec, 'X'), y: axisLabels(spec, 'Y') }
  cur[labelKey(axis)] = list ?? Array.from({ length: cur[labelKey(axis)].length }, (_, i) => autoLabel(axis, i))
  const isAuto = (a: Axis) => cur[labelKey(a)].every((l, i) => l === autoLabel(a, i))
  spec.axisLabels = isAuto('X') && isAuto('Y') ? undefined : cur
}
/** 번호 목록 길이 맞추기 — 끝에서 늘리면 기본 번호(겹치면 ' 붙임), 줄이면 끝을 버림 */
function fitLabels(spec: FrameSpec): void {
  if (!spec.axisLabels) return
  for (const axis of ['X', 'Y'] as const) {
    const n = (axis === 'X' ? spec.xs : spec.ys).length, k = labelKey(axis)
    const list = spec.axisLabels[k].slice(0, n)
    for (let i = list.length; i < n; i++) { let l = autoLabel(axis, i); while (list.includes(l)) l += "'"; list.push(l) }
    spec.axisLabels[k] = list
  }
}
/** 격자선 at 에 새 축 번호 — 앞 축 번호 p 뒤의 부분 축선 식 1/p, 2/p … (GB/T 50001 附加轴线) */
function insertLabel(spec: FrameSpec, axis: Axis, at: number): void {
  if (!spec.axisLabels) return
  const list = spec.axisLabels[labelKey(axis)], prev = list[at - 1] ?? '0'
  let k = 1, l = `${k}/${prev}`
  while (list.includes(l)) l = `${++k}/${prev}`
  list.splice(at, 0, LABEL_OK.test(l) ? l : `${prev}'`)
}

/** 스팬 길이·개수 변경 (끝에서 늘리고 줄임) — 패널·가새는 번호로 유지 (범위 밖은 버림) */
export function setGrid(spec: FrameSpec, xs: number[], ys: number[]): void {
  const bays = braceBays(spec)
  spec.xs = xs; spec.ys = ys
  fitLabels(spec)
  spec.removed = spec.removed.filter(([i, j]) => i < xs.length - 1 && j < ys.length - 1)
  spec.cuts = (spec.cuts ?? []).filter(([i, j]) => i < xs.length - 1 && j < ys.length - 1)
  spec.braces = baysToBraces(spec, bays)
}

/** 방향 axis 의 스팬 번호 at 위치에 길이 len 스팬 삽입 — 그 뒤 패널·가새 번호를 한 칸 민다. 새 스팬의 패널은 옆 스팬과 같은 상태(삼각은 전체) */
export function insertSpan(spec: FrameSpec, axis: Axis, at: number, len: number): void {
  const bays = braceBays(spec)
  const shift = (v: number) => (v >= at ? v + 1 : v)
  const src = Math.min(at, (axis === 'X' ? spec.xs : spec.ys).length - 2)  // 복사할 이웃 스팬
  const copyOff = spec.removed.filter(([i, j]) => (axis === 'X' ? i : j) === src).map(([i, j]): [number, number] => axis === 'X' ? [at, j] : [i, at])
  spec.removed = [...spec.removed.map(([i, j]): [number, number] => axis === 'X' ? [shift(i), j] : [i, shift(j)]), ...copyOff]
  spec.cuts = (spec.cuts ?? []).map(([i, j, c]): [number, number, Corner] => axis === 'X' ? [shift(i), j, c] : [i, shift(j), c])
  const sp = spansOf(axis === 'X' ? spec.xs : spec.ys); sp.splice(at, 0, len)
  const co = coordsOf(sp, (axis === 'X' ? spec.xs : spec.ys)[0])
  if (axis === 'X') spec.xs = co; else spec.ys = co
  insertLabel(spec, axis, at + 1) // 새 격자선은 at+1
  /* 가새: 스팬 방향 번호는 밀고, 직교 격자선 번호(새 격자선이 at+1 에 생김)도 민다 */
  spec.braces = baysToBraces(spec, bays.map((b) => {
    if (axis === 'X') return b.axis === 'X' ? { ...b, i: shift(b.i) } : { ...b, i: b.i > at ? b.i + 1 : b.i }
    return b.axis === 'Y' ? { ...b, j: shift(b.j) } : { ...b, j: b.j > at ? b.j + 1 : b.j }
  }))
}

/** 스팬 at 삭제 — 그 스팬의 패널·가새는 버리고 뒤 번호를 당긴다 (스팬 1개는 남김) */
export function deleteSpan(spec: FrameSpec, axis: Axis, at: number): void {
  const arr = axis === 'X' ? spec.xs : spec.ys
  if (arr.length <= 2) return
  const bays = braceBays(spec)
  const pull = (v: number) => (v > at ? v - 1 : v)
  const idx = (i: number, j: number) => (axis === 'X' ? i : j)
  spec.removed = spec.removed.filter(([i, j]) => idx(i, j) !== at).map(([i, j]): [number, number] => axis === 'X' ? [pull(i), j] : [i, pull(j)])
  spec.cuts = (spec.cuts ?? []).filter(([i, j]) => idx(i, j) !== at).map(([i, j, c]): [number, number, Corner] => axis === 'X' ? [pull(i), j, c] : [i, pull(j), c])
  const sp = spansOf(arr); sp.splice(at, 1)
  const co = coordsOf(sp, arr[0])
  if (axis === 'X') spec.xs = co; else spec.ys = co
  spec.axisLabels?.[labelKey(axis)].splice(at + 1, 1) // 격자선 at+1 이 사라짐
  /* 격자선 at+1 이 사라짐: 스팬 방향 베이 at 은 버리고, 그 격자선 위 직교 가새도 버림 */
  spec.braces = baysToBraces(spec, bays.flatMap((b) => {
    if (axis === 'X') { if (b.axis === 'X') return b.i === at ? [] : [{ ...b, i: pull(b.i) }]; return b.i === at + 1 ? [] : [{ ...b, i: b.i > at + 1 ? b.i - 1 : b.i }] }
    if (b.axis === 'Y') return b.j === at ? [] : [{ ...b, j: pull(b.j) }]
    return b.j === at + 1 ? [] : [{ ...b, j: b.j > at + 1 ? b.j - 1 : b.j }]
  }))
}

/** 스팬 목록 입력 "6, 6, 8" 또는 줄임 "4@6, 8" (6 m 4개 + 8 m) → 스팬 배열 (잘못된 입력은 null) */
export function parseSpans(text: string): number[] | null {
  const out: number[] = []
  for (const tok of text.split(/[,\s，、]+/).filter(Boolean)) {
    const m = tok.match(/^(\d+)\s*[@*×x]\s*(\d*\.?\d+)$/i)
    if (m) { const n = +m[1], L = +m[2]; if (!(n >= 1 && n <= 100 && L > 0)) return null; for (let k = 0; k < n; k++) out.push(L); continue }
    const v = Number(tok)
    if (!(Number.isFinite(v) && v > 0)) return null
    out.push(v)
  }
  return out.length && out.length <= 100 ? out : null
}
/** 스팬 배열 → 줄임 표기 ("6, 6, 6, 8" → "3@6, 8") */
export function formatSpans(sp: number[]): string {
  const out: string[] = []
  for (let k = 0; k < sp.length;) {
    let e = k; while (e + 1 < sp.length && sp[e + 1] === sp[k]) e++
    const n = e - k + 1
    out.push(n > 1 ? `${n}@${sp[k]}` : String(sp[k])); k = e + 1
  }
  return out.join(', ')
}
