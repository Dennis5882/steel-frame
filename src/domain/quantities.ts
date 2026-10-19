/* 물량 산출 (순수 함수, 평가 보고서 C단계) — 부재 + 접합재(판·볼트·앵커) + 용접 길이(추정) + 도장 면적 + 로스 포함 발주 중량.
   새 접합재는 TW/CN 결과 parts 의 숫자 치수로 산출하며, 이전 결과만 dims 문자열에서 복원한다:
     판 'PL B×N×t' (x 도 허용) · 볼트/앵커 'n-M d' · 스티프너 '2-PL b×t' · 더블러 TW note 'doubler t mm' / CN dims 'PL t' · 가새 거셋 TW 'PL t' / CN 'PL w×t'.
   접합 개수(모델에서): 주각·처마 = 골조 기둥 수(2 × 골조 수), 마루 = 골조 수, 가새 단부 = 가새 요소 × 2.
   추정(est) 항목: 스티프너 길이 = 기둥 웨브 순높이, 더블러 = 기둥 웨브 순높이 × 지붕보 춤, 거셋 크기(TW 는 두께만 → 200×200 가정),
   용접 = 단부판 접합 1 곳당 플랜지 CJP 2·bf + 웨브 필렛 2·h. 풍주 주각·퍼린/거트 클립·새그로드·마감재는 제외. */
import type { ConnResult, ConnectionParts, PlatePart } from './connections'
import { memberSchedule, type ScheduleRow } from './schedule'
import { genSectionRecord, sectionProps } from './sections'
import { portalGeometry } from './portal'
import { ROLES, type ElementRole, type FactoryModel, type FactorySpec } from './types'

/** 접합 수량 값이 잘못됨 — 화면 문구는 job.failText 가 현재 언어로(q_invalid). where = 접합 종류.부위 */
export class QuantityError extends Error {
  constructor(readonly where: string) { super(`Invalid connection quantity: ${where}`); this.name = 'QuantityError' }
}

/** 로스율 (가정) — 부재 5 %, 판재 10 % */
export const LOSS = { member: 0.05, plate: 0.1 }
const STEEL_KG_MM3 = 7.85e-6

export type ConnType = ConnResult['type']
export interface PlateRow { type: ConnType; part: PlatePart; size: string; perConn: number; conns: number; kg: number; est: boolean }
export interface BoltRow { type: ConnType; kind: 'bolt' | 'anchor'; size: string; perConn: number; conns: number; total: number }
export interface WeldRow { type: ConnType; cjp: number; fillet: number; conns: number }
export interface PaintRow { addition?: import('./additionTypes').AdditionUsage; role: ElementRole; section: string; area: number }
export interface Quantities {
  excluded: readonly string[]
  members: ScheduleRow[]; memberT: number
  plates: PlateRow[]; plateT: number
  bolts: BoltRow[]
  welds: WeldRow[]; cjpM: number; filletM: number
  paint: PaintRow[]; paintM2: number
  netT: number; orderT: number
}

const plateRe = /PL\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/
const nM = /(\d+)-M(\d+)/

/** Compatibility for older saved reports. New connection calculations supply
    numeric parts directly. A present but unreadable size must never vanish. */
function legacyParts(c: ConnResult, colH: number, rafD: number): ConnectionParts {
  const p: ConnectionParts = { plates: [], fasteners: [] }, d = c.dims
  const read = (key: string, pattern: RegExp) => {
    if (d[key] === undefined) return null
    const m = String(d[key]).match(pattern)
    if (!m) throw new QuantityError(`${c.type}.${key}`)
    return m
  }
  for (const key of ['plate', 'shearKey'] as const) {
    const m = read(key, plateRe)
    if (m) p.plates.push({ part: key, width: +m[1], length: +m[2], thickness: +m[3], count: key === 'plate' && c.type === 'apex' ? 2 : 1, estimated: false })
  }
  const st = read('stiffener', /(\d+)-PL\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/)
  if (st) p.plates.push({ part: 'stiffener', width: +st[2], length: colH, thickness: +st[3], count: +st[1], estimated: true })
  const dbl = read('doubler', /PL\s*(\d+(?:\.\d+)?)/)?.[1] ?? c.notes.find((n) => n.startsWith('doubler'))?.match(/(\d+(?:\.\d+)?)/)?.[1]
  if (dbl) p.plates.push({ part: 'doubler', width: colH, length: rafD, thickness: +dbl, count: 1, estimated: true })
  const g = read('gusset', /PL\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?/)
  if (g) {
    const full = String(d.gusset).match(plateRe)
    p.plates.push(full
      ? { part: 'gusset', width: +full[1], length: +full[2], thickness: +full[3], count: 1, estimated: true }
      : { part: 'gusset', width: g[2] ? +g[1] : 200, length: g[2] ? +g[1] : 200, thickness: +(g[2] ?? g[1]), count: 1, estimated: true })
  }
  for (const [key, kind] of [['anchors', 'anchor'], ['bolts', 'bolt']] as const) {
    const m = read(key, nM)
    if (m) p.fasteners.push({ kind, diameter: +m[2], count: +m[1] })
  }
  return p
}

/** 단면 둘레(mm) — 도장 면적용. H: 외곽 2d + 4bf − 2tw, CC: 판 양면(중심선 전개 × 2), P: 외면 πD */
function perimeter(section: string, spec: FactorySpec): number {
  const p = sectionProps(section, spec.code)
  const record = genSectionRecord(section, spec.code)
  if (record && !record.excluded) return record.perimeter
  if (p.kind === 'H') return 2 * p.d + 4 * p.bf - 2 * p.tw
  if (p.kind === 'P') return Math.PI * p.d
  return 2 * (p.A / p.tw) // CC: A = t × 전개 길이
}

export function quantities(spec: FactorySpec, model: FactoryModel, conns: ConnResult[] | null): Quantities {
  const sch = memberSchedule(spec, model)
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const frames = new Set(model.elements.filter((e) => e.role === 'rafter').map((e) => nodes.get(e.n1)!.y.toFixed(3))).size
  /* 주각 = 기초에서 시작하는 기둥 수(다경간 내부 기둥 포함), 마루 = 마루 절점 수(다경간은 경간마다, 편경사 0) */
  const G = portalGeometry(spec)
  const countOf: Record<ConnType, number> = {
    base: model.elements.filter((e) => e.role === 'column' && nodes.get(e.n1)!.z === 0).length, knee: 2 * frames, apex: model.nodes.filter(G.isRidgeNode).length,
    brace: 2 * model.elements.filter((e) => e.role === 'brace').length,
  }
  const col = sectionProps(spec.sections.column, spec.code), raf = sectionProps(spec.sections.rafter, spec.code)
  const plates: PlateRow[] = [], bolts: BoltRow[] = [], welds: WeldRow[] = []
  const fmt = (n: number) => +n.toFixed(3)
  const addPlate = (type: ConnType, part: PlateRow['part'], b: number, l: number, t: number, perConn: number, est: boolean) => {
    if (![b, l, t, perConn].every((n) => Number.isFinite(n) && n > 0) || !Number.isInteger(perConn)) throw new QuantityError(`${type}.${part}`)
    plates.push({ type, part, size: `PL ${fmt(b)}×${fmt(l)}×${fmt(t)}`, perConn, conns: countOf[type], kg: b * l * t * STEEL_KG_MM3 * perConn * countOf[type], est })
  }

  for (const c of conns ?? []) {
    const parts = c.parts ?? legacyParts(c, col.h, raf.d)
    for (const p of parts.plates) addPlate(c.type, p.part, p.width, p.length, p.thickness, p.count, p.estimated)
    for (const f of parts.fasteners) {
      if (!(Number.isFinite(f.diameter) && f.diameter > 0 && Number.isInteger(f.count) && f.count > 0)) throw new QuantityError(`${c.type}.${f.kind}`)
      bolts.push({ type: c.type, kind: f.kind, size: `M${f.diameter}`, perConn: f.count, conns: countOf[c.type], total: f.count * countOf[c.type] })
    }
    /* 용접 (단부판 접합): 주각 = 기둥–베이스판, 처마 = 지붕보–단부판, 마루 = 양쪽 지붕보–단부판 */
    const mem = c.type === 'base' ? col : raf
    if (parts.welds) {
      for (const w of parts.welds) {
        if (!(Number.isFinite(w.length) && w.length > 0 && Number.isInteger(w.count) && w.count > 0)) throw new QuantityError(`${c.type}.weld`)
        welds.push({ type: c.type, cjp: w.type === 'cjp' ? w.length * w.count / 1000 : 0, fillet: w.type === 'fillet' ? w.length * w.count / 1000 : 0, conns: countOf[c.type] })
      }
    } else if (c.type !== 'brace') {
      const k = c.type === 'apex' ? 2 : 1
      welds.push({ type: c.type, cjp: (2 * mem.bf * k) / 1000, fillet: (2 * mem.h * k) / 1000, conns: countOf[c.type] })
    }
  }

  const paint: PaintRow[] = sch.rows.map((r) => ({ addition:r.addition, role: r.role, section: r.section, area: (perimeter(r.section, spec) / 1000) * r.length }))
  plates.sort((a, b) => ['base', 'knee', 'apex', 'brace'].indexOf(a.type) - ['base', 'knee', 'apex', 'brace'].indexOf(b.type) || ['plate', 'shearKey', 'stiffener', 'doubler', 'gusset'].indexOf(a.part) - ['plate', 'shearKey', 'stiffener', 'doubler', 'gusset'].indexOf(b.part))
  const plateT = plates.reduce((s, p) => s + p.kg, 0) / 1000
  const netT = sch.total + plateT
  return {
    excluded: [...(model.additions ? ['crane rails/brackets, door hardware and additional connections/foundations', 'equipment attachments', ...(!spec.additions?.crane?.runway ? ['crane runway beams'] : [])] : []), 'gable-post bases', 'purlin/girt cleats', 'fly braces and their connections', 'sag rods and anchors', 'brace intersection connectors', 'cladding and other hardware', ...(spec.frame === 'multi' ? ['interior column-top / valley connections and gutters'] : [])],
    members: sch.rows, memberT: sch.total,
    plates, plateT,
    bolts,
    welds, cjpM: welds.reduce((s, w) => s + w.cjp * w.conns, 0), filletM: welds.reduce((s, w) => s + w.fillet * w.conns, 0),
    paint: paint.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)), paintM2: paint.reduce((s, p) => s + p.area, 0),
    netT, orderT: sch.total * (1 + LOSS.member) + plateT * (1 + LOSS.plate),
  }
}
