/* 물량 산출서 행 (순수) — CSV·Excel 공통. 숫자는 표시 자릿수 문자열, 제목·머리 행은 styleOf 로 구분 */
import { t, type I18nKey } from '../i18n'
import { LOSS, type quantities } from '../domain/quantities'
import { restraintKeys, support } from '../domain/validity'
import type { FactorySpec } from '../domain/types'
import type { XlsxSheet } from './xlsx'

export function quantitySheet(spec: FactorySpec, q: ReturnType<typeof quantities>): XlsxSheet {
  const L = (k: string) => t(k as I18nKey)
  const rows: unknown[][] = [
    [L('q_members')], [L('rd_role'), L('rd_section'), L('rep_count'), L('rep_len'), 'kg/m', L('rep_wt'), `${L('q_paint')} (m2)`],
    ...q.members.map((r) => [L(`role_${r.role}`), r.section, r.count, r.length.toFixed(2), r.kgPerM.toFixed(2), r.weight.toFixed(3), (q.paint.find((x) => x.role === r.role && x.section === r.section)?.area ?? 0).toFixed(1)]),
    [], [L('q_plates')], [L('q_conn'), L('q_part'), L('q_size'), L('q_per'), L('q_conns'), L('q_kg'), L('q_est')],
    ...q.plates.map((x) => [L(`cn_type_${x.type}`), L(`q_part_${x.part}`), x.size, x.perConn, x.conns, x.kg.toFixed(1), x.est ? '*' : '']),
    [], [L('q_bolts')], [L('q_conn'), L('q_part'), L('q_size'), L('q_per'), L('q_conns'), L('q_total')],
    ...q.bolts.map((x) => [L(`cn_type_${x.type}`), L(`q_${x.kind}`), x.size, x.perConn, x.conns, x.total]),
    [], [L('q_summary')],
    [L('q_memberT'), q.memberT.toFixed(3), 't'], [L('q_plateT'), q.plateT.toFixed(3), 't'], [L('q_netT'), q.netT.toFixed(3), 't'],
    [L('q_loss'), t('q_loss_v', LOSS.member * 100, LOSS.plate * 100)], [L('q_orderT'), q.orderT.toFixed(3), 't'],
    [L('q_paint'), q.paintM2.toFixed(1), 'm2'], [`${L('q_weld')} — ${L('q_cjp')}`, q.cjpM.toFixed(1), 'm'], [`${L('q_weld')} — ${L('q_fillet')}`, q.filletM.toFixed(1), 'm'],
    [], [L('q_excluded')], [L('q_note')], [L('q_excluded_note')],
    ...restraintKeys(spec).map((k) => [t(`restraint_${k}`), t(`restraint_${support(spec, k)}`)]),
    [t('restraint_note')],
  ]
  const titles = new Set([L('q_members'), L('q_plates'), L('q_bolts'), L('q_summary'), L('q_excluded')])
  const tabled = new Set([L('q_members'), L('q_plates'), L('q_bolts')])
  return {
    name: L('out_quantities'), rows, widths: [22, 26, 16, 12, 12, 12, 14],
    styleOf: (row, i) => row.length === 1 && titles.has(String(row[0])) ? 'title' : i > 0 && rows[i - 1].length === 1 && tabled.has(String(rows[i - 1][0])) ? 'header' : undefined,
  }
}

export const quantityCsv = (sheet: XlsxSheet) => {
  const cell = (v: unknown) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '\ufeff' + sheet.rows.map((r) => r.map(cell).join(',')).join('\r\n')
}
