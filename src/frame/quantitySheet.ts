/* 다층 강골조 물량 산출서 행 (CSV·XLSX 공통, 화면 언어) — 값은 quantities.ts, 작성기는 공장 앱 report/xlsx.ts·quantitySheet.ts */
import { t, type I18nKey } from '../i18n'
import type { XlsxSheet } from '../report/xlsx'
import { sheetRows } from './sheet'
import { MEMBER_LOSS, type FrameQuantities } from './quantities'
import type { FrameRole, FrameSpec } from './types'

const ROLES: FrameRole[] = ['column', 'beam', 'brace']

/** 물량 산출서 시트 (CSV·XLSX 공통) — 부재표 · 층별 중량 · 합계 · 제외 항목 */
export function frameQuantitySheet(spec: FrameSpec, q: FrameQuantities): XlsxSheet {
  const L = (k: string, ...a: unknown[]) => (t as (k: I18nKey, ...a: unknown[]) => string)(k as I18nKey, ...a)
  const roles = ROLES.filter((r) => q.rows.some((x) => x.role === r))
  const b = sheetRows()
  b.title(L('fr_q_title')); b.row([L('fr_q_project', spec.xs.at(-1)! - spec.xs[0], spec.ys.at(-1)! - spec.ys[0], spec.heights.length, spec.material)])
  b.blank()
  b.title(L('q_members')); b.header([L('rp_mark'), L('rd_role'), L('rd_section'), L('rp_members'), L('rep_len'), 'kg/m', L('rep_wt'), `${L('q_paint')} (m2)`])
  for (const r of q.rows) b.row([r.mark, L(`fr_role_${r.role}`), r.section, r.members, r.length.toFixed(2), r.kgPerM.toFixed(2), r.weight.toFixed(3), r.paint.toFixed(1)])
  b.blank()
  b.title(L('fr_q_by_story')); b.header([L('fr_story'), ...roles.map((r) => `${L(`fr_role_${r}`)} (t)`), `${L('rp_total')} (t)`])
  for (const s of q.byStory) b.row([spec.storyNames[s.story - 1] ?? String(s.story), ...roles.map((r) => s.t[r].toFixed(3)), roles.reduce((a, r) => a + s.t[r], 0).toFixed(3)])
  b.blank()
  b.title(L('q_summary'))
  b.row([L('q_memberT'), q.memberT.toFixed(3), 't']); b.row([L('q_loss'), `${MEMBER_LOSS * 100} %`]); b.row([L('q_orderT'), q.orderT.toFixed(3), 't'])
  b.row([L('q_paint'), q.paintM2.toFixed(1), 'm2']); b.row([L('fr_q_gross'), q.grossArea.toFixed(1), 'm2']); b.row([L('fr_q_per_area'), (q.memberT * 1000 / Math.max(1e-9, q.grossArea)).toFixed(1), 'kg/m2'])
  b.blank()
  b.title(L('fr_q_excluded')); b.row([L('fr_q_note')])
  return b.sheet(L('out_quantities'), [18, 18, 22, 12, 12, 10, 12, 14])
}
