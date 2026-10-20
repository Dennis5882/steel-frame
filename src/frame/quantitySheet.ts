/* 다층 강골조 물량 산출서 행 (CSV·XLSX 공통, 화면 언어) — 값은 quantities.ts, 작성기는 공장 앱 report/xlsx.ts·quantitySheet.ts */
import { t, type I18nKey } from '../i18n'
import type { XlsxSheet } from '../report/xlsx'
import { MEMBER_LOSS, type FrameQuantities } from './quantities'
import type { FrameRole, FrameSpec } from './types'

const ROLES: FrameRole[] = ['column', 'beam', 'brace']

/** 물량 산출서 시트 (CSV·XLSX 공통) — 부재표 · 층별 중량 · 합계 · 제외 항목 */
export function frameQuantitySheet(spec: FrameSpec, q: FrameQuantities): XlsxSheet {
  const L = (k: string, ...a: unknown[]) => (t as (k: I18nKey, ...a: unknown[]) => string)(k as I18nKey, ...a)
  const roles = ROLES.filter((r) => q.rows.some((x) => x.role === r))
  const rows: unknown[][] = [
    [L('fr_q_title')], [L('fr_q_project', spec.xs.at(-1)! - spec.xs[0], spec.ys.at(-1)! - spec.ys[0], spec.heights.length, spec.material)],
    [],
    [L('q_members')], [L('rp_mark'), L('rd_role'), L('rd_section'), L('rp_members'), L('rep_len'), 'kg/m', L('rep_wt'), `${L('q_paint')} (m2)`],
    ...q.rows.map((r) => [r.mark, L(`fr_role_${r.role}`), r.section, r.members, r.length.toFixed(2), r.kgPerM.toFixed(2), r.weight.toFixed(3), r.paint.toFixed(1)]),
    [],
    [L('fr_q_by_story')], [L('fr_story'), ...roles.map((r) => `${L(`fr_role_${r}`)} (t)`), `${L('rp_total')} (t)`],
    ...q.byStory.map((s) => [spec.storyNames[s.story - 1] ?? String(s.story), ...roles.map((r) => s.t[r].toFixed(3)), roles.reduce((a, r) => a + s.t[r], 0).toFixed(3)]),
    [],
    [L('q_summary')],
    [L('q_memberT'), q.memberT.toFixed(3), 't'], [L('q_loss'), `${MEMBER_LOSS * 100} %`], [L('q_orderT'), q.orderT.toFixed(3), 't'],
    [L('q_paint'), q.paintM2.toFixed(1), 'm2'], [L('fr_q_gross'), q.grossArea.toFixed(1), 'm2'], [L('fr_q_per_area'), (q.memberT * 1000 / Math.max(1e-9, q.grossArea)).toFixed(1), 'kg/m2'],
    [],
    [L('fr_q_excluded')], [L('fr_q_note')],
  ]
  const titles = new Set([L('fr_q_title'), L('q_members'), L('fr_q_by_story'), L('q_summary'), L('fr_q_excluded')])
  const tabled = new Set([L('q_members'), L('fr_q_by_story')])
  return {
    name: L('out_quantities'), rows, widths: [18, 18, 22, 12, 12, 10, 12, 14],
    styleOf: (row, i) => row.length === 1 && titles.has(String(row[0])) ? 'title' : i > 0 && rows[i - 1].length === 1 && tabled.has(String(rows[i - 1][0])) ? 'header' : undefined,
  }
}
