import { additionLabelKey } from '../domain/additionTypes'
/* 3D VIEW — Plotly 는 동적 import 로 첫 화면 번들에서 분리 (story View3D 와 같은 방식).
   S.preview(편집 중 스펙)가 있으면 그 형상, 없으면 Gen 에 보낸 모델. S.viewNonce 변경 시 재플롯.
   story 와 같은 정리: 범례 위쪽 가로, 표시 토글(주골조·2차부재·가새·지점·절점), 정투영(정면·측면·평면)은 시선 방향 축을 숨기고 화면을 채움.
   Plotly 아이콘 도구 막대(이미지·확대·이동·회전·홈)는 story 처럼 오른쪽 위 가로·투명, 우리 막대에는 아이콘에 없는 ＋/－ 와 [선 | 단면] (drawing/solid — 실제 단면 치수 입체).
   토글·표시 방식을 바꿔도 사용자가 돌린 시점은 유지(uirevision = 시점). */
import { useEffect, useMemo, useRef } from 'react'
import { solidMeshes } from '../drawing/solid'
import { buildPortal, portalGeometry, risingAt } from '../domain/portal'
import { ROLES, type ElementRole, type FactoryModel, type FactorySpec } from '../domain/types'
import { t, useLang, type I18nKey } from '../i18n'
import { S, notify, useStore, type CamId, type Vis3D } from '../state/store'

type Plotly = typeof import('plotly.js-dist-min')
let plotlyP: Promise<Plotly> | null = null
const loadPlotly = () => (plotlyP ??= import('plotly.js-dist-min').then((m) => ((m as any).default ?? m) as Plotly))

const ROLE_VAR: Record<ElementRole, [string, string, number]> = {
  column: ['--p-col', '#4cc2ff', 5], rafter: ['--p-raf', '#5ee6a8', 5],
  purlin: ['--p-pur', '#9b8cff', 2], girt: ['--p-girt', '#ffb454', 2], strut: ['--p-strut', '#ff6b6b', 3],
  post: ['--p-post', '#4cc2ff', 3], brace: ['--p-brace', '#ff6bd5', 2],
}

/* 3D 색 = 현재 테마의 CSS 변수(app.css --p-*) — 플롯할 때마다 읽어 테마 전환에 따라감 */
function palette() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb
  return {
    role: Object.fromEntries(ROLES.map((r) => [r, v(ROLE_VAR[r][0], ROLE_VAR[r][1])])) as Record<ElementRole, string>,
    sup: v('--p-sup', '#ff6b6b'), supBd: v('--p-sup-bd', '#ff9999'), node: v('--p-node', '#445069'),
    axis: v('--p-axis', '#445069'), grid: v('--p-grid', '#1a2538'), scene: v('--p-scene', 'rgba(10,14,26,0.4)'),
    legend: v('--p-legend', 'rgba(0,0,0,0.85)'), legendBd: v('--p-legend-bd', 'rgba(31,42,61,0.5)'), txt: v('--p-txt', '#c9d4e8'),
  }
}
type Pal = ReturnType<typeof palette>

const CAMS: Record<CamId, { eye: { x: number; y: number; z: number }; up?: { x: number; y: number; z: number } }> = {
  iso: { eye: { x: 1.5, y: -1.7, z: 1.0 } },
  front: { eye: { x: 0, y: -2.5, z: 0 } },  // 프레임 면(X–Z)
  side: { eye: { x: 2.5, y: 0, z: 0 } },    // 길이 방향(Y–Z)
  top: { eye: { x: 0, y: 0, z: 2.5 }, up: { x: 0, y: 1, z: 0 } },
}

/** 범례 겸 표시 토글 — 부재 종류별 + 지점·절점 (Plotly 범례는 쓰지 않음: 같은 정보가 두 번 나오던 것 정리) */
type Mark = 'line' | 'diamond' | 'dot'
const TOGGLES: [keyof Vis3D, string, I18nKey, Mark][] = [
  ...ROLES.map((r): [keyof Vis3D, string, I18nKey, Mark] => [r, ROLE_VAR[r][0], `role_${r}`, 'line']),
  ['support', '--p-sup', 'support', 'diamond'], ['node', '--p-node', 'vis_node', 'dot'],
]

/** 정투영에서 시선 방향 축 — 한 점으로 눌려 제목·눈금이 겹침 → 전부 끈다 (story 와 같음) */
const HIDDEN_AX = { visible: false, title: { text: '' }, showticklabels: false, showgrid: false, showline: false, zeroline: false, ticks: '', showbackground: false, showspikes: false }

/** 축 비율 — iso 는 data 비율, 정투영은 보이는 두 축으로 화면을 채움 × zoom (정투영은 카메라 거리를 무시) */
function sceneOf(m: FactoryModel, c: CamId, zoom: number): Record<string, unknown> {
  if (c === 'iso') return { aspectmode: 'data' }
  const ext = (k: 'x' | 'y' | 'z') => { const v = m.nodes.map((n) => n[k]); return Math.max(...v) - Math.min(...v) || 1 }
  const d = { x: ext('x'), y: ext('y'), z: ext('z') }, k = 1.6 * zoom
  const mx = c === 'front' ? Math.max(d.x, d.z) : c === 'side' ? Math.max(d.y, d.z) : Math.max(d.x, d.y)
  return { aspectmode: 'manual', aspectratio: { x: (d.x / mx) * k, y: (d.y / mx) * k, z: (d.z / mx) * k } }
}
/** ISO(원근) 기본 거리 — 패널이 정사각형·세로형이면 가로로 넘치므로 가로/세로 비에 맞춰 멀리 (1.22 에서 딱 맞음, 2026-10-15 캡처) */
const isoFit = (el: HTMLElement) => {
  const r = el.clientWidth / Math.max(1, el.clientHeight)
  return 1 / Math.max(1.1, 1.35 / (r || 1.35))
}
const camOf = (c: CamId, zoom: number) => {
  const e = CAMS[c].eye
  return { eye: { x: e.x / zoom, y: e.y / zoom, z: e.z / zoom }, up: CAMS[c].up ?? { x: 0, y: 0, z: 1 }, projection: { type: c === 'iso' ? 'perspective' : 'orthographic' } }
}

/** 강도비 색상 구간 — 상한, 색 토큰, 대체색 */
const BANDS: [number, string, string][] = [[0.5, '--blue', '#4cc2ff'], [0.7, '--green', '#5ee6a8'], [0.9, '--cyan', '#38e1d6'], [1.0, '--amber', '#ffb454'], [Infinity, '--red', '#ff6b6b']]
const bandOf = (r: number) => BANDS.findIndex(([hi]) => r <= hi)
const bandName = (i: number) => { const hi = BANDS[i][0], lo = i ? BANDS[i - 1][0] : 0; return hi === Infinity ? `> ${lo.toFixed(1)}` : `${lo ? lo.toFixed(1) : '0'} – ${hi.toFixed(1)}` }

const LIGHT = { ambient: 0.55, diffuse: 0.8, specular: 0.15, roughness: 0.6 }

function traces(m: FactoryModel, spec: FactorySpec, P: Pal, ratio: Map<number, number> | null, vis: Vis3D, solid: boolean, invalid: Set<number>) {
  const cs = getComputedStyle(document.documentElement)
  const byId = new Map(m.nodes.map((n) => [n.id, n]))
  const out: any[] = []
  const added = new Map(m.elements.filter((e)=>e.addition).map((e)=>[e.id,e.addition]))
  /* 묶음: 강도비 보기 = 구간, 아니면 부재 종류 */
  const groups: { key: string; name: string; color: string; width: number; visible: boolean; has: (id: number, role: ElementRole) => boolean }[] = ratio
    ? BANDS.map(([, v, fb], i) => ({ key: `b${i}`, name: bandName(i), color: cs.getPropertyValue(v).trim() || fb, width: 4, visible: true, has: (id: number) => !invalid.has(id) && bandOf(ratio.get(id) ?? 0) === i }))
    : ROLES.map((r) => ({ key: r, name: t(`role_${r}`), color: P.role[r], width: ROLE_VAR[r][2], visible: vis[r], has: (id: number, role: ElementRole) => role === r && !added.has(id) }))
  if (!ratio) for (const [usage,role,label] of [['platform-beam','strut','add_platformBeam'],['platform-column','post','add_platformColumn'],['runway-beam','strut','add_runway'],['opening-header','strut','add_header'],['roof-trimmer','strut','p6_roofBeam'],['floor-trimmer','strut','p6_floorBeam']] as const) groups.push({key:usage,name:t(label),color:P.role[role],width:4,visible:vis[role],has:(id:number)=>added.get(id)===usage})
  if (ratio && invalid.size) groups.push({ key: 'invalid', name: t('rs_applicability'), color: cs.getPropertyValue('--violet').trim() || '#9b8cff', width: 6, visible: true, has: (id: number) => invalid.has(id) })
  if (solid) {
    const meshes = solidMeshes(m, risingAt(spec), spec.roofSlope, (e) => groups.find((g) => g.has(e.id, e.role))?.key ?? null)
    for (const g of groups) {
      const mesh = meshes.get(g.key)
      if (mesh) out.push({ type: 'mesh3d', name: g.name, ...mesh, color: g.color, visible: g.visible, flatshading: true, lighting: LIGHT, showlegend: true, hoverinfo: 'skip' })
    }
  } else {
    for (const g of groups) {
      const x: (number | null)[] = [], y: (number | null)[] = [], z: (number | null)[] = []
      for (const e of m.elements) {
        if (!g.has(e.id, e.role)) continue
        const a = byId.get(e.n1)!, b = byId.get(e.n2)!
        x.push(a.x, b.x, null); y.push(a.y, b.y, null); z.push(a.z, b.z, null)
      }
      if (x.length) out.push({ type: 'scatter3d', mode: 'lines', name: g.name, x, y, z, visible: g.visible, line: { color: g.color, width: g.width }, hoverinfo: 'skip' })
    }
  }
  const sup = m.nodes.filter((n) => n.z === 0), free = m.nodes.filter((n) => n.z !== 0)
  out.push({ type: 'scatter3d', mode: 'markers', name: t('support'), visible: vis.support,
    x: sup.map((n) => n.x), y: sup.map((n) => n.y), z: sup.map((n) => n.z),
    text: sup.map((n) => `N${n.id}  (${n.x}, ${n.y}, 0) m`), hovertemplate: '%{text}<extra></extra>',
    marker: { size: 4, color: P.sup, symbol: 'diamond', line: { color: P.supBd, width: 1 } } })
  /* 절점 — 마우스를 올리면 번호·좌표 */
  if (m.additions) {
    const G = portalGeometry(spec), equipment = spec.additions?.equipment ?? []
    for(const v of m.additions.voids??[])out.push({type:'scatter3d',mode:'lines',name:t(v.kind==='roof'?'p6_roof':'p6_floor'),x:[v.x0,v.x1,v.x1,v.x0,v.x0],y:[v.y0,v.y0,v.y1,v.y1,v.y0],z:[v.z0,v.z1,v.z1,v.z0,v.z0],line:{color:P.role.strut,width:6,dash:'dash'},text:v.id,hovertemplate:'%{text}<extra></extra>'})
    const link=spec.additions?.link
    if(link){const y=G.spans.slice(0,link.frame).reduce((a,b)=>a+b,0);out.push({type:'scatter3d',mode:'markers',name:t('p6_link'),x:[link.face==='x0'?0:spec.span],y:[y],z:[link.elevation],marker:{color:P.role.post,size:8,symbol:'diamond'},text:link.id,hovertemplate:'%{text}<extra></extra>'})}
    if (equipment.length) out.push({type:'scatter3d',mode:'markers',name:t('add_equipment'),x:equipment.map((e)=>e.x),y:equipment.map((e)=>e.y),z:equipment.map((e)=>G.zAt(e.x)),text:equipment.map((e)=>`${e.name} / ${e.weight} kN / ${e.source}`),hovertemplate:'%{text}<extra></extra>',marker:{size:7,color:P.role.strut,symbol:'diamond'}})
    if (spec.features?.crane && spec.additions?.crane) {
      const stations=G.spans.reduce<number[]>((a,v)=>[...a,a.at(-1)!+v],[0])
      const c=spec.additions.crane, supports=m.nodes.filter((n)=>Math.abs(n.z-c.elevation)<1e-7 && (n.x===0||n.x===spec.span) && stations.some((y)=>Math.abs(n.y-y)<1e-7))
      out.push({type:'scatter3d',mode:'markers',name:t('add_crane'),x:supports.map((n)=>n.x),y:supports.map((n)=>n.y),z:supports.map((n)=>n.z),text:supports.map((n)=>`${t('add_crane')} / N${n.id}`),hovertemplate:'%{text}<extra></extra>',marker:{size:5,color:P.role.brace,symbol:'circle'}})
    }
  }
  out.push({ type: 'scatter3d', mode: 'markers', name: t('vis_node'), visible: vis.node,
    x: free.map((n) => n.x), y: free.map((n) => n.y), z: free.map((n) => n.z),
    text: free.map((n) => `N${n.id}  (${+n.x.toFixed(3)}, ${+n.y.toFixed(3)}, ${+n.z.toFixed(3)}) m`), hovertemplate: '%{text}<extra></extra>',
    marker: { size: 2.5, color: P.node, opacity: 0.9 } })
  return out
}

function axis(title: string, P: Pal, font: string) {
  return {
    title: { text: title, font: { color: P.axis, size: 12, family: font } },
    color: P.axis, gridcolor: P.grid, zerolinecolor: P.grid, backgroundcolor: P.scene, showbackground: true,
    tickfont: { color: P.axis, size: 10, family: font },
  }
}

const ZOOM_STEP = 1.25

export function View3D() {
  const s = useStore()
  const lang = useLang()
  const ref = useRef<HTMLDivElement>(null)
  const spec = s.preview ?? s.built?.spec ?? null
  const model = useMemo(() => (s.preview ? buildPortal(s.preview) : s.built?.model ?? null), [s.viewNonce, s.built])
  /* 강도비 색상 — 설계 검토 결과가 있고 미리보기가 아닐 때만 */
  const ratio = useMemo(() => (s.ratioView && !s.preview && s.design ? new Map(s.design.members.map((m) => [m.id, m.ratio])) : null), [s.ratioView, s.preview, s.design])
  const invalid = useMemo(() => new Set(s.design?.members.filter((m) => m.issues?.some((i) => i.level === 'blocked')).map((m) => m.id) ?? []), [s.design])
  const solid = s.render3d === 'solid'

  useEffect(() => {
    const el = ref.current
    if (!el || !model || !spec) return
    let alive = true
    void loadPlotly().then((Plotly) => {
      if (!alive) return
      const P = palette()
      const font = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace'
      const c = S.cam
      const ax = (hide: boolean, title: string) => (hide ? { ...axis(title, P, font), ...HIDDEN_AX } : axis(title, P, font))
      void Plotly.react(el, traces(model, spec, P, ratio, S.vis3d, solid, invalid), {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { l: 0, r: 0, t: ratio ? 28 : 0, b: 0 },
        font: { family: font, color: P.txt }, showlegend: !!ratio,
        /* 시점 버튼·맞춤을 누를 때만 카메라를 다시 적용 — 토글·표시 방식 변경은 사용자 시점 유지 */
        uirevision: `${c}:${S.camReset}`,
        modebar: { orientation: 'h', bgcolor: 'rgba(0,0,0,0)', color: P.axis, activecolor: P.txt },
        /* 범례: 위쪽 가로 한 줄 (story) — 모델을 가리지 않음 */
        /* 강도비 보기에만 색 구간 범례 (부재 종류는 위 토글 줄이 범례) */
        legend: { orientation: 'h', x: 0, y: 1.03, itemclick: false, itemdoubleclick: false, bgcolor: P.legend, bordercolor: P.legendBd, borderwidth: 1, font: { size: 11, color: P.txt, family: font } },
        scene: {
          ...sceneOf(model, c, 1),
          /* 정투영은 시선 방향 축을 숨김 — 정면(X–Z) Y, 측면(Y–Z) X, 평면 Z */
          xaxis: ax(c === 'side', 'X (m)'), yaxis: ax(c === 'front', 'Y (m)'), zaxis: ax(c === 'top', 'Z (m)'),
          camera: camOf(c, isoFit(el)),
        },
      } as any, {
        responsive: true, displaylogo: false, displayModeBar: true, modeBarButtonsToRemove: ['resetCameraLastSave3d', 'hoverClosest3d'],
        toImageButtonOptions: { format: 'png', filename: 'steel_factory_3d', scale: 2 },
      } as any)
    })
    return () => { alive = false }
  }, [model, spec, ratio, invalid, s.cam, s.camReset, s.theme, lang, s.vis3d, solid])

  /** 확대·축소 — 지금 시점 기준 (원근: 카메라 거리, 정투영: 축 비율) */
  const zoom = (f: number) => void loadPlotly().then((Plotly) => {
    const el = ref.current as any
    const sc = el?._fullLayout?.scene
    if (!sc || !model) return
    const cam = sc.camera, ortho = cam.projection?.type === 'orthographic'
    if (ortho) {
      const a = sc.aspectratio
      void Plotly.relayout(el, { 'scene.aspectmode': 'manual', 'scene.aspectratio': { x: a.x * f, y: a.y * f, z: a.z * f } } as any)
    } else {
      void Plotly.relayout(el, { 'scene.camera.eye': { x: cam.eye.x / f, y: cam.eye.y / f, z: cam.eye.z / f } } as any)
    }
  })
  const setCam = (c: CamId) => { S.cam = c; notify() }
  const len = model ? Math.max(...model.nodes.map((n) => n.y)) : 0
  const span = model ? Math.max(...model.nodes.map((n) => n.x)) : 0

  return (
    <>
      <div className="view-tb">
        <span className="vlbl">{t('view_cam')}</span>
        {(['iso', 'front', 'side', 'top'] as const).map((c) => (
          <button key={c} className={`vcam${s.cam === c ? ' on' : ''}`} onClick={() => setCam(c)}>{t(`cam_${c}`)}</button>
        ))}
        <span className="vsep" />
        <button className={`vcam${!solid ? ' on' : ''}`} aria-pressed={!solid} onClick={() => { S.render3d = 'line'; notify() }}>{t('view_line')}</button>
        <button className={`vcam${solid ? ' on' : ''}`} aria-pressed={solid} title={t('view_solid_tip')} onClick={() => { S.render3d = 'solid'; notify() }}>{t('view_solid')}</button>
        {s.design && !s.preview && <>
          <span className="vsep" />
          <button className={`vcam${!s.ratioView ? ' on' : ''}`} onClick={() => { S.ratioView = false; notify() }}>{t('view_role')}</button>
          <button className={`vcam${s.ratioView ? ' on' : ''}`} onClick={() => { S.ratioView = true; notify() }}>{t('view_ratio')}</button>
        </>}
        <span className="vsep" />
        <button className="vcam vicon" title={t('view_zoom_in')} aria-label={t('view_zoom_in')} disabled={!model} onClick={() => zoom(ZOOM_STEP)}>＋</button>
        <button className="vcam vicon" title={t('view_zoom_out')} aria-label={t('view_zoom_out')} disabled={!model} onClick={() => zoom(1 / ZOOM_STEP)}>－</button>
        {s.preview && <><span className="vsep" /><span className="vlbl" style={{ color: 'var(--amber)' }}>{t('preview_tag')}</span></>}
      </div>
      <div className="view-tb view-tb2">
        <span className="vlbl">{t('view_show')}</span>
        {TOGGLES.filter(([k]) => (!ratio || k === 'support' || k === 'node') && (k === 'support' || k === 'node' || model?.elements.some((e) => e.role === k))).map(([k, color, label, mark]) => (
          <button key={k} className={`vtog ${s.vis3d[k] ? 'on' : 'off'}`} aria-pressed={s.vis3d[k]} title={t('view_toggle_tip')}
            onClick={() => { S.vis3d = { ...S.vis3d, [k]: !S.vis3d[k] }; notify() }}>
            <span className={`swatch sw-${mark}`} style={{ background: `var(${color})` }} /><span>{t(label)}{model?.elements.some((e)=>e.role===k && e.addition) ? ` / ${[...new Set(model.elements.filter((e)=>e.role===k && e.addition).map((e)=>t(additionLabelKey(e.addition!))))].join(' / ')}` : ''}</span>
          </button>
        ))}
      </div>
      {model
        ? <div id="plot" ref={ref} />
        : <div className="res-empty" style={{ flex: 1 }}>{t('view_empty')}</div>}
      {model && (
        <div className="view-stats">
          {model.additions && <span className="vs-item" title={t('sc_additionReview')}>{t('add_summary')} <span className="vs-val">{model.additions.sources.length}</span></span>}
          <span className="vs-item">{t('st_node')} <span className="vs-val">{model.nodes.length}</span></span>
          <span className="vs-item">{t('st_elem')} <span className="vs-val">{model.elements.length}</span></span>
          <span className="vs-item">{t('kv_span')} <span className="vs-val vs-hi">{span} m</span></span>
          <span className="vs-item">{t('kv_length')} <span className="vs-val">{len} m</span></span>
        </div>
      )}
    </>
  )
}
