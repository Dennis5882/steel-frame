/* 우측 패널 — 모델(스펙·하중·조합) · 결과(평형·주기·층 검토·부재 검토). 등급은 'OK' 단정 대신 검토 등급(domain/status) */
import { useMemo, useState, type ReactNode } from 'react'
import { t, type I18nKey } from '../../i18n'
import { useStore } from '../../state/store'
import { F, draftModel, draftPayloads, frameStale } from '../../frame/state'
import { gravityTotals } from '../../frame/loads'
import { equilibriumError } from '../../frame/run'
import type { StoryItem, StoryStatus } from '../../frame/story'
import type { MemberDesign } from '../../frame/design'
import type { FrameRole } from '../../frame/types'

const KV = ({ k, v, hi }: { k: string; v: ReactNode; hi?: boolean }) => <div className="kv"><span className="k">{k}</span><span className={`v${hi ? ' hi' : ''}`}>{v}</span></div>
const f = (v: number, d = 3) => Number.isFinite(v) ? v.toFixed(d) : '—'

const STORY_GRADE: Record<StoryStatus, string> = { ok: 'pass', warn: 'prelim', ng: 'fail', na: 'expert' }
export const StoryChip = ({ s }: { s: StoryStatus }) => <span className="grade" data-g={STORY_GRADE[s]}>{t(`fr_st_${s}`)}</span>
/** 부재 등급: 강도·구조 규정 NG → fail, 통과해도 1차 미구현 항목(가새 불평형력·강기둥약보·节点域)이 남아 expert */
export const memberGradeOf = (m: MemberDesign) => m.ratio > 1 || m.detailRatio > 1 ? 'fail' : 'expert'
export const MemberChip = ({ m }: { m: MemberDesign }) => { const g = memberGradeOf(m); return <span className="grade" data-g={g}>{t(g === 'fail' ? 'gr_fail' : 'fr_gr_expert')}</span> }

export function FrameModelPanel() {
  const s = useStore()
  const sh = useMemo(() => {
    const preview = frameStale(F) || !F.built
    const spec = preview ? F.draft : F.built!.spec
    if (!spec) return null
    const model = preview ? draftModel(spec).model : F.built!.model
    if (!model) return null
    const P = preview ? draftPayloads(spec, model) : F.built!.P
    return P ? { spec, model, P, preview } : null
  }, [s.viewNonce, F.built])
  if (!sh) return <div className="res-empty">{t('model_empty')}</div>
  const { spec, model: m, P } = sh
  const g = gravityTotals(spec, m)
  const count = (r: FrameRole) => m.elements.filter((e) => e.role === r).length
  return <div>
    {sh.preview && <div className="res-stat">{t('preview_tag')}</div>}
    <div className="statgrid">
      <div className="stat"><div className="n">{m.nodes.length}</div><div className="l">{t('st_node')}</div></div>
      <div className="stat"><div className="n">{m.elements.length}</div><div className="l">{t('st_elem')}</div></div>
      <div className="stat"><div className="n">{P.combos.length}</div><div className="l">{t('fr_combos')}</div></div>
    </div>
    <div className="scard"><h3>{t('sec_geom')}</h3>
      <KV k={t('kv_code')} v={t('fr_code_label')} hi />
      <KV k={t('fs_grid')} v={`${spec.xs.at(-1)! - spec.xs[0]} × ${spec.ys.at(-1)! - spec.ys[0]} m · ${spec.xs.length - 1} × ${spec.ys.length - 1}`} />
      <KV k={t('fs_stories')} v={`${spec.heights.length} · ${spec.heights.join(' / ')} m`} />
      <KV k={t('fr_area_story')} v={`${m.floorArea} m²`} />
      {(['column', 'beam', 'brace'] as const).map((r) => <KV key={r} k={`${t(`fr_role_${r}`)} · ${spec.sections[r]}`} v={count(r)} />)}
      <KV k={t('fr_grade')} v={spec.material} />
    </div>
    <div className="scard"><h3>{t('sec_load')}</h3>
      <KV k={t('fr_dl_total')} v={`${f(g.dlExceptSelf, 1)} kN`} />
      <KV k={t('fr_ll_total')} v={`${f(g.ll, 1)} kN`} />
      {P.wind.map((w) => <KV key={w.dir} k={t('fr_wind_dir', w.dir)} v={`T₁ ${f(w.T1)} s · ${f(w.base, 1)} kN`} />)}
    </div>
    <div className="scard"><h3>{t('fr_wind_story')}</h3>
      <table><thead><tr><th>{t('fr_level')}</th><th>z (m)</th><th>μz</th><th>βz</th><th>Fx (kN)</th><th>Fy (kN)</th></tr></thead><tbody>
        {P.wind[0].stories.map((st, i) => <tr key={i}><td>{spec.storyNames[st.level]}</td><td className="mono">{f(st.z, 2)}</td><td className="mono">{f(st.muz)}</td><td className="mono">{f(st.betaz)}</td><td className="mono">{f(st.F, 2)}</td><td className="mono">{f(P.wind[1].stories[i]?.F ?? NaN, 2)}</td></tr>)}
      </tbody></table>
    </div>
    <div className="scard"><h3>{t('fr_combos')} ({P.combos.length})</h3>
      <table><tbody>{P.combos.map((c) => <tr key={c.name}><td className="mono">{c.name}</td><td>{c.desc}</td></tr>)}</tbody></table>
    </div>
  </div>
}

function storyValue(it: StoryItem, v: number) { return it.key === 'drift' ? `1/${Math.round(1 / v)}` : f(v) }
function storyLimit(it: StoryItem, v: number) { return !Number.isFinite(v) ? '—' : it.key === 'drift' ? `1/${Math.round(1 / v)}` : f(v) }

export function StoryReviewTable({ items }: { items: StoryItem[] }) {
  return <div className="scard"><h3>{t('fr_story_review')}</h3>
    <table><thead><tr><th>{t('fr_item')}</th><th>{t('fr_clause')}</th><th>{t('fr_story_rows')}</th><th>{t('fr_status')}</th></tr></thead><tbody>
      {items.map((it, i) => <tr key={i}><td>{t(`fr_sr_${it.key}` as I18nKey)}{it.dir ? ` ${it.dir}` : ''}</td><td className="mono">{it.clause}</td>
        <td className="mono">{it.rows.map((r) => <div key={r.story} title={r.note} style={r.status !== 'ok' ? { color: r.status === 'ng' ? 'var(--red)' : 'var(--amber)' } : undefined}>{r.story}: {storyValue(it, r.value)} / {storyLimit(it, r.limit)}{r.note ? ' *' : ''}</div>)}</td>
        <td><StoryChip s={it.status} /></td></tr>)}
    </tbody></table>
  </div>
}

const GOV: Record<string, I18nKey> = { strength: 'fr_gov_strength', shear: 'fr_gov_shear', ltb: 'fr_gov_ltb', stabilityX: 'fr_gov_stabx', stabilityY: 'fr_gov_staby', braceComp: 'fr_gov_bracecomp', braceTens: 'fr_gov_braceten', web: 'fr_gov_web' }
const gov = (k: string) => GOV[k] ? t(GOV[k]) : k
/** 가새 지진 압축이 지배할 때 ψ 미적용 비 (Gen 예제 방식, 판정에는 쓰지 않음) */
const noPsi = (m: MemberDesign) => { const it = m.worst.items.find((i) => i.key === m.worst.governing && i.psi); return it ? it.ratio * it.psi! : null }

function MemberRows({ list }: { list: MemberDesign[] }) {
  return <table><thead><tr><th>#</th><th>{t('fr_role')}</th><th>{t('fr_story')}</th><th>{t('fr_section')}</th><th>L (m)</th><th>μx / μy</th><th>{t('fr_combo')}</th><th>{t('fr_governing')}</th><th>{t('fr_ratio')}</th><th>{t('fr_detail')}</th><th /></tr></thead><tbody>
    {list.map((m) => <tr key={m.id}><td className="mono">{m.id}</td><td>{t(`fr_role_${m.role}`)}</td><td>{m.story}</td><td className="mono">{m.section}</td><td className="mono">{f(m.L, 2)}</td>
      <td className="mono">{f(m.muX, 2)} / {f(m.muY, 2)}</td><td className="mono">{m.worst.combo}</td><td>{gov(m.worst.governing)}</td>
      <td className="mono" style={m.ratio > 1 ? { color: 'var(--red)' } : undefined}>{f(m.ratio)}{noPsi(m) !== null && <div className="pe-hint" title={t('fr_nopsi_tip')}>{t('fr_nopsi', f(noPsi(m)!))}</div>}</td><td className="mono" style={m.detailRatio > 1 ? { color: 'var(--red)' } : undefined}>{f(m.detailRatio)}</td><td><MemberChip m={m} /></td></tr>)}
  </tbody></table>
}

export function FrameResultsPanel() {
  useStore()
  const [role, setRole] = useState<FrameRole | 'all'>('all')
  const [ngOnly, setNgOnly] = useState(false)
  const A = F.analysis, D = F.design
  if (!A) return <div className="res-empty">{t('res_empty')}</div>
  const eig = A.story.eigen
  const list = D ? D.members.filter((m) => (role === 'all' || m.role === role) && (!ngOnly || memberGradeOf(m) === 'fail')).sort((a, b) => Math.max(b.ratio, b.detailRatio) - Math.max(a.ratio, a.detailRatio)) : []
  return <div>
    {frameStale(F) && <div className="stale-banner" role="status">{t('fr_stale')}</div>}
    {D && <div className="scard"><h3>{t('fr_member_summary')}</h3>
      <table><thead><tr><th>{t('fr_role')}</th><th>{t('fr_count')}</th><th>{t('fr_max_ratio')}</th><th>{t('fr_detail')}</th><th>{t('fr_governing')}</th><th /></tr></thead><tbody>
        {(['beam', 'column', 'brace'] as const).map((r) => { const ms = D.members.filter((m) => m.role === r); const w = D.byRole[r]; if (!w) return null
          const det = Math.max(...ms.map((m) => m.detailRatio))
          return <tr key={r}><td>{t(`fr_role_${r}`)}</td><td>{ms.length}</td><td className="mono" style={w.ratio > 1 ? { color: 'var(--red)' } : undefined}>{f(w.ratio)} (#{w.id}){noPsi(w) !== null && <div className="pe-hint" title={t('fr_nopsi_tip')}>{t('fr_nopsi', f(noPsi(w)!))}</div>}</td>
            <td className="mono" style={det > 1 ? { color: 'var(--red)' } : undefined}>{f(det)}</td><td>{gov(w.worst.governing)} · {w.worst.combo}</td><td><MemberChip m={w} /></td></tr> })}
      </tbody></table>
      <p className="pe-tip">{t('fr_member_note')}</p>
    </div>}
    {F.review && <StoryReviewTable items={F.review} />}
    <div className="scard"><h3>{t('fr_eigen')}</h3>
      {eig ? <table><thead><tr><th>{t('fr_mode')}</th><th>T (s)</th><th>ΣX (%)</th><th>ΣY (%)</th></tr></thead><tbody>
        {eig.periods.map((p, i) => <tr key={i}><td>{i + 1}</td><td className="mono">{f(p, 4)}</td><td className="mono">{f(eig.massX[i] ?? NaN, 2)}</td><td className="mono">{f(eig.massY[i] ?? NaN, 2)}</td></tr>)}
      </tbody></table> : <p className="pe-tip">{t('fr_eigen_missing')}</p>}
    </div>
    <div className="scard"><h3>{t('fr_equilibrium')}</h3>
      <table><thead><tr><th>{t('res_lc')}</th><th>Gen (kN)</th><th>{t('fr_app')} (kN)</th><th>{t('fr_diff')}</th></tr></thead><tbody>
        {Object.entries(A.equilibrium).map(([k, e]) => <tr key={k}><td className="mono">{k}</td><td className="mono">{f(e.gen, 2)}</td><td className="mono">{f(e.app, 2)}</td>
          <td className="mono" style={!(equilibriumError(e) < 1e-3) ? { color: 'var(--red)' } : undefined}>{(equilibriumError(e) * 100).toFixed(4)} %</td></tr>)}
      </tbody></table>
    </div>
    {D && <div className="scard"><h3>{t('fr_members')} ({list.length})</h3>
      <div className="history-filters" role="group" aria-label={t('fr_role')}>
        {(['all', 'beam', 'column', 'brace'] as const).map((r) => <button key={r} aria-pressed={role === r} onClick={() => setRole(r)}>{r === 'all' ? t('flow_all') : t(`fr_role_${r}`)}</button>)}
        <button aria-pressed={ngOnly} onClick={() => setNgOnly((v) => !v)}>{t('fr_ng_only')}</button>
      </div>
      <div style={{ overflowX: 'auto' }}><MemberRows list={list} /></div>
    </div>}
  </div>
}
