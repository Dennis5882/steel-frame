/* Gen 결과 회수·파싱 (호출 함수 주입 — 화면·스크립트 공용). 단위 kN·m.
   BEAMFORCE 행: [Index, Elem, Load, Part, Axial, Shear-y, Shear-z, Torsion, Moment-y, Moment-z, ...]
   H 단면(웨브 = 국부 z): 강축 휨 Moment-y, 강축 전단 Shear-z. */
import type { Station } from '../codes/cnFrameSteel'

export type Request = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown) => Promise<any>

export interface TableData { HEAD: string[]; DATA: string[][] }

export async function table(req: Request, type: string, opts: { loads?: string[]; keys?: number[]; extra?: object } = {}): Promise<TableData> {
  const name = 'T'
  const r = await req('POST', '/post/TABLE', { Argument: { TABLE_NAME: name, TABLE_TYPE: type, UNIT: { FORCE: 'KN', DIST: 'M' }, STYLES: { FORMAT: 'Fixed', PLACE: 6 },
    ...(opts.loads ? { LOAD_CASE_NAMES: opts.loads } : {}), ...(opts.keys ? { NODE_ELEMS: { KEYS: opts.keys } } : {}), ...(opts.extra ?? {}) } })
  const t = r?.[name]
  if (!t || !Array.isArray(t.DATA)) throw new Error(`${type}: ${typeof r?.message === 'string' && r.message ? r.message : 'no table'}`)
  return t
}

/** 표를 머리글 이름으로 읽는 행 객체 배열로 */
export function rows(t: TableData): Record<string, string>[] {
  return t.DATA.map((d) => Object.fromEntries(t.HEAD.map((h, i) => [h, d[i]])))
}
export const n = (s: string | undefined) => { const v = Number(s); if (!Number.isFinite(v)) throw new Error(`not a number: ${s}`); return v }

/** 요소 → 하중 이름 → 위치(I, 1/4, 2/4, 3/4, J) */
export type ElementForces = Map<number, Map<string, Station[]>>

const PART_ORDER = (p: string) => (p.startsWith('I') ? 0 : p === '1/4' ? 1 : p === '2/4' ? 2 : p === '3/4' ? 3 : 4)

export function parseBeamForce(t: TableData, into: ElementForces = new Map()): ElementForces {
  const h = (k: string) => t.HEAD.indexOf(k)
  const [iE, iL, iP, iN, iVy, iVz, iMy, iMz] = ['Elem', 'Load', 'Part', 'Axial', 'Shear-y', 'Shear-z', 'Moment-y', 'Moment-z'].map(h)
  if ([iE, iL, iP, iN, iVy, iVz, iMy, iMz].some((i) => i < 0)) throw new Error('BEAMFORCE: unexpected header ' + t.HEAD.join(','))
  const tmp = new Map<string, { part: number; s: Station }[]>()
  for (const d of t.DATA) {
    const key = `${d[iE]}|${d[iL]}`
    ;(tmp.get(key) ?? tmp.set(key, []).get(key)!).push({ part: PART_ORDER(d[iP]), s: { N: n(d[iN]), Vx: n(d[iVy]), Vy: n(d[iVz]), Mx: n(d[iMy]), My: n(d[iMz]) } })
  }
  for (const [key, list] of tmp) {
    const [e, load] = key.split('|')
    const m = into.get(+e) ?? into.set(+e, new Map()).get(+e)!
    m.set(load, list.sort((a, b) => a.part - b.part).map((x) => x.s))
  }
  return into
}

/** 조합별 요소력 — 조합 묶음 단위로 나눠 회수(큰 표). RS 포함 조합은 Gen 이 max/min 두 행을 줄 수 있어 Load 이름 그대로 보관 */
export async function fetchElementForces(req: Request, elements: number[], combos: string[], onProgress?: (done: number, total: number) => void): Promise<ElementForces> {
  const out: ElementForces = new Map()
  const per = Math.max(1, Math.floor(40000 / Math.max(1, elements.length * 5)))
  for (let i = 0; i < combos.length; i += per) {
    const part = combos.slice(i, i + per)
    parseBeamForce(await table(req, 'BEAMFORCE', { loads: part.map((c) => `${c}(CB)`), keys: elements }), out)
    onProgress?.(Math.min(combos.length, i + per), combos.length)
  }
  return out
}

/** 반력 합 (케이스별 FX, FY, FZ) */
export async function reactionSums(req: Request, loads: string[]) {
  const t = await table(req, 'REACTIONG', { loads })
  const sum: Record<string, { FX: number; FY: number; FZ: number }> = {}
  for (const r of rows(t)) {
    const s = (sum[r.Load] ??= { FX: 0, FY: 0, FZ: 0 })
    s.FX += n(r.FX); s.FY += n(r.FY); s.FZ += n(r.FZ)
  }
  return sum
}
