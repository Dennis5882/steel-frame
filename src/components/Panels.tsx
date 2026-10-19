/* 우측 패널 — 활동 로그 · 모델 상태 · 해석 결과 */
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { profileOf } from '../codes'
import { buildLoadPayloads, type LoadInfo } from '../domain/loads'
import { buildPortal } from '../domain/portal'
import type { ConnResult } from '../domain/connections'
import {isLengthService,type DesignResult} from '../domain/design'
import type { OptSummary } from '../domain/optimize'
import { connGrade, roleGrade } from '../domain/status'
import { GradeChip, siteSourceText, StatusCard } from './Status'
import { dimValue } from '../report/dims'
import { StaleBanner } from './StaleBanner'
import { selectTask } from '../state/ui'
import { MemberTable, SummaryCards } from './MemberTable'
import { lengthText, ROLES, type FactoryModel, type FactorySpec } from '../domain/types'
import { t, tc, type I18nKey } from '../i18n'
import { useStore, type AppState } from '../state/store'

export function LogPanel() {
  const s = useStore()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = ref.current?.parentElement
    if (box) box.scrollTop = box.scrollHeight
  }, [s.log.length])
  return (
    <div id="log" ref={ref}>
      {s.log.length === 0 && <div className="empty">{t('log_empty')}</div>}
      {s.log.map((l) => (
        <div key={l.id} className={`ln ${l.type}`}>
          <span className="ts">{l.ts}</span><span className="m" dangerouslySetInnerHTML={{ __html: l.html }} />
        </div>
      ))}
    </div>
  )
}

function KV({ k, v, hi, style }: { k: string; v: ReactNode; hi?: boolean; style?: CSSProperties }) {
  return <div className="kv"><span className="k">{k}</span><span className={`v${hi ? ' hi' : ''}`} style={style}>{v}</span></div>
}

interface Shown { spec: FactorySpec; model: FactoryModel; info: LoadInfo; cases: number; combos: number; preview: boolean }

/** 표시 대상 — 편집 중 미리보기(오프라인 계산) 우선, 없으면 Gen 에 보낸 모델 */
function shownOf(s: AppState): Shown | null {
  if (s.preview) {
    /* 적용범위 밖 입력(CN validateCnSpec 등)은 하중 생성이 예외 → 미리보기 대신 보낸 모델 (범위 판정은 카드에 표시) */
    try {
      const model = buildPortal(s.preview)
      const l = buildLoadPayloads(s.preview, model)
      return { spec: s.preview, model, info: l.info, cases: Object.keys(l.STLD).length, combos: Object.keys(l['LCOM-GEN']).length, preview: true }
    } catch { /* 아래로 */ }
  }
  const b = s.built
  return b ? { spec: b.spec, model: b.model, info: b.info, cases: b.cases.length, combos: b.combos, preview: false } : null
}

const f1 = (x: number) => x.toFixed(1)
const f3 = (x: number) => x.toFixed(3)

export function ModelPanel() {
  const s = useStore()
  const sh = useMemo(() => shownOf(s), [s.viewNonce, s.built])
  if (!sh) return <div className="res-empty">{t('model_empty')}</div>
  const { spec: sp, model: m, info } = sh
  const count = (r: string) => m.elements.filter((e) => e.role === r).length
  const seis = (d: 'X' | 'Y') => `${info.seismic[d].T.toFixed(3)} s · ${f3(info.seismic[d].c)} · ${f1(info.seismic[d].V)} kN`

  return (
    <div>
      {sh.preview && <div className="res-stat">{t('preview_tag')}</div>}
      <div className="statgrid">
        <div className="stat"><div className="n">{m.nodes.length}</div><div className="l">{t('st_node')}</div></div>
        <div className="stat"><div className="n">{m.elements.length}</div><div className="l">{t('st_elem')}</div></div>
        <div className="stat"><div className="n">{sh.cases}</div><div className="l">{t('st_case')}</div></div>
      </div>
      <div className="scard"><h3>{t('sec_geom')}</h3>
        <KV k={t('kv_code')} v={t(profileOf(sp.code).basisLabelKey ?? profileOf(sp.code).labelKey)} hi />
        <KV k={t('kv_span')} v={`${sp.span} m`} hi />
        <KV k={t('kv_length')} v={lengthText(sp)} />
        <KV k={t('kv_eave')} v={`${sp.eaveHeight} m`} />
        <KV k={t('kv_slope')} v={`${sp.roofSlope} (${f1((Math.atan(sp.roofSlope) * 180) / Math.PI)}°)`} />
        <KV k={t('kv_base')} v={t(sp.baseFixity === 'fixed' ? 'base_fixed' : 'base_pinned')} />
        {ROLES.map((r) => (
          <KV key={r} k={t(`role_${r}`)} v={count(r)} />
        ))}
      </div>
      <div className="scard"><h3>{t('sec_prop')}</h3>
        <KV k={t('kv_mat')} v={sp.material} />
        <KV k={t('f_column')} v={sp.sections.column} />
        <KV k={t('f_rafter')} v={sp.sections.rafter} />
        <KV k={t('f_purlin')} v={sp.sections.purlin} />
        <KV k={t('f_girt')} v={sp.sections.girt} />
        <KV k={t('f_strut')} v={sp.sections.strut} />
        <KV k={t('f_post')} v={sp.sections.post} />
        <KV k={t('f_brace')} v={sp.sections.brace} />
      </div>
      <div className="scard"><h3>{t('sec_load')}</h3>
        <KV k={t('kv_roofLive')} v={`${f3(info.roofLive)} kN/m²`} />
        <KV k={t('kv_site_src')} v={siteSourceText(sp)} />
        <KV k={t('kv_W')} v={`${f1(info.seismic.W)} kN`} />
        <KV k={t('kv_EX')} v={seis('X')} hi />
        <KV k={t('kv_EY')} v={seis('Y')} hi />
        <KV k={t('kv_qh')} v={`${f3(info.wind.qh)} kN/m² (h = ${info.wind.hRef} m)`} />
        <KV k={t('kv_cpRoof')} v={`${f3(info.wind.windwardRoofCp.high)} / ${f3(info.wind.windwardRoofCp.low)}`} />
        {sp.code === 'CN' && <KV k={t('f_cn_snow')} v={`${f3(info.snow ?? 0)} kN/m²`} />}
        {sp.code === 'KR' && info.kr && <>
          <KV k={t('kv_kr_snow')} v={`S_s ${f3(info.snow ?? 0)} kN/m² (S_f ${f3(info.kr.Sf)}, C_s ${f3(info.kr.Cs)}${info.kr.snowMin ? `, min ${f3(info.kr.snowMin)}` : ''})`} />
          <KV k={t('kv_kr_site')} v={`S ${info.kr.spectrum.S} · S_DS ${f3(info.kr.spectrum.SDS)} · S_D1 ${f3(info.kr.spectrum.SD1)} · ${t('kv_kr_sdc')} ${info.kr.sdc} · R ${info.kr.sys.X.R}/${info.kr.sys.Y.R} · I_E ${info.kr.IE}`} />
          <KV k={t('kv_kr_gust')} v={`G_D X ${f3(info.kr.GD.X)} / Y ${f3(info.kr.GD.Y)} · G_pe X ${f3(info.kr.Gpe.X)} / Y ${f3(info.kr.Gpe.Y)} · C_pi ${info.kr.cpi.join(' / ')}`} />
          <KV k={tc('KR', 'kv_across')} v={`W_LC ${f1(info.wind.across.WLX)} / ${f1(info.wind.across.WLY)} kN (γ ${f3(info.kr.gammaL.X)} / ${f3(info.kr.gammaL.Y)})`} />
        </>}
        {sp.code === 'TW' && info.wind.across && <KV k={t('kv_across')} v={`W_L ${f1(info.wind.across.WLX)} / ${f1(info.wind.across.WLY)} kN · M_T ${f1(info.wind.across.MT)} kN·m`} />}
        <KV k={t('kv_combos')} v={sh.combos} />
      </div>
    </div>
  )
}

const ratioColor = (r: number) => (r > 1 ? 'var(--red)' : r > 0.9 ? 'var(--amber)' : 'var(--green)')
const PART = ['I', '1/4', '2/4', '3/4', 'J']
/** 변위각은 1/n, 처짐은 mm */
const svcVal = (k: DesignResult['service'][number]['key'], v: number) => (isLengthService(k) ? `${(v * 1000).toFixed(1)} mm` : `1/${Math.round(1 / Math.max(v, 1e-9))}`)

function Seis13Card({ d }: { d: DesignResult }) {
  const s = useStore()
  const om = s.built?.info.omega
  const c = d.col13
  return (
    <div className="scard"><h3>{t('res_seis13')}</h3>
      {om && <KV k={t('s13_omega')} v={`Ω X ${om.X.toFixed(2)} · Y ${om.Y.toFixed(2)}`} />}
      {c && <KV k={t('s13_col')} v={c.exempt ? t('s13_exempt', c.puRatio.toFixed(3)) : `${c.ratio.toFixed(3)} (${c.combo})`}
        style={c.exempt ? { color: 'var(--muted)' } : { color: ratioColor(c.ratio), fontWeight: 700 }} />}
      <div className="res-stat" style={{ marginTop: 8, marginBottom: 0 }}>· {t('s13_brace')}<br />· {t('s13_base')}<br />· {t('s13_knee')}</div>
    </div>
  )
}

function DesignTables({ d }: { d: DesignResult }) {
  const code = useStore().built?.spec.code
  return (
    <>
      <div className="scard"><h3>{tc(code, 'res_design')}</h3>
        <div style={{ overflow: 'auto' }}>
          <table>
            <thead><tr><th>{t('rd_role')}</th><th>{t('rd_section')}</th><th>{t('rd_elem')}</th><th>{t('rd_ratio')}</th><th>{t('rd_eq')}</th><th>{t('rd_combo')}</th><th>{t('rd_mode')}</th><th>{t('rd_status')}</th></tr></thead>
            <tbody>
              {ROLES.filter((r) => d.byRole[r]).map((r) => {
                const m = d.byRole[r]!
                return (
                  <tr key={r} title={m.notes.join(' / ')}>
                    <td>{t(`role_${r}`)}</td><td className="mono">{m.section}</td><td className="mono">{m.id}{m.part >= 0 ? ` (${PART[m.part]})` : ''}</td>
                    <td className="mono" style={{ color: ratioColor(m.ratio), fontWeight: 700 }}>{m.ratio.toFixed(3)}</td>
                    <td className="mono">{m.eq}</td><td className="mono">{m.combo}</td>
                    <td style={{ color: 'var(--muted)' }}>{m.eq === 'KL/r' ? `KL/r ${m.slender.value.toFixed(0)}/${m.slender.limit}` : m.cap.mxMode}{m.notes.length ? ' *' : ''}</td>
                    <td>{(() => { const g = roleGrade(d, r); return <GradeChip g={g.grade} reasons={g.reasons} /> })()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="res-stat" style={{ marginTop: 10, marginBottom: 0 }}>{t('restraint_lengths')} {tc(code, 'rd_assump')}</div>
      </div>
      <div className="scard"><h3>{t('res_service')}</h3>
        <table>
          <thead><tr><th>{t('sv_item')}</th><th>{t('sv_value')}</th><th>{t('sv_limit')}</th><th>{t('rd_ratio')}</th><th>{t('sv_clause')}</th></tr></thead>
          <tbody>
            {d.service.map((sv) => (
              <tr key={sv.key}>
                <td>{t(`sv_${sv.key}`)}</td><td className="mono">{svcVal(sv.key, sv.value)}</td><td className="mono">{svcVal(sv.key, sv.limit)}</td>
                <td className="mono" style={{ color: ratioColor(sv.ratio), fontWeight: 700 }}>{sv.ratio.toFixed(3)}</td><td style={{ color: 'var(--muted)' }}>{sv.clause}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.col13 !== undefined && <Seis13Card d={d} />}
      {!!d.cc?.length && (
        <div className="scard"><h3>{t('res_cc')}</h3>
          <table>
            <thead><tr><th>{t('rd_role')}</th><th>{t('cc_zone')}</th><th>{t('cc_area')}</th><th>p+ (kN/m²)</th><th>p− (kN/m²)</th><th>n</th></tr></thead>
            <tbody>
              {d.cc.map((c) => (
                <tr key={`${c.role}${c.zone}`}><td>{t(`role_${c.role}`)}</td><td className="mono">{c.zone}</td><td className="mono">{c.A.toFixed(1)}</td><td className="mono">{c.pPos.toFixed(3)}</td><td className="mono">{c.pNeg.toFixed(3)}</td><td className="mono">{c.count}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="res-stat" style={{ marginTop: 10, marginBottom: 0 }}>{tc(code, 'cc_note')}</div>
        </div>
      )}
    </>
  )
}

function OptTables({ o }: { o: OptSummary }) {
  const code = useStore().built?.spec.code
  const f2 = (x: number) => x.toFixed(2)
  return (
    <div className="scard"><h3>{t('res_opt')}</h3>
      <div style={{ overflow: 'auto' }}>
        <table>
          <thead><tr><th>{t('rd_role')}</th><th>{t('op_before')}</th><th>{t('op_after')}</th><th>{t('rd_ratio')}</th><th>{t('op_gov')}</th><th>{t('op_tons')}</th></tr></thead>
          <tbody>
            {o.rows.map((r) => (
              <tr key={r.role}>
                <td>{t(`role_${r.role}`)}</td>
                <td className="mono" style={{ color: 'var(--muted)' }}>{r.before}</td>
                <td className="mono" style={r.after !== r.before ? { color: 'var(--txt-hi)', fontWeight: 700 } : undefined}>{r.after}</td>
                <td className="mono" style={{ color: ratioColor(r.ratio), fontWeight: 700 }}>{r.ratio.toFixed(3)}</td>
                <td style={{ color: 'var(--muted)' }}>{t(`op_gov_${r.governs}`)}</td>
                <td className="mono">{f2(r.tBefore)} → {f2(r.tAfter)}</td>
              </tr>
            ))}
            <tr><td colSpan={5}><b>{t('op_total')}</b></td><td className="mono"><b>{f2(o.weightBefore)} → {f2(o.weightAfter)}</b></td></tr>
          </tbody>
        </table>
      </div>
      <table style={{ marginTop: 10 }}>
        <thead><tr><th>{t('op_iter')}</th><th>{t('op_tons')}</th><th>{t('rd_ratio')}</th><th>{t('op_svc')}</th><th>{t('op_conn')}</th><th>NG</th></tr></thead>
        <tbody>
          {o.iters.map((x) => (
            <tr key={x.it}><td className="mono">{x.it}</td><td className="mono">{f2(x.weight)}</td>
              <td className="mono" style={{ color: ratioColor(x.maxRatio) }}>{x.maxRatio.toFixed(3)}</td>
              <td className="mono" style={{ color: ratioColor(x.svcMax) }}>{x.svcMax.toFixed(3)}</td>
              <td className="mono" style={{ color: ratioColor(x.connMax ?? 0) }}>{x.connMax?.toFixed(3) ?? '-'}</td><td className="mono">{x.ng + (x.connNg ?? 0)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="res-stat" style={{ marginTop: 10, marginBottom: 0 }}>{tc(code, 'opt_note')}</div>
    </div>
  )
}

function ConnTables({ cs }: { cs: ConnResult[] }) {
  return (
    <div className="scard"><h3>{t('res_conn')}</h3>
      {cs.map((c) => (
        <div key={c.type} style={{ marginBottom: 12 }}>
          <div className="kv"><span className="k"><b style={{ color: 'var(--txt-hi)' }}>{t(`cn_type_${c.type}`)}</b> · {c.combo}</span>
            <span className="v" style={{ color: ratioColor(c.ratio), fontWeight: 700 }}>{c.ratio.toFixed(3)} {(() => { const g = connGrade(c); return <GradeChip g={g.grade} reasons={g.reasons} /> })()}</span></div>
          {(() => {
            /* 보강 후 만족 — 최종값만 보이면 보강 과정이 가려지므로 원래 검토비와 보강 내용을 함께 (색 외에 문장으로) */
            const worst = c.checks.reduce((a, k) => (k.ratio > a.ratio ? k : a), c.checks[0])
            const fix = [c.dims.stiffener || c.notes.includes('stiffeners') ? t('cn_note_stiffeners') : '', c.notes.find((n) => n.startsWith('doubler')) ? t('cn_note_doubler') : ''].filter(Boolean).join(' · ')
            return fix && worst && worst.ratio > c.ratio + 1e-9 && c.ratio <= 1
              ? <div className="reinf-note" role="note">✓ {t('reinf_line', c.ratio.toFixed(3), t(`cn_${worst.item}` as I18nKey), worst.ratio.toFixed(3), fix)}</div>
              : null
          })()}
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', margin: '4px 0 6px' }}>
            {Object.values(c.dims).map(dimValue).join(' · ')}
            {c.notes.map((n) => <span key={n} style={{ color: 'var(--amber)' }}> · {n === 'gbFoundation' ? t('cn_note_foundation') : n === 'krFoundation' ? t('kr_note_foundation') : n === 'gbJointDetail' ? t('cn_note_joint') : n === 'gbBraceDetail' ? t('cn_note_brace') : n.startsWith('doubler') ? `${t('cn_note_doubler')} ${n.slice(8)}` : n === 'stiffeners' ? t('cn_note_stiffeners') : n === 'rotTest' ? t('cn_note_rot') : n}</span>)}
          </div>
          <table>
            <thead><tr><th>{t('sv_item')}</th><th>{t('cn_demand')}</th><th>{t('cn_capacity')}</th><th>{t('rd_ratio')}</th><th>{t('sv_clause')}</th></tr></thead>
            <tbody>
              {c.checks.map((k) => (
                <tr key={k.item}>
                  <td>{t(`cn_${k.item}` as I18nKey)}</td><td className="mono">{k.demand.toFixed(2)} {k.unit}</td><td className="mono">{k.capacity.toFixed(2)} {k.unit}</td>
                  {c.dims.stiffener && k.item === 'flangeBend'
                    ? <td style={{ color: 'var(--muted)' }}>{k.ratio.toFixed(3)} → {t('cn_stiffener')}</td>
                    : <td className="mono" style={{ color: ratioColor(k.ratio), fontWeight: 700 }}>{k.ratio.toFixed(3)}</td>}
                  <td style={{ color: 'var(--muted)' }}>{k.clause}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function ResultsPanel() {
  const s = useStore()
  if (!s.reactions?.length && !s.design) return <div className="res-empty">{t('res_empty')}</div>
  return (
    <div>
      <StaleBanner />
      {s.built && (
        <div className="confirm-row" style={{ marginTop: 0, marginBottom: 12 }}>
          <button className="btn btn-c" onClick={() => selectTask('outputs')}>{t('flow_outputs')}</button>
        </div>
      )}
      <SummaryCards />
      {s.built && (s.design || !!s.connections?.length) && <StatusCard d={s.design} cs={s.connections} spec={s.built.spec} />}
      {s.opt && <OptTables o={s.opt} />}
      {s.design && <DesignTables d={s.design} />}
      {s.design && <MemberTable d={s.design} />}
      {!!s.connections?.length && <ConnTables cs={s.connections} />}
      {!!s.reactions?.length && (
        <div className="scard"><h3>{t('res_react')}</h3>
          <table>
            <thead><tr><th>{t('res_lc')}</th><th>FX (kN)</th><th>FY (kN)</th><th>FZ (kN)</th></tr></thead>
            <tbody>
              {s.reactions.map((r) => (
                <tr key={r.lc}><td className="mono">{r.lc}</td><td className="mono">{f3(r.fx)}</td><td className="mono">{f3(r.fy)}</td><td className="mono">{f3(r.fz)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
