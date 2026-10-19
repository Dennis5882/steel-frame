/* 다층 강골조 모델링 8단계 — 开始 → 轴网 → 楼层 → 材料与截面 → 支撑布置 → 楼面荷载 → 风与地震 → 最终确认.
   입력은 F.draft 를 직접 고친다(editDraft). 숫자 칸은 입력 중 문자열을 따로 들고 있다가 유효할 때만 반영. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Plus, Send, Trash2 } from 'lucide-react'
import { t, type I18nKey } from '../../i18n'
import { useStore } from '../../state/store'
import { F, FRAME_STEPS, REVIEW_STEP, draftModel, draftPayloads, editDraft, goStep, startTemplate } from '../../frame/state'
import { FRAME_TEMPLATES, FRAME_TEMPLATE_KEYS, type FrameTemplateKey } from '../../frame/templates'
import { frameSectionNames } from '../../frame/sections'
import { ALPHA_MAX, SFI, gravityTotals, tgOf } from '../../frame/loads'
import type { Axis, CnSeismicSpec, FrameSpec } from '../../frame/types'
import { buildFrameModel } from '../../actions/frame'
import { NumericInput } from '../NumericInput'
import { FramePlan, gridLabelX, gridLabelY } from './FramePlan'

const r6 = (v: number) => +v.toFixed(6)
const spansOf = (a: number[]) => a.slice(1).map((v, i) => r6(v - a[i]))
const coordsOf = (spans: number[]) => spans.reduce<number[]>((acc, s) => [...acc, r6(acc.at(-1)! + s)], [0])

/** 숫자 칸 — 유효하지 않은 입력은 표시만 하고 스펙은 그대로 */
function Num({ label, value, unit, step = 0.1, min = 0, max, onChange, disabled }: { label: string; value: number; unit?: string; step?: number; min?: number; max?: number; onChange(v: number): void; disabled?: boolean }) {
  const [raw, setRaw] = useState(String(value))
  const last = useRef(value)
  useEffect(() => { if (value !== last.current) { last.current = value; setRaw(String(value)) } }, [value])
  const v = Number(raw), bad = !raw.trim() || !Number.isFinite(v) || v < min || (max !== undefined && v > max)
  return <label className="pe-f"><span>{label}</span><div className="pe-in">
    <NumericInput value={raw} step={step} min={min} disabled={disabled} aria-invalid={bad || undefined}
      onValueChange={(s) => { setRaw(s); const n = Number(s); if (s.trim() && Number.isFinite(n) && n >= min && (max === undefined || n <= max)) { last.current = n; onChange(n) } }} />
    {unit && <span className="pe-u">{unit}</span>}</div>
    {bad && <small className="mw-error">{t('fr_num_error')}</small>}</label>
}

/** 스팬 목록 칸 — "6, 6, 6" (쉼표·공백 구분) */
function SpanList({ label, coords, onChange, disabled }: { label: string; coords: number[]; onChange(c: number[]): void; disabled?: boolean }) {
  const text = spansOf(coords).join(', ')
  const [raw, setRaw] = useState(text)
  useEffect(() => { setRaw((r) => parse(r)?.join(', ') === text ? r : text) }, [text])
  function parse(s: string): number[] | null {
    const v = s.split(/[,\s]+/).filter(Boolean).map(Number)
    return v.length && v.every((x) => Number.isFinite(x) && x > 0) ? v : null
  }
  const ok = parse(raw)
  return <label className="pe-f pe-full"><span>{label}</span><div className="pe-in">
    <input className="pe-numeric-list" value={raw} disabled={disabled} inputMode="decimal" aria-invalid={!ok || undefined}
      onChange={(e) => { setRaw(e.target.value); const p = parse(e.target.value); if (p) onChange(coordsOf(p)) }} /><span className="pe-u">m</span></div>
    <small className={ok ? 'pe-hint' : 'mw-error'}>{ok ? t('fr_span_hint', ok.length, r6(ok.reduce((a, b) => a + b, 0))) : t('fr_list_error')}</small></label>
}

function Sel<T extends string | number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: [T, string][]; onChange(v: T): void; disabled?: boolean }) {
  return <label className="pe-f"><span>{label}</span><div className="pe-in">
    <select value={String(value)} disabled={disabled} onChange={(e) => { const o = options.find(([k]) => String(k) === e.target.value); if (o) onChange(o[0]) }}>
      {options.map(([k, l]) => <option key={String(k)} value={String(k)}>{l}</option>)}</select></div></label>
}

const Group = ({ title, children }: { title: I18nKey; children: ReactNode }) => <section className="mw-group"><h4>{t(title)}</h4><div className="pe-grid">{children}</div></section>

function templateFacts(spec: FrameSpec) {
  const m = draftModel(spec).model
  return { bays: `${spec.xs.length - 1} × ${spec.ys.length - 1}`, stories: spec.heights.length, area: m ? m.floorArea : 0, braces: spec.braces.length }
}

export function TemplatePicker({ onPick, disabled }: { onPick(k: FrameTemplateKey): void; disabled?: boolean }) {
  return <div className="ws-template-grid">{FRAME_TEMPLATE_KEYS.map((key) => {
    const f = templateFacts(FRAME_TEMPLATES[key].spec)
    return <button className="ws-template" key={key} disabled={disabled} aria-pressed={F.tpl === key} onClick={() => onPick(key)}>
      <strong>{t(`fr_tpl_${key}`)}</strong>
      <span className="ws-template-specs">
        <span><small>{t('fr_bays')}</small><span>{f.bays}</span></span>
        <span><small>{t('fr_stories')}</small><span>{f.stories}</span></span>
        <span><small>{t('fr_area_story')}</small><span>{f.area}<small>m²</small></span></span>
      </span>
      <span className="ws-template-meta"><span>{t(`fr_tpl_${key}_hint`)}</span></span>
    </button>
  })}</div>
}

function GridStep({ spec, off }: { spec: FrameSpec; off: boolean }) {
  const xo = spec.xs.map((x, i): [number, string] => [x, `${gridLabelX(i)} (${x} m)`]), yo = spec.ys.map((y, j): [number, string] => [y, `${gridLabelY(j)} (${y} m)`])
  return <>
    <FramePlan spec={spec} />
    <Group title="fr_grid">
      <SpanList label={t('fr_spans_x')} coords={spec.xs} disabled={off} onChange={(c) => editDraft((s) => { s.xs = c })} />
      <SpanList label={t('fr_spans_y')} coords={spec.ys} disabled={off} onChange={(c) => editDraft((s) => { s.ys = c })} />
    </Group>
    <section className="mw-group"><h4>{t('fr_voids')}</h4>
      <p className="mw-note">{t('fr_voids_hint')}</p>
      {spec.voids.map((v, i) => <div className="pe-grid fr-row" key={i}>
        <Sel label="X₀" value={v.x0} options={xo} disabled={off} onChange={(x) => editDraft((s) => { s.voids[i].x0 = x })} />
        <Sel label="X₁" value={v.x1} options={xo} disabled={off} onChange={(x) => editDraft((s) => { s.voids[i].x1 = x })} />
        <Sel label="Y₀" value={v.y0} options={yo} disabled={off} onChange={(y) => editDraft((s) => { s.voids[i].y0 = y })} />
        <Sel label="Y₁" value={v.y1} options={yo} disabled={off} onChange={(y) => editDraft((s) => { s.voids[i].y1 = y })} />
        <button type="button" className="btn btn-ghost fr-del" disabled={off} aria-label={t('fr_remove')} onClick={() => editDraft((s) => { s.voids.splice(i, 1) })}><Trash2 size={14} /></button>
      </div>)}
      <button type="button" className="btn btn-ghost" disabled={off} onClick={() => editDraft((s) => { s.voids.push({ x0: s.xs[0], x1: s.xs[1], y0: s.ys[0], y1: s.ys[1] }) })}><Plus size={14} />{t('fr_add_void')}</button>
    </section>
  </>
}

function StoriesStep({ spec, off }: { spec: FrameSpec; off: boolean }) {
  const ns = spec.heights.length
  return <>
    <Group title="fr_levels"><Num label={t('fr_baseZ')} value={spec.baseZ} unit="m" min={-100} disabled={off} onChange={(v) => editDraft((s) => { s.baseZ = v })} /></Group>
    <section className="mw-group"><h4>{t('fr_story_table')}</h4>
      <table className="fr-table"><thead><tr><th>{t('fr_story_name')}</th><th>{t('fr_story_h')}</th><th>{t('fr_story_bottom')}</th><th /></tr></thead><tbody>
        {spec.heights.map((_, i) => ns - 1 - i).map((i) => <tr key={i}>
          <td><input value={spec.storyNames[i]} disabled={off} aria-label={t('fr_story_name')} onChange={(e) => editDraft((s) => { s.storyNames[i] = e.target.value })} /></td>
          <td><NumCell value={spec.heights[i]} disabled={off} onChange={(v) => editDraft((s) => { s.heights[i] = v })} /></td>
          <td>{r6(spec.baseZ + spec.heights.slice(0, i).reduce((a, b) => a + b, 0))} m</td>
          <td>{i === ns - 1 && ns > 1 && <button type="button" className="btn btn-ghost fr-del" disabled={off} aria-label={t('fr_remove')} onClick={() => editDraft((s) => { s.heights.pop(); s.storyNames.splice(ns - 1, 1) })}><Trash2 size={14} /></button>}</td>
        </tr>)}
        <tr><td><input value={spec.storyNames[ns]} disabled={off} aria-label={t('fr_roof_name')} onChange={(e) => editDraft((s) => { s.storyNames[ns] = e.target.value })} /></td><td>{t('fr_roof')}</td><td>{r6(spec.baseZ + spec.heights.reduce((a, b) => a + b, 0))} m</td><td /></tr>
      </tbody></table>
      <button type="button" className="btn btn-ghost" disabled={off} onClick={() => editDraft((s) => { s.heights.push(s.heights.at(-1)!); s.storyNames.splice(s.heights.length - 1, 0, `${s.heights.length}F`) })}><Plus size={14} />{t('fr_add_story')}</button>
      <p className="mw-note">{t('fr_story_note')}</p>
    </section>
  </>
}

function NumCell({ value, onChange, disabled }: { value: number; onChange(v: number): void; disabled?: boolean }) {
  const [raw, setRaw] = useState(String(value))
  useEffect(() => { setRaw((r) => Number(r) === value ? r : String(value)) }, [value])
  return <NumericInput value={raw} step={0.1} min={0.1} disabled={disabled} aria-label={t('fr_story_h')} aria-invalid={!(Number(raw) > 0) || undefined}
    onValueChange={(s) => { setRaw(s); const n = Number(s); if (n > 0) onChange(n) }} />
}

function SectionsStep({ spec, off }: { spec: FrameSpec; off: boolean }) {
  const names = useMemo(() => frameSectionNames().map((n): [string, string] => [n, n]), [])
  return <>
    <Group title="fr_material"><Sel label={t('fr_grade')} value={spec.material} disabled={off} options={[['Q235B', 'Q235B'], ['Q355B', 'Q355B']]} onChange={(v) => editDraft((s) => { s.material = v })} /></Group>
    <Group title="fr_sections">
      {(['beam', 'column', 'brace'] as const).map((r) => <Sel key={r} label={t(`fr_role_${r}`)} value={spec.sections[r]} options={names} disabled={off} onChange={(v) => editDraft((s) => { s.sections[r] = v })} />)}
    </Group>
    <p className="mw-note">{t('fr_sections_note')}</p>
  </>
}

function BracesStep({ spec, off }: { spec: FrameSpec; off: boolean }) {
  const [hi, setHi] = useState<number | undefined>()
  const coord = (axis: Axis) => axis === 'X' ? spec.xs.map((x, i): [number, string] => [x, `${gridLabelX(i)} (${x} m)`]) : spec.ys.map((y, j): [number, string] => [y, `${gridLabelY(j)} (${y} m)`])
  const other = (axis: Axis): Axis => axis === 'X' ? 'Y' : 'X'
  return <>
    <FramePlan spec={spec} highlight={hi} />
    <section className="mw-group"><h4>{t('fr_brace_bays')}</h4>
      <p className="mw-note">{t('fr_brace_hint')}</p>
      {spec.braces.map((b, i) => <div className="pe-grid fr-row" key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(undefined)} onFocus={() => setHi(i)}>
        <Sel label={t('fr_brace_dir')} value={b.axis} disabled={off} options={[['X', t('fr_dir_x')], ['Y', t('fr_dir_y')]]}
          onChange={(a) => editDraft((s) => { const c = a === 'X' ? s.xs : s.ys, l = a === 'X' ? s.ys : s.xs; s.braces[i] = { axis: a, line: l[0], a: c[0], b: c[1], type: 'chevron' } })} />
        <Sel label={t('fr_brace_line')} value={b.line} disabled={off} options={coord(other(b.axis))} onChange={(v) => editDraft((s) => { s.braces[i].line = v })} />
        <Sel label={t('fr_brace_from')} value={b.a} disabled={off} options={coord(b.axis)} onChange={(v) => editDraft((s) => { s.braces[i].a = v })} />
        <Sel label={t('fr_brace_to')} value={b.b} disabled={off} options={coord(b.axis)} onChange={(v) => editDraft((s) => { s.braces[i].b = v })} />
        <button type="button" className="btn btn-ghost fr-del" disabled={off} aria-label={t('fr_remove')} onClick={() => editDraft((s) => { s.braces.splice(i, 1) })}><Trash2 size={14} /></button>
      </div>)}
      <button type="button" className="btn btn-ghost" disabled={off} onClick={() => editDraft((s) => { s.braces.push({ axis: 'X', line: s.ys[0], a: s.xs[0], b: s.xs[1], type: 'chevron' }) })}><Plus size={14} />{t('fr_add_brace')}</button>
    </section>
    <div className="pe-tip">{t('fr_sway_x', t(spec.design.braced.X ? 'fr_nosway' : 'fr_sway'))} · {t('fr_sway_y', t(spec.design.braced.Y ? 'fr_nosway' : 'fr_sway'))}</div>
  </>
}

function LoadsStep({ spec, off }: { spec: FrameSpec; off: boolean }) {
  const L = spec.loads, set = (k: keyof FrameSpec['loads']) => (v: number) => editDraft((s) => { s.loads[k] = v })
  return <>
    <Group title="fr_floor_loads">
      <Num label={t('fr_floor_dead')} value={L.floorDead} unit="kN/m²" disabled={off} onChange={set('floorDead')} />
      <Num label={t('fr_floor_live')} value={L.floorLive} unit="kN/m²" disabled={off} onChange={set('floorLive')} />
      <Num label={t('fr_roof_dead')} value={L.roofDead} unit="kN/m²" disabled={off} onChange={set('roofDead')} />
      <Num label={t('fr_roof_live')} value={L.roofLive} unit="kN/m²" disabled={off} onChange={set('roofLive')} />
    </Group>
    <Group title="fr_edge_loads">
      <Num label={t('fr_edge_floor')} value={L.edgeFloor} unit="kN/m" disabled={off} onChange={set('edgeFloor')} />
      <Num label={t('fr_edge_roof')} value={L.edgeRoof} unit="kN/m" disabled={off} onChange={set('edgeRoof')} />
    </Group>
    <p className="mw-note">{t('fr_loads_note')}</p>
  </>
}

function LateralStep({ spec, off }: { spec: FrameSpec; off: boolean }) {
  const W = spec.wind, E = spec.seismic, D = spec.design
  const P = useMemo(() => { const m = draftModel(spec).model; return m ? draftPayloads(spec, m) : null }, [spec, JSON.stringify(spec)])
  return <>
    <Group title="fr_wind">
      <Num label={t('fr_w0')} value={W.w0} unit="kN/m²" step={0.05} disabled={off} onChange={(v) => editDraft((s) => { s.wind.w0 = v })} />
      <Sel label={t('fr_terrain')} value={W.terrain} disabled={off} options={(['A', 'B', 'C', 'D'] as const).map((k): [typeof k, string] => [k, k])} onChange={(v) => editDraft((s) => { s.wind.terrain = v })} />
      <Num label={t('fr_mu_windward')} value={W.muWindward} step={0.1} disabled={off} onChange={(v) => editDraft((s) => { s.wind.muWindward = v })} />
      <Num label={t('fr_mu_leeward')} value={W.muLeeward} step={0.1} min={-5} max={0} disabled={off} onChange={(v) => editDraft((s) => { s.wind.muLeeward = v })} />
      <Num label={t('fr_wind_damping')} value={W.damping} step={0.005} max={0.2} disabled={off} onChange={(v) => editDraft((s) => { s.wind.damping = v })} />
    </Group>
    {P && <div className="pe-tip">{P.wind.map((w) => t('fr_wind_tip', w.dir, w.T1.toFixed(3), w.base.toFixed(1))).join(' · ')}</div>}
    <Group title="fr_seismic">
      <Sel label={t('fr_intensity')} value={E.intensity} disabled={off} options={(Object.keys(ALPHA_MAX) as CnSeismicSpec['intensity'][]).map((k): [typeof k, string] => [k, `${k.split('_')[0]}${t('fr_degree')} (${SFI[k]})`])} onChange={(v) => editDraft((s) => { s.seismic.intensity = v })} />
      <Sel label={t('fr_group')} value={E.group} disabled={off} options={([1, 2, 3] as const).map((g): [typeof g, string] => [g, t('fr_group_n', g)])} onChange={(v) => editDraft((s) => { s.seismic.group = v })} />
      <Sel label={t('fr_site')} value={E.site} disabled={off} options={(['I0', 'I1', 'II', 'III', 'IV'] as const).map((k): [typeof k, string] => [k, k.replace('I0', 'I₀').replace('I1', 'I₁')])} onChange={(v) => editDraft((s) => { s.seismic.site = v })} />
      <Num label={t('fr_seis_damping')} value={E.damping} step={0.005} max={0.2} disabled={off} onChange={(v) => editDraft((s) => { s.seismic.damping = v })} />
      <Num label={t('fr_live_mass')} value={E.liveMassFactor} step={0.1} max={1} disabled={off} onChange={(v) => editDraft((s) => { s.seismic.liveMassFactor = v })} />
      <Num label={t('fr_modes')} value={E.modes} step={1} min={1} max={60} disabled={off} onChange={(v) => editDraft((s) => { s.seismic.modes = Math.round(v) })} />
      <label className="pe-f fr-check"><input type="checkbox" checked={E.accidentalEccentricity} disabled={off} onChange={(e) => editDraft((s) => { s.seismic.accidentalEccentricity = e.target.checked })} /><span>{t('fr_acc_ecc')}</span></label>
    </Group>
    <div className="pe-tip">{t('fr_spectrum_tip', ALPHA_MAX[E.intensity], tgOf(E))}</div>
    <Group title="fr_design">
      <Sel label={t('fr_seis_grade')} value={D.seismicGrade} disabled={off} options={([1, 2, 3, 4] as const).map((g): [typeof g, string] => [g, t('fr_grade_n', g)])} onChange={(v) => editDraft((s) => { s.design.seismicGrade = v })} />
      <Num label={t('fr_net_area')} value={D.netAreaRatio} step={0.05} max={1} disabled={off} onChange={(v) => editDraft((s) => { s.design.netAreaRatio = v })} />
    </Group>
    <p className="mw-note">{t('fr_grade_note')}</p>
  </>
}

function ReviewStep({ spec, onEdit, off }: { spec: FrameSpec; onEdit(i: number): void; off: boolean }) {
  const { model, errors } = draftModel(spec)
  const P = model ? draftPayloads(spec, model) : null
  const g = model ? gravityTotals(spec, model) : null
  const row = (k: I18nKey, v: ReactNode, step: number) => <tr><th>{t(k)}</th><td>{v}</td><td><button type="button" className="btn btn-ghost" disabled={off} onClick={() => onEdit(step)}>{t('edit_btn')}</button></td></tr>
  return <>
    {errors.length > 0 && <div className="mw-error mw-alert" role="alert">{t('fr_model_error')}<ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
    {model && <div className="mw-metrics">
      <span>{t('st_node')}<b>{model.nodes.length}</b></span><span>{t('st_elem')}<b>{model.elements.length}</b></span>
      <span>{t('fr_supports')}<b>{model.supports.length}</b></span><span>{t('fr_area_story')}<b>{model.floorArea}<small> m²</small></b></span>
    </div>}
    <table className="fr-table fr-review"><tbody>
      {row('fs_grid', `${spec.xs.length - 1} × ${spec.ys.length - 1} · ${spec.xs.at(-1)! - spec.xs[0]} × ${spec.ys.at(-1)! - spec.ys[0]} m${spec.voids.length ? ` · ${t('fr_voids')} ${spec.voids.length}` : ''}`, 1)}
      {row('fs_stories', `${spec.heights.length} · ${spec.heights.join(' / ')} m · ${t('fr_baseZ')} ${spec.baseZ} m`, 2)}
      {row('fs_sections', `${spec.material} · ${spec.sections.beam} / ${spec.sections.column} / ${spec.sections.brace}`, 3)}
      {row('fs_braces', spec.braces.length ? `${spec.braces.length} · X ${t(spec.design.braced.X ? 'fr_nosway' : 'fr_sway')} · Y ${t(spec.design.braced.Y ? 'fr_nosway' : 'fr_sway')}` : t('fr_no_braces'), 4)}
      {row('fs_loads', `DL ${spec.loads.floorDead}/${spec.loads.roofDead} · LL ${spec.loads.floorLive}/${spec.loads.roofLive} kN/m² · ${spec.loads.edgeFloor}/${spec.loads.edgeRoof} kN/m`, 5)}
      {row('fs_lateral', `w₀ ${spec.wind.w0} · ${spec.wind.terrain} · ${spec.seismic.intensity.split('_')[0]}${t('fr_degree')} ${SFI[spec.seismic.intensity]} · ${t('fr_group_n', spec.seismic.group)} · ${spec.seismic.site} · ${t('fr_grade_n', spec.design.seismicGrade)}`, 6)}
    </tbody></table>
    {g && P && <div className="pe-tip">{t('fr_totals', (g.dlExceptSelf).toFixed(0), g.ll.toFixed(0), P.wind[0].base.toFixed(1), P.wind[1].base.toFixed(1), P.combos.length)}</div>}
    <p className="mw-note">{t('fr_build_note')}</p>
  </>
}

export function FrameWizard({ onHome }: { onHome(): void }) {
  const s = useStore()
  const spec = F.draft!
  const step = F.step
  const off = s.busy
  const heading = useRef<HTMLHeadingElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => { if (content.current) content.current.scrollTop = 0; heading.current?.focus({ preventScroll: true }) }, [step])
  const { errors } = draftModel(spec)
  return <div className="model-wizard">
    <header className="mw-banner">
      <div className="mw-brand"><Building2 size={18} /><span>{t('mw_title')}</span>
        <span className="mw-code-info"><span className="mw-code">CN</span><span className="mw-code-label">{t('fr_code_label')}</span></span></div>
      <div className="mw-progress-text"><span>{t('mw_process')}</span><strong>{String(step + 1).padStart(2, '0')} / {String(FRAME_STEPS.length).padStart(2, '0')}</strong></div>
      <div className="mw-progress" role="progressbar" aria-label={t('mw_process')} aria-valuemin={1} aria-valuemax={FRAME_STEPS.length} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) / FRAME_STEPS.length * 100}%` }} /></div>
    </header>
    <nav className="mw-steps" aria-label={t('mw_process')}>{FRAME_STEPS.map((key, i) => <button key={key} type="button" disabled={off || i > F.visited} aria-current={i === step ? 'step' : undefined} onClick={() => goStep(i)} title={t(key)}>
      <span className={`mw-step-dot${i === step ? ' current' : i < F.visited ? ' done' : ''}`}>{i < F.visited && i !== step ? <Check size={12} /> : i + 1}</span><span>{t(key)}</span>
    </button>)}</nav>
    <div className="mw-content" ref={content}>
      <div className="mw-stage-heading"><span className="mw-eyebrow">{t('mw_step', step + 1)}</span><h3 tabIndex={-1} ref={heading}>{t(FRAME_STEPS[step])}</h3></div>
      {step === 0 && <><TemplatePicker disabled={off} onPick={(k) => startTemplate(k)} /><p className="mw-note">{t('fr_template_note')}</p></>}
      {step === 1 && <GridStep spec={spec} off={off} />}
      {step === 2 && <StoriesStep spec={spec} off={off} />}
      {step === 3 && <SectionsStep spec={spec} off={off} />}
      {step === 4 && <BracesStep spec={spec} off={off} />}
      {step === 5 && <LoadsStep spec={spec} off={off} />}
      {step === 6 && <LateralStep spec={spec} off={off} />}
      {step === REVIEW_STEP && <>{!errors.length && <div className="mw-ready"><CheckCircle2 size={18} />{t('mw_ready')}</div>}<ReviewStep spec={spec} off={off} onEdit={goStep} /></>}
    </div>
    <footer className="mw-footer">
      <div className="mw-footer-actions">
        <button className="btn btn-ghost" disabled={off} onClick={step ? () => goStep(step - 1) : onHome}>{step ? <ArrowLeft size={14} /> : null}{t(step ? 'mw_back' : 'ws_home')}</button>
        {step < REVIEW_STEP ? <button className="btn btn-c" disabled={off} onClick={() => goStep(step + 1)}>{t(step === REVIEW_STEP - 1 ? 'mw_to_review' : 'mw_next')}<ArrowRight size={14} /></button>
          : <button className="btn btn-c" disabled={off || errors.length > 0} onClick={() => void buildFrameModel()}><Send size={14} />{t('mw_build')}</button>}
      </div>
      <p>{t(off ? 'mw_locked' : 'fr_preview_note')}</p>
    </footer>
  </div>
}
