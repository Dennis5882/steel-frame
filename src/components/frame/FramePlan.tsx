/* 평면 그림 겸 편집기 — 격자선(X 1,2,3… / Y A,B,C…), 스팬 치수, 패널(전체·삼각), 가새 베이(人 표시).
   mode 'cells': tool 'cell' = 칸을 누르거나 끌어서 켜기/끄기 (처음 누른 칸의 반대 상태로 칠함)
                 tool 'tri'  = 칸의 모서리 쪽을 눌러 삼각형을 붙이거나 자름 (규칙: triNext)
   mode 'edges': 보가 있는 변을 눌러 가새 베이 넣기/빼기
   치수 숫자를 누르면 onSpan 으로 그 스팬을 고른다 (길이 수정·삽입·삭제는 부모가 처리) */
import { useRef, useState, type PointerEvent, type ReactElement } from 'react'
import { CORNER_OFF, axisLabel, braceBays, diagonalOf, edgeExists, keptCorners, panelState, triNext, type Corner, type PanelState } from '../../frame/plan'
import type { Axis, FrameSpec } from '../../frame/types'

const gridLabelX = (spec: FrameSpec, i: number) => axisLabel(spec, 'X', i)
const gridLabelY = (spec: FrameSpec, j: number) => axisLabel(spec, 'Y', j)

interface Props {
  spec: FrameSpec
  mode?: 'view' | 'cells' | 'edges'
  tool?: 'cell' | 'tri'
  disabled?: boolean
  selectedSpan?: { axis: Axis; at: number } | null
  onCell?(i: number, j: number, state: PanelState): void
  onEdge?(axis: Axis, i: number, j: number): void
  onSpan?(axis: Axis, at: number): void
  /** DXF 밑그림 선 (스펙 좌표 m) */
  underlay?: [number, number, number, number][]
  /** 스팬 출처 — 치수(dim)·도면 선(geom)·불일치(conflict) */
  spanSrc?: { X: string[]; Y: string[] }
}

/** 미리보기 — 바뀌는 삼각형 영역과 붙임/복구(add) 여부 */
function triGhost(st: PanelState, c: Corner): { corners: Corner[]; add: boolean } | null {
  const next = triNext(st, c)
  const area = (s: PanelState): Corner[] => s === 'off' ? [] : s === 'full' ? [0, 1, 2, 3] : keptCorners(s)
  const before = area(st), after = area(next)
  if (after.length > before.length) return { corners: after.length === 4 ? [st as Corner, ...diagonalOf(st as Corner)] : after, add: true }
  if (after.length < before.length) return { corners: next === 'off' ? before : [next as Corner, ...diagonalOf(next as Corner)], add: false }
  return { corners: [c, ...diagonalOf(c)], add: false }
}

export function FramePlan({ spec, mode = 'view', tool = 'cell', disabled, selectedSpan, onCell, onEdge, onSpan, underlay, spanSrc }: Props) {
  const { xs, ys } = spec
  const n = xs.length - 1, m = ys.length - 1
  const W = 440, H = 320, pad = 46
  const Lx = xs.at(-1)! - xs[0] || 1, Ly = ys.at(-1)! - ys[0] || 1
  const k = Math.min((W - 2 * pad) / Lx, (H - 2 * pad) / Ly)
  const ox = (W - Lx * k) / 2, oy = (H + Ly * k) / 2
  const X = (x: number) => ox + (x - xs[0]) * k, Y = (y: number) => oy - (y - ys[0]) * k
  const paint = useRef<boolean | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [hoverCorner, setHoverCorner] = useState<Corner | null>(null)
  const live = !disabled && mode !== 'view'
  const braced = new Set(braceBays(spec).map((b) => `${b.axis}${b.i},${b.j}`))
  const pt = (i: number, j: number, c: Corner) => `${X(xs[i + CORNER_OFF[c][0]])},${Y(ys[j + CORNER_OFF[c][1]])}`

  /* 칸 안 포인터 위치 → 가장 가까운 모서리 */
  const cornerAt = (e: PointerEvent, i: number, j: number): Corner => {
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!, p = svg.createSVGPoint()
    p.x = e.clientX; p.y = e.clientY
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse())
    const u = (q.x - X(xs[i])) / (X(xs[i + 1]) - X(xs[i])), v = (Y(ys[j]) - q.y) / (Y(ys[j]) - Y(ys[j + 1]))
    return (u < 0.5 ? (v < 0.5 ? 0 : 3) : (v < 0.5 ? 1 : 2)) as Corner
  }

  const cells: ReactElement[] = []
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const st = panelState(spec, i, j), key = `c${i},${j}`, editing = live && mode === 'cells'
    const hv = hover === key && editing
    const kept = keptCorners(st)
    cells.push(<g key={key}>
      <rect x={X(xs[i])} y={Y(ys[j + 1])} width={(xs[i + 1] - xs[i]) * k} height={(ys[j + 1] - ys[j]) * k} className={`fr-cell${st === 'full' ? ' on' : ''}`} />
      {kept.length === 3 && <polygon points={kept.map((c) => pt(i, j, c)).join(' ')} className="fr-tri" />}
      {kept.length === 3 && <path d={`M${pt(i, j, diagonalOf(st as Corner)[0])} L${pt(i, j, diagonalOf(st as Corner)[1])}`} className="fr-diag" />}
      {hv && tool === 'tri' && hoverCorner !== null && (() => { const g = triGhost(st, hoverCorner); return g && <polygon points={g.corners.map((c) => pt(i, j, c)).join(' ')} className={`fr-tri-ghost${g.add ? ' restore' : ''}`} /> })()}
      {editing && <rect x={X(xs[i])} y={Y(ys[j + 1])} width={(xs[i + 1] - xs[i]) * k} height={(ys[j + 1] - ys[j]) * k} className={`fr-cell-hit${hv && tool === 'cell' ? ' hover' : ''}`}
        onPointerDown={(e) => {
          (e.target as Element).releasePointerCapture?.(e.pointerId)
          if (tool === 'tri') { onCell?.(i, j, triNext(st, cornerAt(e, i, j))); return }
          paint.current = st === 'off'; onCell?.(i, j, st === 'off' ? 'full' : 'off')
        }}
        onPointerMove={(e) => { if (tool === 'tri') setHoverCorner(cornerAt(e, i, j)) }}
        onPointerEnter={(e) => { setHover(key); if (tool === 'cell' && e.buttons === 1 && paint.current !== null && (st !== 'off') !== paint.current) onCell?.(i, j, paint.current ? 'full' : 'off') }}
        onPointerLeave={() => { setHover(null); setHoverCorner(null) }} />}
    </g>)
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
        onClick={() => onEdge?.(axis, i, j)}><title>{axis === 'X' ? `${gridLabelY(spec, j)} · ${gridLabelX(spec, i)}–${gridLabelX(spec, i + 1)}` : `${gridLabelX(spec, i)} · ${gridLabelY(spec, j)}–${gridLabelY(spec, j + 1)}`}</title></path>}
    </g>)
  }

  const dim = (axis: Axis, at: number, x: number, y: number, len: number, anchor: 'middle' | 'start') => {
    const sel = selectedSpan?.axis === axis && selectedSpan.at === at, click = !!onSpan && !disabled
    const src = spanSrc?.[axis][at]
    return <text key={`d${axis}${at}`} className={`fr-dim${click ? ' click' : ''}${sel ? ' sel' : ''}${src ? ` src-${src}` : ''}`} x={x} y={y} textAnchor={anchor} onClick={click ? () => onSpan!(axis, at) : undefined}>{+len.toFixed(3)}</text>
  }
  const selBand = selectedSpan && (selectedSpan.axis === 'X'
    ? <rect className="fr-span-sel" x={X(xs[selectedSpan.at])} y={Y(ys.at(-1)!) - 6} width={(xs[selectedSpan.at + 1] - xs[selectedSpan.at]) * k} height={(ys.at(-1)! - ys[0]) * k + 12} />
    : <rect className="fr-span-sel" x={X(xs[0]) - 6} y={Y(ys[selectedSpan.at + 1])} width={(xs.at(-1)! - xs[0]) * k + 12} height={(ys[selectedSpan.at + 1] - ys[selectedSpan.at]) * k} />)

  return <div className={`mw-sketch fr-plan${mode !== 'view' ? ' fr-plan-edit' : ''}${mode === 'cells' && tool === 'tri' ? ' fr-tool-tri' : ''}`}>
    <svg viewBox={`0 0 ${W} ${H}`} focusable="false" onPointerUp={() => { paint.current = null }} onPointerLeave={() => { paint.current = null; setHover(null) }} style={{ touchAction: mode === 'cells' ? 'none' : undefined }}>
      {underlay && <g className="fr-underlay">{underlay.map(([x1, y1, x2, y2], q) => <line key={q} x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} />)}</g>}
      {selBand}
      {cells}
      {edges}
      {xs.map((x, i) => <g key={`x${i}`} className="fr-axis"><path d={`M${X(x)} ${Y(ys.at(-1)!) - 10} V${Y(ys[0]) + 10}`} />
        <circle cx={X(x)} cy={Y(ys[0]) + 22} r="8" /><text x={X(x)} y={Y(ys[0]) + 25.5} textAnchor="middle">{gridLabelX(spec, i)}</text></g>)}
      {ys.map((y, j) => <g key={`y${j}`} className="fr-axis"><path d={`M${X(xs[0]) - 10} ${Y(y)} H${X(xs.at(-1)!) + 10}`} />
        <circle cx={X(xs[0]) - 22} cy={Y(y)} r="8" /><text x={X(xs[0]) - 22} y={Y(y) + 3.5} textAnchor="middle">{gridLabelY(spec, j)}</text></g>)}
      {xs.slice(1).map((x, i) => dim('X', i, (X(xs[i]) + X(x)) / 2, Y(ys.at(-1)!) - 16, x - xs[i], 'middle'))}
      {ys.slice(1).map((y, j) => dim('Y', j, X(xs.at(-1)!) + 16, (Y(ys[j]) + Y(y)) / 2 + 3, y - ys[j], 'start'))}
    </svg>
  </div>
}
