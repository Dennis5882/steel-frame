/* Gen 모델 동일성 (순수) — 앱이 보낸 페이로드 vs 지금 Gen 의 GET 응답.
   해석·설계 검토·최적화 직전에 비교해, 사용자가 Gen 에서 단면·재료·절점·하중 등을 바꿨으면 이전 앱 정보로 검토하지 않게 한다.
   Gen 이 덧붙이는 필드(STYPE 등)는 무시하고, 보낸 필드만 같은 값인지 본다. 라이브(2026-10-15) 형식 차이: ELEM NODE 를 8칸으로 0 채움.
   전송 직후 확인(build.verifyCounts)도 같은 비교를 쓴다 — 비교 규칙(허용오차·Gen 채움·ITEMS ID)은 여기 한 곳. */
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 비교 대상 DB (보낸 순서) */
export const SYNC_DBS = ['UNIT', 'MATL', 'SECT', 'NODE', 'ELEM', 'FRLS', 'CONS', 'STLD', 'BODF', 'BMLD', 'CNLD', 'LCOM-GEN', 'DSTL'] as const

export interface SyncDiff {
  db: string
  /** 레코드 ID (없으면 개수 차이) */
  id?: string
  /** 레코드 안 필드 경로 ('SECT', 'NODE[1]', 'ITEMS[ID=3].P[0]' …) */
  field?: string
  expected?: unknown
  actual?: unknown
  /** 개수 차이: Gen 에만 있는 / 앱에만 있는 ID 수 */
  added?: number
  removed?: number
}

const sameNum = (a: number, b: unknown) => typeof b === 'number' && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))

/** 보낸 값 e 와 받은 값 a 의 첫 차이 (없으면 null). path = 레코드 안 경로 */
function diff(e: unknown, a: unknown, path: string, nodeList: boolean): { field: string; expected: unknown; actual: unknown } | null {
  const at = (expected: unknown, actual: unknown) => ({ field: path, expected, actual })
  if (typeof e === 'number') return sameNum(e, a) ? null : at(e, a)
  if (Array.isArray(e)) {
    if (!Array.isArray(a)) return at(e, a)
    /* ELEM NODE: Gen 이 뒤를 0 으로 채운다 → 보낸 길이까지 같고 나머지는 0 이면 같음 */
    const padded = nodeList && a.length > e.length && a.slice(e.length).every((v) => v === 0)
    if (a.length !== e.length && !padded) return at(e, a)
    if (path.endsWith('ITEMS') && e.every((v) => isRecord(v) && typeof v.ID === 'number')) {
      /* 하중 항목은 배열 순서가 아니라 ID 로 대응 — Gen 쪽 ID 가 없거나 중복이면 대응 불가 → 다름 */
      if (!a.every((v) => isRecord(v) && typeof v.ID === 'number')) return { field: `${path}.ID`, expected: 'ID', actual: a }
      const byId = new Map((a as Record<string, unknown>[]).map((v) => [v.ID, v]))
      if (byId.size !== a.length) return { field: `${path}.ID`, expected: 'unique ID', actual: 'duplicate' }
      for (const item of e as Record<string, unknown>[]) { const d = diff(item, byId.get(item.ID), `${path}[ID=${item.ID}]`, false); if (d) return d }
      return null
    }
    for (let i = 0; i < e.length; i++) { const d = diff(e[i], a[i], `${path}[${i}]`, false); if (d) return d }
    return null
  }
  if (isRecord(e)) {
    if (!isRecord(a)) return at(e, a)
    for (const [k, v] of Object.entries(e)) { const d = diff(v, a[k], path ? `${path}.${k}` : k, k === 'NODE'); if (d) return d }
    return null
  }
  return e === a ? null : at(e, a)
}

/** 한 DB 의 차이 — 개수(추가·삭제) 1건 + 레코드별 첫 차이. max 개까지 */
export function dbDifferences(db: string, sent: Record<string, unknown>, got: unknown, max = 20): SyncDiff[] {
  if (!isRecord(got)) return [{ db, field: '(response)', expected: 'object', actual: got }]
  const out: SyncDiff[] = []
  const added = Object.keys(got).filter((id) => !Object.hasOwn(sent, id)).length
  const removed = Object.keys(sent).filter((id) => !Object.hasOwn(got, id)).length
  if (added || removed) out.push({ db, added, removed })
  for (const [id, rec] of Object.entries(sent)) {
    if (out.length >= max) break
    if (!Object.hasOwn(got, id)) continue
    const d = diff(rec, got[id], '', false)
    if (d) out.push({ db, id, ...d })
  }
  return out
}

/** 사람이 읽는 한 줄 — 'SECT 1 SECT_NAME: RH 600x200x11x17 → RH 650x…', 'ELEM: +2 / −0' */
export function diffText(d: SyncDiff): string {
  const v = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x) ?? 'none').slice(0, 60)
  if (d.added !== undefined) return `${d.db}: +${d.added} / −${d.removed}`
  return `${d.db} ${d.id ?? ''} ${d.field ?? ''}: ${v(d.expected)} → ${v(d.actual)}`.replace(/\s+/g, ' ')
}
