import { additionLabelKey } from '../domain/additionTypes'
import { blockedMembers, issueNotes } from '../domain/validity'
/* 결과 요약 카드 + 부재 결과 표 (Data Table) — 부재 수백 개를 카드 목록 대신 표로.
   필터(부재 종류·NG 만·0.9 이상)·검색(요소·단면·조합)·열 정렬(강도비 내림차순 기본)·50행씩 더 보기·CSV(필터 결과, UTF-8 BOM). */
import { useMemo, useState } from 'react'
import { steelWeight } from '../domain/optimize'
import type { DesignResult, MemberCheck } from '../domain/design'
import { ROLES } from '../domain/types'
import { t, type I18nKey } from '../i18n'
import { useStore } from '../state/store'
import { unavailable } from '../state/taskFlow'
import { memberGrade } from '../domain/status'
import { GradeChip } from './Status'

const ratioColor = (r: number) => (r > 1 ? 'var(--red)' : r > 0.9 ? 'var(--amber)' : 'var(--green)')

const PART = ['I', '1/4', '2/4', '3/4', 'J']
type SortKey = 'id' | 'role' | 'section' | 'ratio' | 'combo'
type Filter = 'all' | 'ng' | 'near'
const PAGE = 50

/** 결과 탭 맨 위 — 이상 여부를 먼저 보고, 아래 표에서 원인을 찾는다 */
export function SummaryCards() {
  const s = useStore()
  const b = s.built, d = s.design
  if (!b || !d) return null
  const tons = steelWeight(b.spec, b.model)
  const ng = d.ng
  const cards: [I18nKey, string, string?][] = [
    ['sum_weight', `${tons.toFixed(2)} t`],
    ['sum_max', d.maxRatio.toFixed(3), ratioColor(d.maxRatio)],
    ['sum_ng', String(ng), ng ? 'var(--red)' : 'var(--green)'],
  ]
  if (blockedMembers(d)) cards.push(['rs_applicability', String(blockedMembers(d)), 'var(--red)'])
  if (s.opt) {
    const pct = s.opt.weightBefore > 0 ? ((s.opt.weightBefore - s.opt.weightAfter) / s.opt.weightBefore) * 100 : 0
    cards.push(['sum_opt', `${pct.toFixed(1)}%`, s.opt.ok ? 'var(--green)' : 'var(--red)'])
  }
  return (
    <div className="sum-cards">
      {cards.map(([k, v, color]) => (
        <div key={k} className="sum-card"><span className="sum-k">{t(k)}</span><span className="sum-v" style={color ? { color } : undefined}>{v}</span></div>
      ))}
    </div>
  )
}

export function MemberTable({ d }: { d: DesignResult }) {
  const state = useStore()
  const exportReason = unavailable(state, 'outputs')
  const [role, setRole] = useState<string>('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'ratio', desc: true })
  const [shown, setShown] = useState(PAGE)
  const roles = ROLES.filter((r) => d.members.some((m) => m.role === r))

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = d.members.filter((m) => (role === 'all' || m.role === role)
      && (filter === 'all' || (filter === 'ng' ? memberGrade(m).grade === 'fail' : m.ratio >= 0.9))
      && (!needle || String(m.id) === needle || m.section.toLowerCase().includes(needle) || m.combo.toLowerCase().includes(needle)))
    const val = (m: MemberCheck): number | string => sort.key === 'role' ? (m.addition ? t(additionLabelKey(m.addition)) : t(`role_${m.role}`)) : m[sort.key]
    return list.sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y)); return sort.desc ? -c : c })
  }, [d, role, filter, q, sort])

  const head = (key: SortKey, label: I18nKey) => (
    <th aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button className="th-sort" onClick={() => { setSort((o) => ({ key, desc: o.key === key ? !o.desc : key === 'ratio' })); setShown(PAGE) }}>
        {t(label)}{sort.key === key ? (sort.desc ? ' ▼' : ' ▲') : ''}
      </button>
    </th>
  )

  const csv = () => {
    if (exportReason) return
    const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
    const lines = [[t('rd_elem'), t('rd_role'), t('rd_section'), t('rd_ratio'), t('rd_eq'), t('rd_combo'), t('mt_part'), t('rd_mode'), t('rd_status'), t('mt_notes')].map(esc).join(',')]
    for (const m of rows) lines.push([m.id, (m.addition ? t(additionLabelKey(m.addition)) : t(`role_${m.role}`)), m.section, m.ratio.toFixed(4), m.eq, m.combo, m.part >= 0 ? PART[m.part] : '', m.cap.mxMode, t(`gr_${memberGrade(m).grade}`), issueNotes(m).join(' / ')].map(esc).join(','))
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'steel_members.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="scard"><h3>{t('mt_title')} <span className="mt-count">{t('mt_count', rows.length, d.members.length)}</span></h3>
      <div className="mt-bar">
        <select aria-label={t('rd_role')} value={role} onChange={(e) => { setRole(e.target.value); setShown(PAGE) }}>
          <option value="all">{t('mt_all_roles')}</option>
          {roles.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
        </select>
        {(['all', 'ng', 'near'] as const).map((f) => (
          <button key={f} className={`vtog ${filter === f ? 'on' : 'off'} mt-f`} aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(PAGE) }}>{t(`mt_f_${f}`)}</button>
        ))}
        <input className="mt-q" type="search" placeholder={t('mt_search')} aria-label={t('mt_search')} value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE) }} />
        <button className="btn btn-ghost mt-csv" onClick={csv} disabled={!rows.length || !!exportReason} title={exportReason ? t(exportReason) : undefined}>CSV</button>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table className="mt-table">
          <thead><tr>{head('id', 'rd_elem')}{head('role', 'rd_role')}{head('section', 'rd_section')}{head('ratio', 'rd_ratio')}<th>{t('rd_status')}</th><th>{t('rd_eq')}</th>{head('combo', 'rd_combo')}<th>{t('mt_part')}</th></tr></thead>
          <tbody>
            {rows.slice(0, shown).map((m) => (
              <tr key={m.id} title={issueNotes(m).join(' / ')}>
                <td className="mono">{m.id}</td><td>{(m.addition ? t(additionLabelKey(m.addition)) : t(`role_${m.role}`))}</td><td className="mono">{m.section}</td>
                <td className="mono" style={{ color: ratioColor(m.ratio), fontWeight: 700 }}>{m.ratio.toFixed(3)}{m.ratio > 1 ? ' ✕' : ''}</td>
                <td>{(() => { const g = memberGrade(m); return <GradeChip g={g.grade} reasons={g.reasons} /> })()}</td>
                <td className="mono">{m.eq}</td><td className="mono">{m.combo}</td><td className="mono">{m.part >= 0 ? PART[m.part] : '—'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} style={{ color: 'var(--dim)', textAlign: 'center' }}>{t('mt_none')}</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > shown && <button className="btn btn-ghost mt-more" onClick={() => setShown((n) => n + PAGE)}>{t('mt_more', rows.length - shown)}</button>}
    </div>
  )
}
