/* 3D 단면 형상 (순수) — 선 대신 실제 단면 치수로 부재를 입체로 (Plotly mesh3d 용 정점·삼각형).
   H형강 = 플랜지 2 + 웨브 1 상자, 립 C형강 = 웨브·플랜지 2·립 2 상자, 강관 = 12각 기둥.
   단면 방향(강축 춤 방향 d): 골조(기둥·지붕보) = 골조면(X–Z) 안, 스트럿 = 연직, 퍼린 = 지붕면 법선,
   거트·풍주 = 벽면 법선(수평), 가새 = 원형이라 무관. 그리기용 근사 — 해석 모델의 국부축과 같게 맞춘 것은 아님. */
import { ccDims } from '../codes/twColdFormed'
import { sectionProps } from '../domain/sections'
import type { Element, FactoryModel, Node } from '../domain/types'

type V3 = [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l) }

export interface Mesh { x: number[]; y: number[]; z: number[]; i: number[]; j: number[]; k: number[] }
export const emptyMesh = (): Mesh => ({ x: [], y: [], z: [], i: [], j: [], k: [] })

/** 강축 춤 방향(전역) — 부재 축 ex 에 직교하도록 보정 */
function depthDir(e: Element, ex: V3, a: Node, rising: (x: number) => boolean, slope: number): V3 {
  let d: V3
  switch (e.addition === 'platform-column' ? 'column' : e.role) {
    case 'column': d = [1, 0, 0]; break
    case 'rafter': d = cross([0, 1, 0], ex); break // 골조면 안, 축에 직교
    case 'strut': d = [0, 0, 1]; break
    case 'purlin': { const s = rising(a.x) ? -1 : 1; /* 오르막 면 = 법선 −x 쪽 */ d = [s * Math.sin(Math.atan(slope)), 0, Math.cos(Math.atan(slope))]; break }
    default: d = cross([0, 0, 1], ex) // 거트·풍주: 벽면 법선(수평)
  }
  if (Math.hypot(...cross(d, ex)) < 1e-6) d = [0, 0, 1]
  return unit(sub(d, mul(ex, dot(d, ex))))
}

/** 단면 직사각형들 (u = 폭 방향, v = 춤 방향, mm) */
function rects(section: string): [number, number, number, number][] | null {
  const kind = section.trim().split(/\s+/)[0]
  if (kind === 'CC') {
    const { H, B, C, t } = ccDims(section)
    const u0 = -B / 2
    return [[u0, u0 + t, -H / 2, H / 2], [u0, -u0, H / 2 - t, H / 2], [u0, -u0, -H / 2, -H / 2 + t], [-u0 - t, -u0, H / 2 - C, H / 2 - t], [-u0 - t, -u0, -H / 2 + t, -H / 2 + C]]
  }
  const p = sectionProps(section)
  if (p.kind !== 'H') return null
  return [[-p.bf / 2, p.bf / 2, p.d / 2 - p.tf, p.d / 2], [-p.bf / 2, p.bf / 2, -p.d / 2, -p.d / 2 + p.tf], [-p.tw / 2, p.tw / 2, -p.d / 2 + p.tf, p.d / 2 - p.tf]]
}

/** 상자 (A·B 두 끝 단면 4점씩) 를 메시에 추가 */
function pushPrism(m: Mesh, ring: V3[], A: V3, B: V3) {
  const n = ring.length, base = m.x.length
  for (const end of [A, B]) for (const p of ring) { const q = add(end, p); m.x.push(q[0]); m.y.push(q[1]); m.z.push(q[2]) }
  for (let s = 0; s < n; s++) {
    const a = base + s, b = base + ((s + 1) % n), c = a + n, d = b + n
    m.i.push(a, b); m.j.push(b, d); m.k.push(c, c)
  }
  /* 양 끝 마구리 (부채꼴) */
  for (const off of [0, n]) for (let s = 1; s < n - 1; s++) { m.i.push(base + off); m.j.push(base + off + s); m.k.push(base + off + s + 1) }
}

/** 요소 하나를 메시에 추가 (좌표 m) */
/** rising(x): 퍼린 위치 x 의 지붕면이 오르막(x 증가 시 높아짐)인지 — 퍼린 춤 방향(지붕 법선) */
export function addElementSolid(m: Mesh, e: Element, a: Node, b: Node, rising: (x: number) => boolean, slope: number) {
  const A: V3 = [a.x, a.y, a.z], B: V3 = [b.x, b.y, b.z]
  const ex = unit(sub(B, A)), dv = depthDir(e, ex, a, rising, slope), uv = unit(cross(ex, dv))
  const kind = e.section.trim().split(/\s+/)[0]
  if (kind === 'P') {
    const r = sectionProps(e.section).d / 2000
    const ring: V3[] = Array.from({ length: 12 }, (_, s) => { const th = (s / 12) * 2 * Math.PI; return add(mul(uv, r * Math.cos(th)), mul(dv, r * Math.sin(th))) })
    pushPrism(m, ring, A, B)
    return
  }
  for (const [u0, u1, v0, v1] of rects(e.section) ?? []) {
    const P = (u: number, v: number) => add(mul(uv, u / 1000), mul(dv, v / 1000))
    pushPrism(m, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], A, B)
  }
}

/** 묶음별 메시 — key(e) 로 나눈다 (부재 종류 또는 강도비 구간) */
export function solidMeshes(model: FactoryModel, rising: (x: number) => boolean, slope: number, key: (e: Element) => string | null): Map<string, Mesh> {
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const out = new Map<string, Mesh>()
  for (const e of model.elements) {
    const k = key(e)
    if (k === null) continue
    const m = out.get(k) ?? emptyMesh()
    out.set(k, m)
    addElementSolid(m, e, byId.get(e.n1)!, byId.get(e.n2)!, rising, slope)
  }
  return out
}
