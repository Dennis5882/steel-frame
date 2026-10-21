/* 다층 강골조 3D — 공장 View3D 와 같은 Plotly 방식·도구 막대. 편집 중이면 draft 형상(미리보기), 아니면 Gen 에 보낸 모델.
   설계 검토 후에는 응력비 색 구간(부재 = 설계 부재 단위, max(강도비, 구조 규정 비)). */
import { useEffect, useMemo, useRef } from 'react'
import { t, useLang } from '../../i18n'
import { S, notify, useStore, type CamId } from '../../state/store'
import { F, draftModel, frameStale } from '../../frame/state'
import type { FrameModel, FrameRole, FrameSpec } from '../../frame/types'
import { gridX, gridY } from '../../frame/drawings'

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

/** 축선(도면식) — 평면·정면·측면 보기에서만. 점선 축선 + 축 번호 원(X 1,2,3… / Y A,B,C…, 도면·FramePlan 과 같음) + 스팬 치수(mm).
    정면·측면은 층 레벨선과 '이름 표고'도 그려 입면도처럼 보이게 한다. ISO 에서는 그리지 않는다(모델에 가려 어지러움) */
function gridTraces(spec: FrameSpec, levels: number[], cam: CamId, visible: boolean) {
  if (cam === 'iso') return []
  const { xs, ys } = spec
  const z0 = levels[0], zt = levels.at(-1)!
  const Lx = xs.at(-1)! - xs[0], Ly = ys.at(-1)! - ys[0], d = 0.1 * Math.max(Lx, Ly, zt - z0, 6)
  const color = css('--p-axis', '#8a94a6'), font = css('--font-mono', 'monospace'), txt = css('--p-txt', '#c9d4e8'), dimc = css('--amber', '#b58a00')
  const L: [number, number, number][][] = [], B: [number, number, number, string][] = [], D: [number, number, number, string][] = [], T: [number, number, number, string][] = []
  const mm = (v: number) => String(Math.round(v * 1000))
  if (cam === 'top') {
    for (const [i, x] of xs.entries()) { L.push([[x, ys[0] - d * 0.7, z0], [x, ys.at(-1)! + d * 0.3, z0]]); B.push([x, ys[0] - d, z0, gridX(spec, i)]) }
    for (const [j, y] of ys.entries()) { L.push([[xs[0] - d * 0.7, y, z0], [xs.at(-1)! + d * 0.3, y, z0]]); B.push([xs[0] - d, y, z0, gridY(spec, j)]) }
    xs.slice(1).forEach((x, i) => D.push([(x + xs[i]) / 2, ys.at(-1)! + d * 0.55, z0, mm(x - xs[i])]))
    ys.slice(1).forEach((y, j) => D.push([xs.at(-1)! + d * 0.55, (y + ys[j]) / 2, z0, mm(y - ys[j])]))
  } else {
    /* 정면 = X 축선(1,2,3…)을 y 앞면에, 측면 = Y 축선(A,B,C…)을 x 오른쪽 면에 */
    const front = cam === 'front', u = front ? xs : ys, at = front ? ys[0] : xs.at(-1)!
    const P = (v: number, z: number): [number, number, number] => (front ? [v, at, z] : [at, v, z])
    for (const [i, v] of u.entries()) { L.push([P(v, z0 - d * 0.7), P(v, zt + d * 0.3)]); B.push([...P(v, z0 - d), front ? gridX(spec, i) : gridY(spec, i)]) }
    u.slice(1).forEach((v, i) => D.push([...P((v + u[i]) / 2, zt + d * 0.55), mm(v - u[i])]))
    levels.forEach((z, k) => { L.push([P(u[0] - d * 0.4, z), P(u.at(-1)! + d * 0.4, z)]); T.push([...P(u.at(-1)! + d * 0.5, z), `${spec.storyNames[k] ?? ''} ${z >= 0 ? '+' : ''}${z.toFixed(3)}`]) })
  }
  const flat = (ls: [number, number, number][][], k: 0 | 1 | 2) => ls.flatMap((l) => [l[0][k], l[1][k], null])
  const pts = (ps: [number, number, number, string][], k: 0 | 1 | 2) => ps.map((p) => p[k])
  const text = (ps: [number, number, number, string][], color: string, size: number, pos: string) => ({ type: 'scatter3d', mode: 'text', x: pts(ps, 0), y: pts(ps, 1), z: pts(ps, 2), text: ps.map((p) => p[3]),
    textposition: pos, hoverinfo: 'skip', showlegend: false, visible, textfont: { size, color, family: font } })
  return [
    { type: 'scatter3d', mode: 'lines', x: flat(L, 0), y: flat(L, 1), z: flat(L, 2), hoverinfo: 'skip', showlegend: false, visible, line: { color, width: 1, dash: 'dash' } },
    { type: 'scatter3d', mode: 'markers+text', x: pts(B, 0), y: pts(B, 1), z: pts(B, 2), text: B.map((b) => b[3]), textposition: 'middle center', hoverinfo: 'skip', showlegend: false, visible,
      marker: { size: 13, symbol: 'circle-open', color }, textfont: { size: 11, color: txt, family: font } },
    text(D, dimc, 10, 'middle center'),
    ...(T.length ? [text(T, txt, 10, 'middle right')] : []),
  ]
}

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
  const waiting = preview && F.start === 'dxf' && !F.cad // DXF 로 시작했는데 아직 도면을 안 열었음
  const model = useMemo(() => waiting ? null : preview ? draftModel(F.draft).model : F.built?.model ?? draftModel(F.draft).model, [s.viewNonce, preview, waiting])
  const spec = preview ? F.draft : F.built?.spec ?? F.draft
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
      const vis = S.vis3d as unknown as Record<string, boolean>
      const axes = spec ? gridTraces(spec, model.levels, c, vis.grid !== false) : []
      void Plotly.react(el, [...axes, ...traces(model, ratio, vis)], {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: ratio ? 28 : 0, b: 0 }, font: { family: font, color: txt }, showlegend: !!ratio,
        uirevision: `${c}:${S.camReset}`,
        legend: { orientation: 'h', x: 0, y: 1.03, itemclick: false, itemdoubleclick: false, bgcolor: css('--p-legend', 'rgba(0,0,0,0.85)'), font: { size: 11, color: txt, family: font } },
        modebar: { orientation: 'h', bgcolor: 'rgba(0,0,0,0)', color: axc, activecolor: txt },
        scene: {
          aspectmode: 'data',
          /* 평면·정면·측면은 도면처럼 축선·치수가 기준 → Plotly 눈금 숨김. ISO 만 좌표축 */
          xaxis: ax(c !== 'iso', 'X (m)'), yaxis: ax(c !== 'iso', 'Y (m)'), zaxis: ax(c !== 'iso', 'Z (m)'),
          camera: { eye: { x: e.x * 1.15, y: e.y * 1.15, z: e.z * 1.15 }, up: CAMS[c].up ?? { x: 0, y: 0, z: 1 }, projection: { type: c === 'iso' ? 'perspective' : 'orthographic' } },
        },
      } as any, { responsive: true, displaylogo: false, displayModeBar: true, modeBarButtonsToRemove: ['resetCameraLastSave3d', 'hoverClosest3d'], toImageButtonOptions: { format: 'png', filename: 'steel_frame_3d', scale: 2 } } as any)
    })
    return () => { alive = false }
  }, [model, spec, ratio, s.cam, s.camReset, s.theme, lang, s.vis3d])

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
      {([...ROLES.map((r) => [r, ROLE_VAR[r][0], t(`fr_role_${r}`)]), ['support', '--p-sup', t('support')], ['grid', '--p-axis', t('rp_grid')]] as [string, string, string][])
        .filter(([k]) => k === 'support' || k === 'grid' || model?.elements.some((e) => e.role === k))
        .map(([k, color, label]) => <button key={k} className={`vtog ${(S.vis3d as any)[k] !== false ? 'on' : 'off'}`} aria-pressed={(S.vis3d as any)[k] !== false} onClick={() => toggle(k)}>
          <span className={`swatch sw-${k === 'support' ? 'diamond' : 'line'}`} style={{ background: `var(${color})` }} /><span>{label}</span></button>)}
    </div>}
    {model ? <div id="plot" ref={ref} /> : <div className="res-empty" style={{ flex: 1 }}>{t(waiting ? 'cad_view_wait' : 'fr_view_empty')}</div>}
    {model && <div className="view-stats">
      <span className="vs-item">{t('st_node')} <span className="vs-val">{model.nodes.length}</span></span>
      <span className="vs-item">{t('st_elem')} <span className="vs-val">{model.elements.length}</span></span>
      <span className="vs-item">{t('fr_area')} <span className="vs-val">{model.floorArea} m²</span></span>
      <span className="vs-item">{t('fr_height')} <span className="vs-val vs-hi">{+H.toFixed(3)} m</span></span>
    </div>}
  </>
}
