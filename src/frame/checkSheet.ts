/* 다층 강골조 검토 결과 시트 (CSV·XLSX 공통, 화면 언어) — 부재 검토 전체 + 층 검토. 작성기는 공장 앱 report/xlsx.ts·quantitySheet.ts.
   등급·지배 항목·층 값 표기는 계산서(report.ts)·화면과 같은 규칙 */
import { t, type I18nKey } from '../i18n'
import type { XlsxSheet } from '../report/xlsx'
import { memberFails, type FrameDesign } from './design'
import { CHECK_NAME, storyValue } from './report'
import type { StoryItem } from './story'
import type { FrameSpec } from './types'

/** 검토 결과 시트 — 부재 검토(응력비 큰 순) · 층 검토 */
export function frameCheckSheet(spec: FrameSpec, design: FrameDesign, review: StoryItem[] | null): XlsxSheet {
  const L = (k: string, ...a: unknown[]) => (t as (k: I18nKey, ...a: unknown[]) => string)(k as I18nKey, ...a)
  const members = [...design.members].sort((a, b) => Math.max(b.ratio, b.detailRatio) - Math.max(a.ratio, a.detailRatio))
  const rows: unknown[][] = [
    [L('fr_ck_title')], [L('fr_q_project', spec.xs.at(-1)! - spec.xs[0], spec.ys.at(-1)! - spec.ys[0], spec.heights.length, spec.material)],
    [],
    [L('fr_ck_members')],
    ['#', L('fr_role'), L('fr_story'), L('fr_section'), 'L (m)', 'μx', 'μy', L('fr_combo'), L('fr_governing'), L('fr_ratio'), L('fr_detail'), L('fr_status')],
    ...members.map((m) => [m.id, L(`fr_role_${m.role}`), spec.storyNames[m.story - 1] ?? String(m.story), m.section, m.L.toFixed(3), m.muX.toFixed(3), m.muY.toFixed(3),
      m.worst.combo, CHECK_NAME[m.worst.governing] ? L(CHECK_NAME[m.worst.governing]) : m.worst.governing, m.ratio.toFixed(3), m.detailRatio.toFixed(3), L(memberFails(m) ? 'gr_fail' : 'fr_gr_expert')]),
  ]
  if (review) rows.push(
    [],
    [L('fr_story_review')],
    [L('fr_item'), L('fr_clause'), L('fr_story'), L('rp_value'), L('rp_limit'), L('fr_status')],
    ...review.flatMap((it) => it.rows.map((r) => [`${L(`fr_sr_${it.key}`)}${it.dir ? ` ${it.dir}` : ''}`, it.clause, r.story, storyValue(it, r.value),
      Number.isFinite(r.limit) ? storyValue(it, r.limit) : '—', L(`fr_st_${r.status}`)])),
  )
  const titles = new Set([L('fr_ck_title'), L('fr_ck_members'), L('fr_story_review')])
  const tabled = new Set([L('fr_ck_members'), L('fr_story_review')])
  return {
    name: L('fr_ck_sheet'), rows, widths: [16, 18, 10, 22, 9, 8, 8, 12, 22, 10, 10, 26],
    styleOf: (row, i) => row.length === 1 && titles.has(String(row[0])) ? 'title' : i > 0 && rows[i - 1].length === 1 && tabled.has(String(rows[i - 1][0])) ? 'header' : undefined,
  }
}
