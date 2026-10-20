/* 다층 강골조 검토 결과 시트 (CSV·XLSX 공통, 화면 언어) — 부재 검토 전체 + 층 검토. 작성기는 공장 앱 report/xlsx.ts·quantitySheet.ts.
   등급·지배 항목·층 값 표기·비고는 계산서(report.ts)·화면과 같은 규칙.
   값은 숫자 칸으로 둔다: 응력비 4자리(1.0004 가 1.000 으로 보이며 NG 인 일 없게), 층간변위각은 비율 숫자 + 1/n 의 n (CSV 를 엑셀이 '1/45' 를 날짜로 읽지 않게) */
import { t, type I18nKey } from '../i18n'
import type { XlsxSheet } from '../report/xlsx'
import { memberFails, type FrameDesign, type MemberDesign } from './design'
import { CHECK_NAME } from './report'
import { sheetRows } from './sheet'
import type { StoryItem } from './story'
import type { FrameSpec } from './types'

/** 정렬 키 — 응력비·구조 규정 중 큰 값. 숫자가 아니면(결과 이상) 맨 위로 올려 눈에 띄게 한다 */
export const checkOrderKey = (m: Pick<MemberDesign, 'ratio' | 'detailRatio'>) => { const k = Math.max(m.ratio, m.detailRatio); return Number.isNaN(k) ? Infinity : k }
const num = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '')

/** 검토 결과 시트 — 부재 검토(응력비 큰 순) · 층 검토 */
export function frameCheckSheet(spec: FrameSpec, design: FrameDesign, review: StoryItem[] | null): XlsxSheet {
  const L = (k: string, ...a: unknown[]) => (t as (k: I18nKey, ...a: unknown[]) => string)(k as I18nKey, ...a)
  const members = [...design.members].sort((a, b) => checkOrderKey(b) - checkOrderKey(a) || a.id - b.id)
  const b = sheetRows()
  b.title(L('fr_ck_title')); b.row([L('fr_q_project', spec.xs.at(-1)! - spec.xs[0], spec.ys.at(-1)! - spec.ys[0], spec.heights.length, spec.material)])
  b.blank()
  b.title(L('fr_ck_members'))
  b.header([L('fr_ck_id'), L('fr_role'), L('fr_story'), L('fr_section'), L('fr_ck_len'), L('fr_ck_mux'), L('fr_ck_muy'), L('fr_combo'), L('fr_governing'), L('fr_ratio'), L('fr_detail'), L('fr_status')])
  for (const m of members) b.row([m.id, L(`fr_role_${m.role}`), spec.storyNames[m.story - 1] ?? String(m.story), m.section, num(m.L, 3), num(m.muX, 3), num(m.muY, 3),
    m.worst.combo, CHECK_NAME[m.worst.governing] ? L(CHECK_NAME[m.worst.governing]) : m.worst.governing, num(m.ratio, 4), num(m.detailRatio, 4), L(memberFails(m) ? 'gr_fail' : 'fr_gr_expert')])
  if (review) {
    b.blank()
    b.title(L('fr_story_review'))
    b.header([L('fr_item'), L('fr_clause'), L('fr_story'), L('rp_value'), L('rp_limit'), L('fr_ck_inv'), L('fr_status'), L('rp_note')])
    for (const it of review) for (const r of it.rows) {
      const drift = it.key === 'drift'
      b.row([`${L(`fr_sr_${it.key}`)}${it.dir ? ` ${it.dir}` : ''}`, it.clause, r.story, num(r.value, drift ? 6 : 3), num(r.limit, drift ? 6 : 3),
        drift && r.value > 0 && Number.isFinite(r.value) ? String(Math.round(1 / r.value)) : '', L(`fr_st_${r.status}`), r.note ?? ''])
    }
  }
  return b.sheet(L('fr_ck_sheet'), [10, 18, 10, 22, 10, 9, 9, 12, 22, 10, 10, 26])
}

/** 완료 안내용 집계 — 부재 수·NG 부재 수·층 검토 행 수 */
export const checkCounts = (design: FrameDesign, review: StoryItem[] | null) =>
  ({ members: design.members.length, ng: design.members.filter(memberFails).length, story: review?.reduce((a, it) => a + it.rows.length, 0) ?? 0 })
