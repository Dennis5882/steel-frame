/* 다층 강골조 모델링 7단계 — 轴网 → 楼层 → 材料与截面 → 支撑布置 → 楼面荷载 → 风与地震 → 最终确认.
   입력은 F.draft 를 직접 고친다(editDraft). 숫자 칸은 입력 중 문자열을 따로 들고 있다가 유효할 때만 반영. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Plus, Send, Trash2 } from 'lucide-react'
import { t, type I18nKey } from '../../i18n'
import { useStore } from '../../state/store'
import { F, FRAME_STEPS, REVIEW_STEP, draftModel, draftPayloads, editDraft, goStep } from '../../frame/state'
import { frameSectionNames } from '../../frame/sections'
import { ALPHA_MAX, SFI, gravityTotals, tgOf } from '../../frame/loads'
import type { Axis, CnSeismicSpec, FrameSpec } from '../../frame/types'
import { buildFrameModel } from '../../actions/frame'
import { NumericInput } from '../NumericInput'
import { FramePlan } from './FramePlan'
import { PLAN_SHAPES, SHAPE_MIN, applyShape, braceBays, coordsOf, deleteSpan, formatSpans, insertSpan, parseSpans, planConnected, setGrid, setPanelState, shapeFits, shapeRemoved, spansOf, toggleBrace, type PlanShape } from '../../frame/plan'

const r6 = (v: number) => +v.toFixed(6)

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
/** 한 방향 격자 — 먼저 等跨 / 不等跨 를 고르고, 等跨 = [−] 개수 [+] × 간격, 不等跨 = 스팬 목록("6, 6, 8" / 줄임 "2@6, 8") */
function AxisRow({ axis, coords, onChange, disabled }: { axis: Axis; coords: number[]; onChange(c: number[]): void; disabled?: boolean }) {
  const sp = spansOf(coords), uniform = sp.every((v) => v === sp[0]) ? sp[0] : null
  const [mode, setMode] = useState<'equal' | 'unequal'>(uniform === null ? 'unequal' : 'equal')
  /* 스팬이 다른 곳(평면 치수 편집·삽입·템플릿)에서 부등간격이 되면 부등간격으로 — 등간격 입력이 스팬을 한 값으로 덮지 않게 */
  useEffect(() => { if (uniform === null) setMode('unequal') }, [uniform])
  const text = formatSpans(sp)
  const [raw, setRaw] = useState(text)
  useEffect(() => { setRaw((r) => formatSpans(parseSpans(r) ?? []) === text ? r : text) }, [text])
  const [gap, setGap] = useState(String(uniform ?? sp[0]))
  useEffect(() => { if (uniform !== null) setGap((g) => Number(g) === uniform ? g : String(uniform)) }, [uniform])
  const ok = parseSpans(raw)
  const total = r6(sp.reduce((x, y) => x + y, 0))
  const setCount = (nc: number) => { if (nc < 1 || nc > 60) return; const L = Number(gap) > 0 ? Number(gap) : sp[0]; onChange(coordsOf(Array(nc).fill(L), coords[0])) }
  const toEqual = () => { setMode('equal'); if (uniform === null) { setGap(String(sp[0])); onChange(coordsOf(Array(sp.length).fill(sp[0]), coords[0])) } }
  return <div className="fr-axis-row">
    <b title={axis === 'X' ? t('fr_spans_x') : t('fr_spans_y')}>{axis}</b>
    <div className="fr-seg" role="radiogroup" aria-label={axis === 'X' ? t('fr_dir_x') : t('fr_dir_y')}>
      <button type="button" role="radio" aria-checked={mode === 'equal'} disabled={disabled} onClick={toEqual}>{t('fr_mode_equal')}</button>
      <button type="button" role="radio" aria-checked={mode === 'unequal'} disabled={disabled} onClick={() => setMode('unequal')}>{t('fr_mode_unequal')}</button>
    </div>
    {mode === 'equal' ? <div className="fr-axis-in">
      <span className="fr-step"><button type="button" disabled={disabled || sp.length <= 1} aria-label={t('fr_span_less')} onClick={() => setCount(sp.length - 1)}>−</button><span>{sp.length}</span>
        <button type="button" disabled={disabled} aria-label={t('fr_span_more')} onClick={() => setCount(sp.length + 1)}>+</button></span>
      <span className="fr-unit">{t('fr_spans_unit')} ×</span>
      <div className="pe-in fr-gap"><NumericInput value={gap} step={0.5} min={0.5} disabled={disabled} aria-label={t('fr_uniform')}
        onValueChange={(v) => { setGap(v); const L = Number(v); if (L > 0) onChange(coordsOf(Array(sp.length).fill(L), coords[0])) }} /><span className="pe-u">m</span></div>
      <span className="fr-total">= {total} m</span>
    </div> : <div className="fr-axis-in">
      <div className="pe-in fr-list"><input className="pe-numeric-list" value={raw} disabled={disabled} placeholder="6, 6, 8 · 2@6, 8" aria-label={axis === 'X' ? t('fr_spans_x') : t('fr_spans_y')} aria-invalid={!ok || undefined}
        onChange={(e) => { setRaw(e.target.value); const v = parseSpans(e.target.value); if (v) onChange(coordsOf(v, coords[0])) }} /><span className="pe-u">m</span></div>
      <span className="fr-total">{ok ? `${ok.length} ${t('fr_spans_unit')} = ${r6(ok.reduce((x, y) => x + y, 0))} m` : t('fr_list_bad')}</span>
    </div>}
  </div>
}

function Sel<T extends string | number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: [T, string][]; onChange(v: T): void; disabled?: boolean }) {
  return <label className="pe-f"><span>{label}</span><div className="pe-in">
    <select value={String(value)} disabled={disabled} onChange={(e) => { const o = options.find(([k]) => String(k) === e.target.value); if (o) onChange(o[0]) }}>
      {options.map(([k, l]) => <option key={String(k)} value={String(k)}>{l}</option>)}</select></div></label>
}

const Group = ({ title, children }: { title: I18nKey; children: ReactNode }) => <section className="mw-group"><h4>{t(title)}</h4><div className="pe-grid">{children}</div></section>



/** 형상 아이콘 — 4×3 칸 미리보기 */
function ShapeIcon({ shape }: { shape: PlanShape }) {
  const n = shape === 'E' ? 3 : 4, m = shape === 'E' ? 5 : shape === 'cross' || shape === 'court' ? 3 : 3
  const off = new Set(shapeRemoved(shape, n, m).map(([i, j]) => `${i},${j}`)), w = 34 / n, h = 26 / m
  return <svg viewBox="0 0 34 26" aria-hidden="true">{Array.from({ length: n * m }, (_, k) => { const i = k % n, j = Math.floor(k / n)
    return <rect key={k} x={i * w + 0.5} y={26 - (j + 1) * h + 0.5} width={w - 1} height={h - 1} fill={off.has(`${i},${j}`) ? 'none' : 'var(--cyan)'} stroke="var(--border)" strokeWidth=".6" /> })}</svg>
}

function GridStep({ spec, off }: { spec: FrameSpec; off: boolean }) {
  const n = spec.xs.length - 1, m = spec.ys.length - 1
  const { model } = draftModel(spec)
  const connected = planConnected(spec)
  const [tool, setTool] = useState<'cell' | 'tri'>('cell')
  const [sel, setSel] = useState<{ axis: Axis; at: number } | null>(null)
  const arr = (s: FrameSpec, a: Axis) => (a === 'X' ? s.xs : s.ys)
  const selLen = sel ? arr(spec, sel.axis)[sel.at + 1] - arr(spec, sel.axis)[sel.at] : 0
  useEffect(() => { if (sel && sel.at >= (sel.axis === 'X' ? n : m)) setSel(null) }, [n, m])
  const label = (axis: Axis, at: number) => axis === 'X' ? `${t('fr_dir_x')} ${at + 1}–${at + 2}` : `${t('fr_dir_y')} ${String.fromCharCode(65 + at)}–${String.fromCharCode(66 + at)}`
  const setLen = (v: number) => editDraft((s) => {
    if (!sel) return
    const sp = spansOf(arr(s, sel.axis)); sp[sel.at] = v
    const c = coordsOf(sp, arr(s, sel.axis)[0])
    setGrid(s, sel.axis === 'X' ? c : s.xs, sel.axis === 'Y' ? c : s.ys)
  })
  return <>
    <section className="mw-group"><h4>{t('fr_grid')}</h4>
      <div className="fr-axes">
        <AxisRow axis="X" coords={spec.xs} disabled={off} onChange={(c) => editDraft((s) => setGrid(s, c, s.ys))} />
        <AxisRow axis="Y" coords={spec.ys} disabled={off} onChange={(c) => editDraft((s) => setGrid(s, s.xs, c))} />
      </div>
      <p className="mw-note">{t('fr_grid_hint')}</p>
    </section>
    <section className="mw-group"><h4>{t('fr_shape')}</h4>
      <div className="fr-shapes" role="group" aria-label={t('fr_shape')}>{PLAN_SHAPES.map((sh) => {
        const fits = shapeFits(sh, n, m)
        return <button key={sh} type="button" disabled={off || !fits} title={fits ? t(`fr_shape_${sh}`) : t('fr_shape_min', SHAPE_MIN[sh][0], SHAPE_MIN[sh][1])}
          onClick={() => editDraft((s) => applyShape(s, sh))}><ShapeIcon shape={sh} /><span>{t(`fr_shape_${sh}`)}</span></button>
      })}</div>
      <div className="fr-tools" role="group" aria-label={t('fr_tool')}>
        <button type="button" aria-pressed={tool === 'cell'} onClick={() => setTool('cell')}>▦ {t('fr_tool_cell')}</button>
        <button type="button" aria-pressed={tool === 'tri'} onClick={() => setTool('tri')}>◩ {t('fr_tool_tri')}</button>
      </div>
      <p className="mw-note">{t(tool === 'cell' ? 'fr_cells_hint' : 'fr_tri_hint')}</p>
      <FramePlan spec={spec} mode="cells" tool={tool} disabled={off} selectedSpan={sel} onSpan={(axis, at) => setSel(sel?.axis === axis && sel.at === at ? null : { axis, at })}
        onCell={(i, j, st) => editDraft((s) => setPanelState(s, i, j, st))} />
      {sel && <div className="fr-spanbar"><b>{label(sel.axis, sel.at)}</b>
        <div className="pe-in"><NumCell value={selLen} disabled={off} onChange={setLen} /><span className="pe-u">m</span></div>
        <button type="button" className="btn btn-ghost" disabled={off} onClick={() => editDraft((s) => insertSpan(s, sel.axis, sel.at, selLen))}>{t(sel.axis === 'X' ? 'fr_insert_left' : 'fr_insert_below')}</button>
        <button type="button" className="btn btn-ghost" disabled={off} onClick={() => { editDraft((s) => insertSpan(s, sel.axis, sel.at + 1, selLen)); setSel({ ...sel, at: sel.at + 1 }) }}>{t(sel.axis === 'X' ? 'fr_insert_right' : 'fr_insert_above')}</button>
        <button type="button" className="btn btn-ghost" disabled={off || (sel.axis === 'X' ? n : m) <= 1} onClick={() => { editDraft((s) => deleteSpan(s, sel.axis, sel.at)); setSel(null) }}><Trash2 size={13} />{t('fr_delete_span')}</button>
      </div>}
      <div className="fr-plan-stat"><span>{t('fr_panels')} <b>{n * m - spec.removed.length} / {n * m}</b></span>{(spec.cuts?.length ?? 0) > 0 && <span>{t('fr_tool_tri')} <b>{spec.cuts!.length}</b></span>}{model && <span>{t('fr_area_story')} <b>{model.floorArea} m²</b></span>}{model && <span>{t('fr_columns_per_story')} <b>{model.supports.length}</b></span>}</div>
      {!connected && <p className="mw-error" role="alert">{t('fr_plan_disconnected')}</p>}
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
  const bays = braceBays(spec)
  const cnt = (a: Axis) => bays.filter((b) => b.axis === a).length
  return <>
    <section className="mw-group"><h4>{t('fr_brace_bays')}</h4>
      <p className="mw-note">{t('fr_brace_click_hint')}</p>
      <FramePlan spec={spec} mode="edges" disabled={off} onEdge={(a, i, j) => editDraft((s) => toggleBrace(s, a, i, j))} />
      <div className="fr-plan-stat"><span>{t('fr_dir_x')} <b>{cnt('X')}</b></span><span>{t('fr_dir_y')} <b>{cnt('Y')}</b></span><span>{t('fr_brace_members', bays.length * 2 * spec.heights.length)}</span>
        {bays.length > 0 && <button type="button" className="btn btn-ghost" disabled={off} onClick={() => editDraft((s) => { s.braces = [] })}><Trash2 size={13} />{t('fr_brace_clear')}</button>}</div>
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
    <Group title="fr_snow">
      <Num label={t('fr_s0')} value={L.roofSnow} unit="kN/m²" step={0.05} disabled={off} onChange={set('roofSnow')} />
      <Num label={t('fr_snow_mu')} value={L.snowMu} step={0.1} max={3} disabled={off} onChange={set('snowMu')} />
    </Group>
    <div className="pe-tip">{L.roofSnow * L.snowMu > 0 ? t('fr_snow_tip', +(L.roofSnow * L.snowMu).toFixed(3), L.roofLive) : t('fr_snow_none')}</div>
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
      {row('fs_grid', `${spec.xs.length - 1} × ${spec.ys.length - 1} · ${spec.xs.at(-1)! - spec.xs[0]} × ${spec.ys.at(-1)! - spec.ys[0]} m${spec.removed.length ? ` · ${t('fr_panels')} ${(spec.xs.length - 1) * (spec.ys.length - 1) - spec.removed.length}/${(spec.xs.length - 1) * (spec.ys.length - 1)}` : ''}`, 0)}
      {row('fs_stories', `${spec.heights.length} · ${spec.heights.join(' / ')} m · ${t('fr_baseZ')} ${spec.baseZ} m`, 1)}
      {row('fs_sections', `${spec.material} · ${spec.sections.beam} / ${spec.sections.column} / ${spec.sections.brace}`, 2)}
      {row('fs_braces', spec.braces.length ? `${spec.braces.length} · X ${t(spec.design.braced.X ? 'fr_nosway' : 'fr_sway')} · Y ${t(spec.design.braced.Y ? 'fr_nosway' : 'fr_sway')}` : t('fr_no_braces'), 3)}
      {row('fs_loads', `DL ${spec.loads.floorDead}/${spec.loads.roofDead} · LL ${spec.loads.floorLive}/${spec.loads.roofLive}${spec.loads.roofSnow > 0 ? ` · S ${+(spec.loads.roofSnow * spec.loads.snowMu).toFixed(3)}` : ''} kN/m² · ${spec.loads.edgeFloor}/${spec.loads.edgeRoof} kN/m`, 4)}
      {row('fs_lateral', `w₀ ${spec.wind.w0} · ${spec.wind.terrain} · ${spec.seismic.intensity.split('_')[0]}${t('fr_degree')} ${SFI[spec.seismic.intensity]} · ${t('fr_group_n', spec.seismic.group)} · ${spec.seismic.site} · ${t('fr_grade_n', spec.design.seismicGrade)}`, 5)}
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
      {step === 0 && <GridStep spec={spec} off={off} />}
      {step === 1 && <StoriesStep spec={spec} off={off} />}
      {step === 2 && <SectionsStep spec={spec} off={off} />}
      {step === 3 && <BracesStep spec={spec} off={off} />}
      {step === 4 && <LoadsStep spec={spec} off={off} />}
      {step === 5 && <LateralStep spec={spec} off={off} />}
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
