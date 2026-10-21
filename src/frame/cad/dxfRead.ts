/* DXF 읽기 (순수) — 바이트 → 인코딩 판별(decodeDxf) → dxf 라이브러리(skymakerolof/dxf, MIT) 파싱 → 블록 펼치기 → 단순 객체.
   축망 가져오기(axisGrid.ts)가 쓰는 객체만 남긴다: 선분(LINE·폴리라인 각 변), 글자(TEXT·MTEXT·ATTRIB), 원.
   ATTDEF(블록 속성 정의)는 기본값('A' 등)만 들고 있어 글자로 쓰지 않는다 — 분해된 축 번호 블록에서 실제 번호가 아니다(zg test2.dxf).
   좌표는 도면 단위 그대로다. mm 환산은 axisGrid.ts(단위·축척). */
import { Helper } from 'dxf'
import { decodeDxfBytes } from './decodeDxf'

export interface Pt { x: number; y: number }
export type CadEntity =
  | { type: 'LINE'; layer: string; a: Pt; b: Pt }
  | { type: 'TEXT'; layer: string; p: Pt; text: string; h: number }
  | { type: 'CIRCLE'; layer: string; p: Pt; r: number }

export interface CadDrawing {
  entities: CadEntity[]
  /** 레이어별 객체 수 (많은 순) */
  layers: { name: string; lines: number; texts: number }[]
  /** $INSUNITS (0 = 단위 없음, 4 = mm, 5 = cm, 6 = m) */
  insUnits: number
  /** 도면 범위 (도면 단위) */
  extents: { minX: number; minY: number; maxX: number; maxY: number } | null
  /** 읽지 않은 객체 종류와 수 (원호·스플라인·치수 등) */
  skipped: Record<string, number>
}

interface Transform { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number; extrusionZ?: number }

/** 블록 변환 — dxf 라이브러리 applyTransforms 와 같은 순서(배율 → 회전 → 이동 → 뒤집기) */
function transform(p: Pt, ts: Transform[] | undefined): Pt {
  let x = p.x, y = p.y
  for (const t of ts ?? []) {
    if (t.scaleX) x *= t.scaleX
    if (t.scaleY) y *= t.scaleY
    if (t.rotation) { const r = t.rotation / 180 * Math.PI, c = Math.cos(r), s = Math.sin(r); [x, y] = [x * c - y * s, y * c + x * s] }
    if (t.x) x += t.x
    if (t.y) y += t.y
    if (t.extrusionZ === -1) x = -x
  }
  return { x, y }
}
const scaleOf = (ts: Transform[] | undefined) => (ts ?? []).reduce((k, t) => k * Math.abs(t.scaleX || 1), 1)

/** MTEXT 서식 코드 제거 (\P 줄바꿈, \f…; 글꼴, {}) */
export const cleanText = (s: string): string => (s || '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;|[{}]/g, '').trim()

export function readDxf(bytes: Uint8Array): CadDrawing {
  const helper = new Helper(decodeDxfBytes(bytes))
  const raw: any[] = helper.denormalised ?? []
  const entities: CadEntity[] = [], skipped: Record<string, number> = {}
  for (const e of raw) {
    const layer = String(e.layer ?? '0'), ts: Transform[] | undefined = e.transforms
    const pt = (x: number, y: number) => transform({ x, y }, ts)
    switch (e.type) {
      case 'LINE': entities.push({ type: 'LINE', layer, a: pt(e.start.x, e.start.y), b: pt(e.end.x, e.end.y) }); break
      case 'LWPOLYLINE': case 'POLYLINE': {
        const v: Pt[] = (e.vertices ?? []).map((q: Pt) => pt(q.x, q.y))
        for (let i = 1; i < v.length; i++) entities.push({ type: 'LINE', layer, a: v[i - 1], b: v[i] })
        if (e.closed && v.length > 2) entities.push({ type: 'LINE', layer, a: v[v.length - 1], b: v[0] })
        break
      }
      case 'TEXT': case 'MTEXT': {
        const text = cleanText(e.string ?? e.text ?? '')
        if (text) entities.push({ type: 'TEXT', layer, p: pt(e.x ?? 0, e.y ?? 0), text, h: (e.textHeight ?? e.nominalTextHeight ?? 0) * scaleOf(ts) })
        break
      }
      case 'ATTRIB': {
        const t = e.text ?? {}, text = cleanText(t.string ?? '')
        if (text) entities.push({ type: 'TEXT', layer, p: pt(t.x ?? 0, t.y ?? 0), text, h: (t.textHeight ?? 0) * scaleOf(ts) })
        break
      }
      case 'CIRCLE': entities.push({ type: 'CIRCLE', layer, p: pt(e.x, e.y), r: e.r * scaleOf(ts) }); break
      default: skipped[e.type] = (skipped[e.type] ?? 0) + 1
    }
  }
  const count = new Map<string, { name: string; lines: number; texts: number }>()
  for (const e of entities) {
    const c = count.get(e.layer) ?? { name: e.layer, lines: 0, texts: 0 }
    if (e.type === 'LINE') c.lines++; else if (e.type === 'TEXT') c.texts++
    count.set(e.layer, c)
  }
  const h = helper.parsed?.header ?? {}
  const extents = h.extMin && h.extMax ? { minX: h.extMin.x, minY: h.extMin.y, maxX: h.extMax.x, maxY: h.extMax.y } : null
  return { entities, layers: [...count.values()].sort((a, b) => b.lines + b.texts - a.lines - a.texts), insUnits: Number(h.insUnits ?? 0), extents, skipped }
}
