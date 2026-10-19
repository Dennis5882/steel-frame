/* 골조 부재 단면 후보 — Gen GB-YB05 의 압연 H (HW·HM·HN), 단면 성질은 gen-section-properties.json 그대로 */
import data from '../data/gen-section-properties.json'

const H_ORDER: Record<string, number> = { HW: 0, HM: 1, HN: 2 }
const dims = (n: string) => n.slice(3).split(/[x/]/).map(Number)

let cache: string[] | null = null
export function frameSectionNames(): string[] {
  if (cache) return cache
  const entries = Object.values((data as unknown as { entries: Record<string, { code: string; name: string; excluded?: boolean }> }).entries)
  cache = entries.filter((e) => e.code === 'CN' && !e.excluded && /^H[WMN] /.test(e.name)).map((e) => e.name)
    .sort((a, b) => H_ORDER[a.slice(0, 2)] - H_ORDER[b.slice(0, 2)] || dims(a)[0] - dims(b)[0] || dims(a)[1] - dims(b)[1] || dims(a)[2] - dims(b)[2])
  return cache
}
