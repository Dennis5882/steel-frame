/* 평면도 DXF → 축망 가져오기 (轴网 단계). 엔진은 src/frame/cad (순수), 기준 문서 docs/cad-import.md.
   파일을 고르면 그때 엔진(dxf 라이브러리 포함)을 불러온다. 파일은 브라우저 안에서만 읽는다.
   흐름: 파일 → (평면이 여러 장이면) 평면 고르기 → 레이어·단위·축척 확인 → 미리보기에서 부분 축선 고르기 → [이 축망 사용] → 확인 창 → F.draft 의 xs·ys */
import { useMemo, useRef, useState } from 'react'
import { FileUp, X } from 'lucide-react'
import { t } from '../../i18n'
import { F, editDraft } from '../../frame/state'
import { confirmAction } from '../ConfirmDialog'
import type { AxisLine, AxisRegion, CadDrawing, GridImport, GridWarning } from '../../frame/cad'

type CadMod = typeof import('../../frame/cad')
interface Loaded { mod: CadMod; name: string; d: CadDrawing }

const UNITS: [number, string][] = [[1, 'mm'], [10, 'cm'], [1000, 'm']]
const SCALES = [1, 2, 2.5, 4, 5, 10]
const MAX_SPANS = 60
const keyOf = (a: AxisLine) => `${a.dir}:${a.pos.toFixed(1)}`
const spans = (c: number[]) => c.slice(1).map((v, i) => +(v - c[i]).toFixed(3))

function warningText(w: GridWarning, g: GridImport): string {
  switch (w) {
    case 'unit_guessed': return t('cad_w_unit_guessed', UNITS.find(([k]) => k === g.unitMm)?.[1] ?? `${g.unitMm} mm`)
    case 'scale_corrected': return t('cad_w_scale_corrected', g.scale?.factor ?? 1)
    case 'rotated': return t('cad_w_rotated', g.rotationDeg.toFixed(1))
    case 'diagonal_skipped': return t('cad_w_diagonal_skipped', g.skippedDiagonal)
    case 'partial_axes': return t('cad_w_partial_axes', g.axes.filter((a) => !a.main).length)
    default: return t(`cad_w_${w}`)
  }
}

/** 미리보기 — 주축 실선, 부분 축선 점선(눌러서 넣고 빼기), 축 번호 원 */
function AxisPreview({ g, picked, onToggle }: { g: GridImport; picked: Set<string>; onToggle(a: AxisLine): void }) {
  const xs = g.axes.filter((a) => a.dir === 'X'), ys = g.axes.filter((a) => a.dir === 'Y')
  const px = [...xs.map((a) => a.pos), ...ys.flatMap((a) => [a.from, a.to])], py = [...ys.map((a) => a.pos), ...xs.flatMap((a) => [a.from, a.to])]
  if (!px.length || !py.length) return null
  const minX = Math.min(...px), maxX = Math.max(...px), minY = Math.min(...py), maxY = Math.max(...py)
  const size = Math.max(maxX - minX, maxY - minY, 1), r = size * 0.022, pad = r * 4
  const vb = `${minX - pad} ${-maxY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`
  const cls = (a: AxisLine) => a.main ? 'cad-ax main' : picked.has(keyOf(a)) ? 'cad-ax picked' : 'cad-ax part'
  return <svg className="cad-preview" viewBox={vb} role="img" aria-label={t('cad_import')}>
    {g.axes.map((a) => {
      const [x1, y1, x2, y2] = a.dir === 'X' ? [a.pos, -a.from, a.pos, -a.to] : [a.from, -a.pos, a.to, -a.pos]
      const [bx, by] = a.dir === 'X' ? [a.pos, -a.to - r * 1.6] : [a.from - r * 1.6, -a.pos]
      return <g key={keyOf(a)} className={cls(a)}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
        {!a.main && <line className="cad-hit" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={r} onClick={() => onToggle(a)}><title>{a.label}</title></line>}
        <circle cx={bx} cy={by} r={r} vectorEffect="non-scaling-stroke" />
        <text x={bx} y={by} fontSize={r * (a.label.length > 2 ? 0.75 : 1.1)} textAnchor="middle" dominantBaseline="central">{a.label}</text>
      </g>
    })}
  </svg>
}

export function CadImport({ off }: { off: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [L, setL] = useState<Loaded | null>(null)
  const [region, setRegion] = useState(0)
  const [layers, setLayers] = useState<string[] | null>(null)
  const [unitMm, setUnitMm] = useState<number | undefined>()
  const [scale, setScale] = useState<number | undefined>()
  const [picked, setPicked] = useState<Set<string>>(new Set())

  async function open(f: File) {
    setMsg(null)
    if (/\.dwg$/i.test(f.name)) { setMsg({ kind: 'err', text: t('cad_dwg') }); return }
    setBusy(true)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      if (bytes[0] === 0x41 && bytes[1] === 0x43 && bytes[2] === 0x31) { setMsg({ kind: 'err', text: t('cad_dwg') }); return } // 'AC1…' = DWG
      const mod = await import('../../frame/cad')
      setL({ mod, name: f.name, d: mod.readDxf(bytes) })
      setRegion(0); setLayers(null); setUnitMm(undefined); setScale(undefined); setPicked(new Set())
    } catch (e) {
      setMsg({ kind: 'err', text: t('cad_read_fail', e instanceof Error ? e.message : String(e)) })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const use = useMemo(() => (L ? layers ?? L.mod.axisLayers(L.d).use : []), [L, layers])
  const regions: AxisRegion[] = useMemo(() => (L ? L.mod.axisRegions(L.d, use) : []), [L, use])
  const reg = regions.length > 1 ? regions[Math.min(region, regions.length - 1)] : undefined
  const g = useMemo(() => L && L.mod.extractAxisGrid(L.d, { layers: use, unitMm, scaleFactor: scale, ...(reg ? { box: reg.box, pad: L.mod.regionPad(reg) } : {}) }), [L, use, unitMm, scale, reg])
  const extra = g ? g.axes.filter((a) => !a.main && picked.has(keyOf(a))) : []
  const result = g && F.draft ? L!.mod.applyAxisGrid(F.draft, g, extra) : null
  const nx = result ? result.xs.length - 1 : 0, ny = result ? result.ys.length - 1 : 0
  const canApply = !!result && nx >= 1 && ny >= 1 && nx <= MAX_SPANS && ny <= MAX_SPANS
  const lineLayers = L ? L.d.layers.filter((l) => l.lines > 0).slice(0, 16) : []
  for (const n of use) if (L && !lineLayers.some((l) => l.name === n)) { const l = L.d.layers.find((q) => q.name === n); if (l) lineLayers.push(l) }

  const toggle = (a: AxisLine) => setPicked((p) => { const n = new Set(p); const k = keyOf(a); if (n.has(k)) n.delete(k); else n.add(k); return n })
  async function apply() {
    if (!g || !L || !canApply) return
    if (!await confirmAction({ title: t('cad_apply'), body: t('cad_apply_note'), ok: t('cad_apply') })) return
    editDraft((s) => { const n = L.mod.applyAxisGrid(s, g, extra); s.xs = n.xs; s.ys = n.ys; s.removed = n.removed; s.cuts = n.cuts; s.braces = n.braces })
    setMsg({ kind: 'ok', text: t('cad_applied', nx, ny) })
    setL(null)
  }

  return <section className="mw-group cad-import"><h4>{t('cad_import')}</h4>
    <div className="cad-open">
      <button type="button" className="btn btn-ghost" disabled={off || busy} onClick={() => input.current?.click()}><FileUp size={14} />{t(busy ? 'cad_reading' : 'cad_import_btn')}</button>
      <input ref={input} type="file" accept=".dxf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f) }} />
      <span className="mw-note">{t('cad_import_hint')}</span>
    </div>
    {msg && <p className={msg.kind === 'err' ? 'mw-error' : 'pe-tip'} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
    {L && g && <div className="cad-panel">
      <div className="cad-head"><b>{t('cad_file', L.name, L.d.entities.length)}</b>
        <button type="button" className="btn btn-ghost" aria-label={t('cad_close')} onClick={() => setL(null)}><X size={14} /></button></div>
      <div className="pe-grid">
        {regions.length > 1 && <label className="pe-f"><span>{t('cad_region')}</span><div className="pe-in">
          <select value={Math.min(region, regions.length - 1)} disabled={off} onChange={(e) => { setRegion(Number(e.target.value)); setPicked(new Set()) }}>
            {regions.map((r, i) => <option key={i} value={i}>{t('cad_region_opt', i + 1, r.lines)}</option>)}</select></div></label>}
        <label className="pe-f"><span>{t('cad_unit')}</span><div className="pe-in">
          <select value={g.unitMm} disabled={off} onChange={(e) => setUnitMm(Number(e.target.value))}>
            {UNITS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div></label>
        <label className="pe-f"><span>{t('cad_scale')}</span><div className="pe-in">
          <select value={scale ?? (g.scale && !g.scale.reject ? g.scale.factor : 1)} disabled={off} onChange={(e) => setScale(Number(e.target.value))}>
            {SCALES.map((k) => <option key={k} value={k}>{k === 1 ? t('cad_scale_true') : t('cad_scale_k', k)}</option>)}</select></div></label>
      </div>
      <fieldset className="cad-layers"><legend>{t('cad_layers')}</legend>
        {lineLayers.map((l) => <label key={l.name}><input type="checkbox" disabled={off} checked={use.includes(l.name)}
          onChange={(e) => { setLayers(e.target.checked ? [...use, l.name] : use.filter((n) => n !== l.name)); setPicked(new Set()); setRegion(0) }} /><span>{l.name}</span><small>{l.lines}</small></label>)}
      </fieldset>
      {g.warnings.length > 0 && <ul className="cad-warn">{g.warnings.filter((w) => w !== 'few_axes' || g.axes.length > 0).map((w) => <li key={w}>{warningText(w, g)}</li>)}</ul>}
      {g.axes.length ? <>
        <AxisPreview g={g} picked={picked} onToggle={toggle} />
        {g.axes.some((a) => !a.main) && <p className="mw-note">{t('cad_partial_hint')}</p>}
        {result && <div className="fr-plan-stat"><span><b>{t('cad_result', nx, ny)}</b></span>
          <span>X <b>{spans(result.xs).join(', ')}</b> m</span><span>Y <b>{spans(result.ys).join(', ')}</b> m</span></div>}
        {(nx > MAX_SPANS || ny > MAX_SPANS) && <p className="mw-error" role="alert">{t('cad_too_many')}</p>}
        <p className="mw-note">{t('cad_apply_note')}</p>
        <button type="button" className="btn btn-c" disabled={off || !canApply} onClick={() => void apply()}>{t('cad_apply')}</button>
      </> : <p className="mw-error" role="alert">{t('cad_none')}</p>}
    </div>}
    <details className="cad-help"><summary>{t('cad_help')}</summary>
      <ul><li>{t('cad_help_tarch')}</li><li>{t('cad_help_zw')}</li><li>{t('cad_help_common')}</li></ul></details>
  </section>
}
