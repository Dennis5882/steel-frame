/* 평면 스케치 — 격자선(X 1,2,3… / Y A,B,C…), 있는 패널, 빈 영역, 가새 베이(굵은 선 + 人 표시). 3D 와 별개의 설명 그림 */
import { panelExists } from '../../frame/geometry'
import type { FrameSpec } from '../../frame/types'

export const gridLabelX = (i: number) => String(i + 1)
export const gridLabelY = (j: number) => String.fromCharCode(65 + j)

export function FramePlan({ spec, highlight }: { spec: FrameSpec; highlight?: number }) {
  const { xs, ys } = spec
  const W = 300, H = 210, pad = 30
  const Lx = xs.at(-1)! - xs[0] || 1, Ly = ys.at(-1)! - ys[0] || 1
  const k = Math.min((W - 2 * pad) / Lx, (H - 2 * pad) / Ly)
  const ox = (W - Lx * k) / 2, oy = (H + Ly * k) / 2
  const X = (x: number) => ox + (x - xs[0]) * k, Y = (y: number) => oy - (y - ys[0]) * k
  const panels: [number, number][] = []
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) if (panelExists(spec, i, j)) panels.push([i, j])
  return <div className="mw-sketch fr-plan" aria-hidden="true">
    <svg viewBox={`0 0 ${W} ${H}`} focusable="false">
      {panels.map(([i, j]) => <rect key={`${i},${j}`} x={X(xs[i])} y={Y(ys[j + 1])} width={(xs[i + 1] - xs[i]) * k} height={(ys[j + 1] - ys[j]) * k} fill="var(--tile)" stroke="var(--cyan)" strokeWidth="1.2" />)}
      {spec.voids.map((v, i) => <rect key={`v${i}`} x={X(v.x0)} y={Y(v.y1)} width={(v.x1 - v.x0) * k} height={(v.y1 - v.y0) * k} fill="none" stroke="var(--muted)" strokeDasharray="3 3" />)}
      {xs.map((x, i) => <g key={`x${i}`}><path d={`M${X(x)} ${Y(ys.at(-1)!) - 8} V${Y(ys[0]) + 8}`} stroke="var(--border)" strokeDasharray="2 3" />
        <text x={X(x)} y={Y(ys[0]) + 20} textAnchor="middle" fontSize="10">{gridLabelX(i)}</text></g>)}
      {ys.map((y, j) => <g key={`y${j}`}><path d={`M${X(xs[0]) - 8} ${Y(y)} H${X(xs.at(-1)!) + 8}`} stroke="var(--border)" strokeDasharray="2 3" />
        <text x={X(xs[0]) - 16} y={Y(y) + 3} textAnchor="middle" fontSize="10">{gridLabelY(j)}</text></g>)}
      {spec.braces.map((b, n) => {
        const bays = (b.axis === 'X' ? xs : ys).map((v, i, a) => [v, a[i + 1]] as const).filter(([p, q]) => q !== undefined && p >= b.a - 1e-9 && q <= b.b + 1e-9)
        const on = highlight === n
        return bays.map(([p, q], m) => {
          const [x1, y1, x2, y2] = b.axis === 'X' ? [X(p), Y(b.line), X(q), Y(b.line)] : [X(b.line), Y(p), X(b.line), Y(q)]
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, off = 7
          const tip = b.axis === 'X' ? `M${x1 + 3} ${my + off} L${mx} ${my - off} L${x2 - 3} ${my + off}` : `M${mx - off} ${y1 - 3} L${mx + off} ${my} L${mx - off} ${y2 + 3}`
          return <g key={`${n}-${m}`}><path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="var(--p-brace, #ff6bd5)" strokeWidth={on ? 5 : 3.5} /><path d={tip} fill="none" stroke="var(--p-brace, #ff6bd5)" strokeWidth="1.4" /></g>
        })
      })}
      <text x={W / 2} y={14} textAnchor="middle" fontSize="10">{+Lx.toFixed(3)} × {+Ly.toFixed(3)} m</text>
    </svg>
  </div>
}
