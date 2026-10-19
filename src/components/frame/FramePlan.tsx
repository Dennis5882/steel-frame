/* 평면 그림 겸 편집기 — 격자선(X 1,2,3… / Y A,B,C…), 스팬 치수, 패널, 가새 베이(人 표시).
   mode 'cells': 칸을 누르거나 끌어서 켜기/끄기 (처음 누른 칸의 반대 상태로 칠함)
   mode 'edges': 보가 있는 변을 눌러 가새 베이 넣기/빼기
   mode 'view' : 그림만 */
import { useRef, useState, type PointerEvent, type ReactElement } from 'react'
import { panelExists } from '../../frame/geometry'
import { braceBays, edgeExists } from '../../frame/plan'
import type { Axis, FrameSpec } from '../../frame/types'

export const gridLabelX = (i: number) => String(i + 1)
export const gridLabelY = (j: number) => String.fromCharCode(65 + j)

interface Props {
  spec: FrameSpec
  mode?: 'view' | 'cells' | 'edges'
  disabled?: boolean
  onCell?(i: number, j: number, on: boolean): void
  onEdge?(axis: Axis, i: number, j: number): void
}

export function FramePlan({ spec, mode = 'view', disabled, onCell, onEdge }: Props) {
  const { xs, ys } = spec
  const n = xs.length - 1, m = ys.length - 1
  const W = 420, H = 300, pad = 42
  const Lx = xs.at(-1)! - xs[0] || 1, Ly = ys.at(-1)! - ys[0] || 1
  const k = Math.min((W - 2 * pad) / Lx, (H - 2 * pad) / Ly)
  const ox = (W - Lx * k) / 2, oy = (H + Ly * k) / 2
  const X = (x: number) => ox + (x - xs[0]) * k, Y = (y: number) => oy - (y - ys[0]) * k
  const paint = useRef<boolean | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const live = !disabled && mode !== 'view'
  const braced = new Set(braceBays(spec).map((b) => `${b.axis}${b.i},${b.j}`))

  const cells: ReactElement[] = []
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const on = panelExists(spec, i, j), key = `c${i},${j}`
    const press = () => { if (!live || mode !== 'cells') return; paint.current = !on; onCell?.(i, j, !on) }
    const enter = (e: PointerEvent) => { setHover(key); if (live && mode === 'cells' && e.buttons === 1 && paint.current !== null && on !== paint.current) onCell?.(i, j, paint.current) }
    cells.push(<rect key={key} x={X(xs[i])} y={Y(ys[j + 1])} width={(xs[i + 1] - xs[i]) * k} height={(ys[j + 1] - ys[j]) * k}
      className={`fr-cell${on ? ' on' : ''}${mode === 'cells' && live ? ' edit' : ''}${hover === key && mode === 'cells' ? ' hover' : ''}`}
      onPointerDown={(e) => { if (live && mode === 'cells') { (e.target as Element).releasePointerCapture?.(e.pointerId); press() } }}
      onPointerEnter={enter} onPointerLeave={() => setHover(null)} />)
  }

  const edges: ReactElement[] = []
  const chevron = (axis: Axis, x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, o = 7
    return axis === 'X' ? `M${x1 + 4} ${my + o} L${mx} ${my - o} L${x2 - 4} ${my + o}` : `M${mx - o} ${y1 - 4} L${mx + o} ${my} L${mx - o} ${y2 + 4}`
  }
  for (const axis of ['X', 'Y'] as const) for (let j = 0; j < (axis === 'X' ? m + 1 : m); j++) for (let i = 0; i < (axis === 'X' ? n : n + 1); i++) {
    if (!edgeExists(spec, axis, i, j)) continue
    const [x1, y1, x2, y2] = axis === 'X' ? [X(xs[i]), Y(ys[j]), X(xs[i + 1]), Y(ys[j])] : [X(xs[i]), Y(ys[j]), X(xs[i]), Y(ys[j + 1])]
    const key = `${axis}${i},${j}`, on = braced.has(key), hv = hover === key && mode === 'edges' && live
    edges.push(<g key={key}>
      <path d={`M${x1} ${y1} L${x2} ${y2}`} className={`fr-edge${on ? ' braced' : ''}${hv ? ' hover' : ''}`} />
      {(on || hv) && <path d={chevron(axis, x1, y1, x2, y2)} className={`fr-chev${on ? '' : ' ghost'}`} />}
      {mode === 'edges' && live && <path d={`M${x1} ${y1} L${x2} ${y2}`} className="fr-hit" onPointerEnter={() => setHover(key)} onPointerLeave={() => setHover(null)}
        onClick={() => onEdge?.(axis, i, j)}><title>{axis === 'X' ? `${gridLabelY(j)} · ${gridLabelX(i)}–${gridLabelX(i + 1)}` : `${gridLabelX(i)} · ${gridLabelY(j)}–${gridLabelY(j + 1)}`}</title></path>}
    </g>)
  }

  return <div className={`mw-sketch fr-plan${mode !== 'view' ? ' fr-plan-edit' : ''}`}>
    <svg viewBox={`0 0 ${W} ${H}`} focusable="false" onPointerUp={() => { paint.current = null }} onPointerLeave={() => { paint.current = null; setHover(null) }} style={{ touchAction: mode === 'cells' ? 'none' : undefined }}>
      {cells}
      {edges}
      {xs.map((x, i) => <g key={`x${i}`} className="fr-axis"><path d={`M${X(x)} ${Y(ys.at(-1)!) - 10} V${Y(ys[0]) + 10}`} />
        <circle cx={X(x)} cy={Y(ys[0]) + 22} r="8" /><text x={X(x)} y={Y(ys[0]) + 25.5} textAnchor="middle">{gridLabelX(i)}</text></g>)}
      {ys.map((y, j) => <g key={`y${j}`} className="fr-axis"><path d={`M${X(xs[0]) - 10} ${Y(y)} H${X(xs.at(-1)!) + 10}`} />
        <circle cx={X(xs[0]) - 22} cy={Y(y)} r="8" /><text x={X(xs[0]) - 22} y={Y(y) + 3.5} textAnchor="middle">{gridLabelY(j)}</text></g>)}
      {xs.slice(1).map((x, i) => <text key={`dx${i}`} className="fr-dim" x={(X(xs[i]) + X(x)) / 2} y={Y(ys.at(-1)!) - 14} textAnchor="middle">{+(x - xs[i]).toFixed(3)}</text>)}
      {ys.slice(1).map((y, j) => <text key={`dy${j}`} className="fr-dim" x={X(xs.at(-1)!) + 14} y={(Y(ys[j]) + Y(y)) / 2 + 3} textAnchor="start">{+(y - ys[j]).toFixed(3)}</text>)}
    </svg>
  </div>
}
