/* 계산서용 3D 모델 그림 — 정투상 등각 SVG (3D 탭 'iso' 카메라와 같은 방향). Plotly·화면 캡처 없이 모델 좌표에서 바로 그린다.
   색 = 부재 종류(roleColor) 또는 강도비 구간(ratioColor, View3D BANDS 와 같은 경계). 흰 종이 기준 색. */
import type { ElementRole, FactoryModel } from '../domain/types'

export const ROLE_COLOR: Record<ElementRole, string> = {
  column: '#0b6e99', rafter: '#1d8653', purlin: '#5b6fd6', girt: '#c98a12', strut: '#c43030', post: '#2a9bc4', brace: '#c2399b',
}
const ROLE_WIDTH: Record<ElementRole, number> = { column: 2.2, rafter: 2.2, purlin: 0.8, girt: 0.8, strut: 1.3, post: 1.3, brace: 0.9 }

/** 강도비 구간 — 3D 탭 BANDS 와 같은 경계 (≤0.5 · ≤0.7 · ≤0.9 · ≤1.0 · >1.0) */
export const RATIO_BANDS: [number, string][] = [[0.5, '#2f55c9'], [0.7, '#1d8653'], [0.9, '#0e8f8a'], [1.0, '#b56d00'], [Infinity, '#c43030']]
export const ratioColor = (r: number) => RATIO_BANDS.find(([hi]) => r <= hi)![1]

/** 카메라 eye (3D 탭 iso 와 같음) → 화면 축 */
const EYE = { x: 1.5, y: -1.7, z: 1.0 }

export interface IsoOptions {
  /** 요소 id → 색. 없으면 부재 종류 색 */
  color?: (id: number, role: ElementRole) => string
  /** 범례 [색, 문구] */
  legend: [string, string][]
  width?: number
}

export function isoSvg(model: FactoryModel, o: IsoOptions): string {
  const n = Math.hypot(EYE.x, EYE.y, EYE.z)
  const f = { x: -EYE.x / n, y: -EYE.y / n, z: -EYE.z / n }
  /* right = f × z, up = right × f */
  const rl = Math.hypot(f.y, -f.x)
  const R = { x: f.y / rl, y: -f.x / rl, z: 0 }
  const U = { x: R.y * f.z - R.z * f.y, y: R.z * f.x - R.x * f.z, z: R.x * f.y - R.y * f.x }
  const byId = new Map(model.nodes.map((p) => [p.id, p]))
  const P = (p: { x: number; y: number; z: number }) => [p.x * R.x + p.y * R.y + p.z * R.z, -(p.x * U.x + p.y * U.y + p.z * U.z)] as const
  const depth = (p: { x: number; y: number; z: number }) => p.x * f.x + p.y * f.y + p.z * f.z
  const pts = model.nodes.map(P)
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const pad = 0.04 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad
  const w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad
  /* 먼 것부터 그려 가까운 부재가 위에 오게 */
  const els = [...model.elements].sort((a, b) =>
    depth(byId.get(b.n1)!) + depth(byId.get(b.n2)!) - depth(byId.get(a.n1)!) - depth(byId.get(a.n2)!))
  const k = (v: number) => +v.toFixed(3)
  const lines = els.map((e) => {
    const [ax, ay] = P(byId.get(e.n1)!), [bx, by] = P(byId.get(e.n2)!)
    const c = o.color?.(e.id, e.role) ?? ROLE_COLOR[e.role]
    return `<line x1="${k(ax)}" y1="${k(ay)}" x2="${k(bx)}" y2="${k(by)}" stroke="${c}" stroke-width="${ROLE_WIDTH[e.role]}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`
  }).join('')
  /* 지점 (z = 0) */
  const sup = model.nodes.filter((p) => p.z === 0).map((p) => { const [x, y] = P(p); return `<rect x="${k(x - pad * 0.12)}" y="${k(y)}" width="${k(pad * 0.24)}" height="${k(pad * 0.12)}" fill="#c43030"/>` }).join('')
  const legend = o.legend.map(([c, s], i) =>
    `<g transform="translate(${8 + (i % 4) * 150} ${12 + Math.floor(i / 4) * 16})"><rect width="18" height="4" y="-4" fill="${c}"/><text x="24" y="0" font-size="11" fill="#333">${s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]!)}</text></g>`).join('')
  const lh = Math.ceil(o.legend.length / 4) * 16 + 10
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${k(640 * (h / w) + lh)}" font-family="Arial,Helvetica,sans-serif" style="width:100%;max-width:${o.width ?? 760}px;height:auto">` +
    `<g>${legend}</g><svg x="0" y="${lh}" width="640" height="${k(640 * (h / w))}" viewBox="${k(x0)} ${k(y0)} ${k(w)} ${k(h)}">${lines}${sup}</svg></svg>`
}
