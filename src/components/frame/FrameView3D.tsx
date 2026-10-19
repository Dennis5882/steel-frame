/* 다층 강골조 3D — 공장 View3D 와 같은 Plotly 방식·도구 막대. 편집 중이면 draft 형상(미리보기), 아니면 Gen 에 보낸 모델.
   설계 검토 후에는 응력비 색 구간(부재 = 설계 부재 단위, max(강도비, 구조 규정 비)). */
import { useEffect, useMemo, useRef } from 'react'
import { t, useLang } from '../../i18n'
import { S, notify, useStore, type CamId } from '../../state/store'
import { F, draftModel, frameStale } from '../../frame/state'
import type { FrameModel, FrameRole } from '../../frame/types'

type Plotly = typeof import('plotly.js-dist-min')
let plotlyP: Promise<Plotly> | null = null
const loadPlotly = () => (plotlyP ??= import('plotly.js-dist-min').then((m) => ((m as any).default ?? m) as Plotly))

const ROLES: FrameRole[] = ['column', 'beam', 'brace']
const ROLE_VAR: Record<FrameRole, [string, string, number]> = { column: ['--p-col', '#4cc2ff', 5], beam: ['--p-raf', '#5ee6a8', 4], brace: ['--p-brace', '#ff6bd5', 3] }
const BANDS: [number, string, string][] = [[0.5, '--blue', '#4cc2ff'], [0.7, '--green', '#5ee6a8'], [0.9, '--cyan', '#38e1d6'], [1.0, '--amber', '#ffb454'], [Infinity, '--red', '#ff6b6b']]
const bandOf = (r: number) => BANDS.findIndex(([hi]) => r <= hi)
const bandName = (i: number) => { const hi = BANDS[i][0], lo = i ? BANDS[i - 1][0] : 0; return hi === Infinity ? `> ${lo.toFixed(1)}` : `${lo ? lo.toFixed(1) : '0'} – ${hi.toFixed(1)}` }
const CAMS: Record<CamId, { eye: { x: number; y: number; z: number }; up?: { x: number; y: number; z: number } }> = {
  iso: { eye: { x: 1.5, y: -1.7, z: 1.0 } }, front: { eye: { x: 0, y: -2.5, z: 0 } }, side: { eye: { x: 2.5, y: 0, z: 0 } }, top: { eye: { x: 0, y: 0, z: 2.5 }, up: { x: 0, y: 1, z: 0 } },
}
const HIDDEN_AX = { visible: false, title: { text: '' }, showticklabels: false, showgrid: false, showline: false, zeroline: false, ticks: '', showbackground: false, showspikes: false }

function css(name: string, fb: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb }

function traces(m: FrameModel, ratio: Map<number, number> | null, vis: Record<string, boolean>) {
  const byId = new Map(m.nodes.map((n) => [n.id, n]))
  const groups = ratio
    ? BANDS.map(([, v, fb], i) => ({ name: bandName(i), color: css(v, fb), width: 4, visible: true, has: (e: FrameModel['elements'][number]) => bandOf(ratio.get(e.member) ?? 0) === i }))
    : ROLES.map((r) => ({ name: t(`fr_role_${r}`), color: css(ROLE_VAR[r][0], ROLE_VAR[r][1]), width: ROLE_VAR[r][2], visible: vis[r] !== false, has: (e: FrameModel['elements'][number]) => e.role === r }))
  const out: any[] = []
  for (const g of groups) {
    const x: (number | null)[] = [], y: (number | null)[] = [], z: (number | null)[] = [], txt: (string | null)[] = []
    for (const e of m.elements) {
      if (!g.has(e)) continue
      const a = byId.get(e.n1)!, b = byId.get(e.n2)!
      const label = `E${e.id} · ${e.section}${ratio ? ` · ${(ratio.get(e.member) ?? 0).toFixed(3)}` : ''}`
      x.push(a.x, b.x, null); y.push(a.y, b.y, null); z.push(a.z, b.z, null); txt.push(label, label, null)
    }
    if (x.length) out.push({ type: 'scatter3d', mode: 'lines', name: g.name, x, y, z, text: txt, hovertemplate: '%{text}<extra></extra>', visible: g.visible, line: { color: g.color, width: g.width } })
  }
  const sup = m.supports.map((id) => byId.get(id)!)
  out.push({ type: 'scatter3d', mode: 'markers', name: t('support'), visible: vis.support !== false, x: sup.map((n) => n.x), y: sup.map((n) => n.y), z: sup.map((n) => n.z),
    text: sup.map((n) => `N${n.id} (${n.x}, ${n.y}, ${n.z}) m`), hovertemplate: '%{text}<extra></extra>', marker: { size: 4, color: css('--p-sup', '#ff6b6b'), symbol: 'diamond' } })
  return out
}

export function FrameView3D() {
  const s = useStore()
  const lang = useLang()
  const ref = useRef<HTMLDivElement>(null)
  const preview = s.task === 'model' && F.view === 'edit' && (!F.built || frameStale(F))
  const model = useMemo(() => preview ? draftModel(F.draft).model : F.built?.model ?? draftModel(F.draft).model, [s.viewNonce, preview])
  const ratio = useMemo(() => !preview && F.ratioView && F.design ? new Map(F.design.members.map((m) => [m.id, Math.max(m.ratio, m.detailRatio)])) : null, [s.viewNonce, preview, F.ratioView, F.design])

  useEffect(() => {
    const el = ref.current
    if (!el || !model) return
    let alive = true
    void loadPlotly().then((Plotly) => {
      if (!alive) return
      const font = css('--font-mono', 'monospace'), axc = css('--p-axis', '#445069'), grid = css('--p-grid', '#1a2538'), txt = css('--p-txt', '#c9d4e8')
      const ax = (hide: boolean, title: string) => {
        const a = { title: { text: title, font: { color: axc, size: 12, family: font } }, color: axc, gridcolor: grid, zerolinecolor: grid, backgroundcolor: css('--p-scene', 'rgba(10,14,26,0.4)'), showbackground: true, tickfont: { color: axc, size: 10, family: font } }
        return hide ? { ...a, ...HIDDEN_AX } : a
      }
      const c = S.cam, e = CAMS[c].eye
      void Plotly.react(el, traces(model, ratio, S.vis3d as unknown as Record<string, boolean>), {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: ratio ? 28 : 0, b: 0 }, font: { family: font, color: txt }, showlegend: !!ratio,
        uirevision: `${c}:${S.camReset}`,
        legend: { orientation: 'h', x: 0, y: 1.03, itemclick: false, itemdoubleclick: false, bgcolor: css('--p-legend', 'rgba(0,0,0,0.85)'), font: { size: 11, color: txt, family: font } },
        modebar: { orientation: 'h', bgcolor: 'rgba(0,0,0,0)', color: axc, activecolor: txt },
        scene: {
          aspectmode: 'data',
          xaxis: ax(c === 'side', 'X (m)'), yaxis: ax(c === 'front', 'Y (m)'), zaxis: ax(c === 'top', 'Z (m)'),
          camera: { eye: { x: e.x * 0.85, y: e.y * 0.85, z: e.z * 0.85 }, up: CAMS[c].up ?? { x: 0, y: 0, z: 1 }, projection: { type: c === 'iso' ? 'perspective' : 'orthographic' } },
        },
      } as any, { responsive: true, displaylogo: false, displayModeBar: true, modeBarButtonsToRemove: ['resetCameraLastSave3d', 'hoverClosest3d'], toImageButtonOptions: { format: 'png', filename: 'steel_frame_3d', scale: 2 } } as any)
    })
    return () => { alive = false }
  }, [model, ratio, s.cam, s.camReset, s.theme, lang, s.vis3d])

  const setCam = (c: CamId) => { S.cam = c; notify() }
  const toggle = (k: string) => { S.vis3d = { ...S.vis3d, [k]: !(S.vis3d as any)[k] } as any; notify() }
  const H = model ? Math.max(...model.levels) - Math.min(...model.levels) : 0
  return <>
    <div className="view-tb">
      <span className="vlbl">{t('view_cam')}</span>
      {(['iso', 'front', 'side', 'top'] as const).map((c) => <button key={c} className={`vcam${s.cam === c ? ' on' : ''}`} onClick={() => setCam(c)}>{t(`cam_${c}`)}</button>)}
      {F.design && !preview && <>
        <span className="vsep" />
        <button className={`vcam${!F.ratioView ? ' on' : ''}`} onClick={() => { F.ratioView = false; notify() }}>{t('view_role')}</button>
        <button className={`vcam${F.ratioView ? ' on' : ''}`} onClick={() => { F.ratioView = true; notify() }}>{t('view_ratio')}</button>
      </>}
      {preview && <><span className="vsep" /><span className="vlbl" style={{ color: 'var(--amber)' }}>{t('preview_tag')}</span></>}
    </div>
    {!ratio && <div className="view-tb view-tb2">
      <span className="vlbl">{t('view_show')}</span>
      {([...ROLES.map((r) => [r, ROLE_VAR[r][0], t(`fr_role_${r}`)]), ['support', '--p-sup', t('support')]] as [string, string, string][])
        .filter(([k]) => k === 'support' || model?.elements.some((e) => e.role === k))
        .map(([k, color, label]) => <button key={k} className={`vtog ${(S.vis3d as any)[k] !== false ? 'on' : 'off'}`} aria-pressed={(S.vis3d as any)[k] !== false} onClick={() => toggle(k)}>
          <span className={`swatch sw-${k === 'support' ? 'diamond' : 'line'}`} style={{ background: `var(${color})` }} /><span>{label}</span></button>)}
    </div>}
    {model ? <div id="plot" ref={ref} /> : <div className="res-empty" style={{ flex: 1 }}>{t('fr_view_empty')}</div>}
    {model && <div className="view-stats">
      <span className="vs-item">{t('st_node')} <span className="vs-val">{model.nodes.length}</span></span>
      <span className="vs-item">{t('st_elem')} <span className="vs-val">{model.elements.length}</span></span>
      <span className="vs-item">{t('fr_area')} <span className="vs-val">{model.floorArea} m²</span></span>
      <span className="vs-item">{t('fr_height')} <span className="vs-val vs-hi">{+H.toFixed(3)} m</span></span>
    </div>}
  </>
}
