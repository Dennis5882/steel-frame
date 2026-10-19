/* 도면 (M6) — 모델 공간에 시트를 가로로 배치한 DXF.
   S1 지붕 골조 평면 · S2 대표 프레임 입면 · S3 측벽 입면(x = 0) · S4 박공벽 입면(y = 0) · S5 부재·접합부 일람 + 표제란.
   좌표: 모델 m → mm. 그리드: 프레임선 1..n+1 (Y), 기둥열 A·B (X). */
import type { ConnResult } from '../domain/connections'
import { profileOf } from '../codes'
import { restraintKeys, support } from '../domain/validity'
import { portalGeometry } from '../domain/portal'
import {linkReview} from '../domain/phase6'
import {craneTravel} from '../domain/craneTravel'
import { memberSchedule } from '../domain/schedule'
import type { ElementRole, FactoryModel, FactorySpec, Node } from '../domain/types'
import { Dxf, toSvgSheets, type SvgLayerStyle } from './dxf'

const LAYERS = [
  { name: 'GRID', color: 8 }, { name: 'COLUMN', color: 4 }, { name: 'RAFTER', color: 3 }, { name: 'PURLIN', color: 5 },
  { name: 'GIRT', color: 30 }, { name: 'STRUT', color: 1 }, { name: 'POST', color: 6 }, { name: 'BRACE', color: 210 },
  { name: 'DIM', color: 2 }, { name: 'TEXT', color: 7 }, { name: 'BORDER', color: 7 },
]
const LAYER_OF: Record<ElementRole, string> = { column: 'COLUMN', rafter: 'RAFTER', purlin: 'PURLIN', girt: 'GIRT', strut: 'STRUT', post: 'POST', brace: 'BRACE' }
const ROLE_EN: Record<ElementRole, string> = { column: 'Column', rafter: 'Rafter', purlin: 'Purlin', girt: 'Girt', strut: 'Strut', post: 'Gable post', brace: 'Bracing' }
const TXT = 250 // 기본 글자 높이 mm

export interface DrawingInput { spec: FactorySpec; model: FactoryModel; connections: ConnResult[] | null; title: string }

/** 계산서용 SVG 레이어 스타일 (흰 종이, 색은 DXF 레이어 색에 가깝게) */
const SVG_STYLE: Record<string, SvgLayerStyle> = {
  GRID: { color: '#9aa1ad', width: 0.5, dash: '6 4' }, COLUMN: { color: '#0b6e99', width: 1.6 }, RAFTER: { color: '#1d8653', width: 1.6 },
  PURLIN: { color: '#2f55c9', width: 0.7 }, GIRT: { color: '#b56d00', width: 0.7 }, STRUT: { color: '#c43030', width: 1 },
  POST: { color: '#8e3fb5', width: 1 }, BRACE: { color: '#c2399b', width: 0.7 }, DIM: { color: '#7a5d00', width: 0.5 },
  TEXT: { color: '#111', width: 0.5 }, BORDER: { color: '#111', width: 0.8 },
}

export function buildDxf(input: DrawingInput): string { return drawSheets(input).toString() }

/** 계산서용 — DXF 와 같은 시트를 SVG 로 */
export function buildDrawingSvgs(input: DrawingInput): { name: string; svg: string }[] { return toSvgSheets(drawSheets(input), SVG_STYLE) }

function drawSheets({ spec, model, connections, title }: DrawingInput): Dxf {
  const d = new Dxf(LAYERS)
  const G = portalGeometry(spec)
  const mm = (m: number) => m * 1000
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const ends = (e: { n1: number; n2: number }): [Node, Node] => [nodes.get(e.n1)!, nodes.get(e.n2)!]
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const frameYs = G.spans.reduce<number[]>((a, s) => [...a, a[a.length - 1] + s], [0])
  const M = 4000 // 시트 여백
  let ox = 0 // 현재 시트 원점 x

  /** 시트 테두리 + 제목. below = 아래 여백 (시트 아래쪽 주석이 테두리 안에 들도록) */
  const sheet = (w: number, h: number, name: string, below = M) => {
    d.beginSheet(name, ox - M, -below, w + 2 * M, h + M + below)
    d.rect('BORDER', ox - M, -below, w + 2 * M, h + M + below)
    d.text('TEXT', ox - M + 600, h + M - 900, TXT * 2, name)
  }
  const gridBubble = (x: number, y: number, label: string) => { d.circle('GRID', x, y, 450); d.text('GRID', x, y - TXT / 2, TXT * 1.4, label, 1) }

  /* ── S1 지붕 골조 평면 (가로 = Y 길이, 세로 = X 스팬) ── */
  {
    const W = mm(G.length), H = mm(spec.span)
    sheet(W, H, 'S1  ROOF FRAMING PLAN')
    const P = (y: number, x: number) => [ox + mm(y), mm(x)] as const
    frameYs.forEach((y, i) => {
      const [x0, y0] = P(y, 0), [, y1] = P(y, spec.span)
      d.line('GRID', x0, y0 - 1500, x0, y1 + 1500)
      gridBubble(x0, y1 + 2000, String(i + 1))
    })
    for (const [x, lab] of [[0, 'A'], [spec.span, 'B']] as const) {
      const [xa, ya] = P(0, x), [xb] = P(G.length, x)
      d.line('GRID', xa - 1500, ya, xb + 1500, ya)
      gridBubble(xa - 2000, ya, lab)
    }
    for (const e of model.elements) {
      if (e.addition && e.addition!=='roof-trimmer') continue
      const [a, b] = ends(e)
      const plan = e.role === 'rafter' || e.role === 'purlin' || e.role === 'strut' || (e.role === 'brace' && e.face === 'roof')
      if (!plan) continue
      const [x1, y1] = P(a.y, a.x), [x2, y2] = P(b.y, b.x)
      d.line(LAYER_OF[e.role], x1, y1, x2, y2)
    }
    /* 풍주 위치 (박공 프레임) */
    for (const e of model.elements) if (!e.addition && e.role === 'post' && nodes.get(e.n1)!.z === 0) { const n = nodes.get(e.n1)!; const [x, y] = P(n.y, n.x); d.circle('POST', x, y, 200) }
    d.dim('DIM', ox, 0, ox + W, 0, 2500, TXT, spec.bayList?.length ? `${G.spans.map(mm).join(' + ')} = ${mm(G.length)}` : `${spec.bays} @ ${mm(spec.baySpacing)} = ${mm(G.length)}`)
    d.dim('DIM', ox + W, 0, ox + W, H, -2500, TXT, String(mm(spec.span)))
    d.text('TEXT', ox, -3200, TXT, `Purlin ${spec.sections.purlin} @ ${Math.round(mm(G.sRoof))}  Strut ${spec.sections.strut}  Roof brace ${spec.sections.brace}`)
    ox += W + 2 * M + 3000
  }

  /* ── S2 대표 프레임 입면 (내부 프레임, X–Z) ── */
  {
    const yF = frameYs[Math.min(1, frameYs.length - 1)]
    const W = mm(spec.span), H = mm(G.ridgeZ)
    sheet(W, H, `S2  TYPICAL FRAME ELEVATION (GRID ${Math.min(2, frameYs.length)})`, 6500) // 아래 주석: 주각 -4200, 경사 -5400
    for (const e of model.elements) {
      if (e.addition) continue
      const [a, b] = ends(e)
      if (!(near(a.y, yF) && near(b.y, yF)) || (e.role !== 'column' && e.role !== 'rafter')) continue
      d.line(LAYER_OF[e.role], ox + mm(a.x), mm(a.z), ox + mm(b.x), mm(b.z))
    }
    /* 퍼린 점 */
    for (const x of G.xs) d.circle('PURLIN', ox + mm(x), mm(G.zAt(x)) + 150, 80)
    gridBubble(ox, -2000, 'A'); gridBubble(ox + W, -2000, 'B')
    d.line('GRID', ox, -1500, ox, H + 800); d.line('GRID', ox + W, -1500, ox + W, H + 800)
    d.dim('DIM', ox, 0, ox + W, 0, 3500, TXT)
    d.dim('DIM', ox, 0, ox, mm(spec.eaveHeight), 1500, TXT)
    /* 박공: 마루 상승 치수 / 편경사: 오른쪽 높은 처마 높이 */
    if (G.ridges.length) { const rx = G.ridges.length > 1 ? ox + mm(G.ridges[0]) : ox + W / 2; d.dim('DIM', rx, mm(spec.eaveHeight), rx, H, -800, TXT, `${Math.round(mm(G.rise))}`) }
    else d.dim('DIM', ox + W, 0, ox + W, H, -1500, TXT)
    d.text('TEXT', ox + 300, mm(spec.eaveHeight) / 2, TXT, `COL ${spec.sections.column}`, 0, 90)
    d.text('TEXT', ox + W / 4, mm(G.zAt(spec.span / 4)) + 500, TXT, `RAFTER ${spec.sections.rafter}`, 1)
    const cn = (t: string) => connections?.find((c) => c.type === t)
    const base = cn('base'), knee = cn('knee'), apex = cn('apex')
    if (base) d.text('TEXT', ox, -4200, TXT * 0.8, `BASE: ${base.dims.plate}, ${base.dims.anchors}`)
    if (knee) d.text('TEXT', ox, mm(spec.eaveHeight) + 600, TXT * 0.8, `KNEE: ${knee.dims.plate}, ${knee.dims.bolts}`)
    if (apex) d.text('TEXT', ox + W / 2, H + 600, TXT * 0.8, `APEX: ${apex.dims.plate}, ${apex.dims.bolts}`, 1)
    d.text('TEXT', ox + W / 2, -5400, TXT * 0.8, `Base ${spec.baseFixity.toUpperCase()}  Slope 1:${Math.round(1 / spec.roofSlope)}`, 1)
    ox += W + 2 * M + 3000
  }

  /* ── S3 측벽 입면 (x = 0, Y–Z) ── */
  {
    const W = mm(G.length), H = mm(spec.eaveHeight)
    sheet(W, H, 'S3  SIDE WALL ELEVATION (GRID A)')
    for (const e of model.elements) {
      if (e.addition) continue
      const [a, b] = ends(e)
      const onWall = near(a.x, 0) && near(b.x, 0) && (e.role === 'column' || e.role === 'girt' || (e.role === 'brace' && e.face === 'x0') || (e.role === 'strut' && near(a.z, spec.eaveHeight)))
      if (onWall) d.line(LAYER_OF[e.role], ox + mm(a.y), mm(a.z), ox + mm(b.y), mm(b.z))
    }
    frameYs.forEach((y, i) => gridBubble(ox + mm(y), -2000, String(i + 1)))
    d.dim('DIM', ox, 0, ox + W, 0, 3500, TXT)
    d.dim('DIM', ox, 0, ox, H, 1500, TXT)
    d.text('TEXT', ox, H + 700, TXT, `Girt ${spec.sections.girt} @ ${Math.round(mm(G.gWall))}  Wall brace ${spec.sections.brace}`)
    ox += W + 2 * M + 3000
  }

  /* ── S4 박공벽 입면 (y = 0, X–Z) ── */
  {
    const W = mm(spec.span), H = mm(G.ridgeZ)
    sheet(W, H, 'S4  GABLE WALL ELEVATION (GRID 1)')
    for (const e of model.elements) {
      if (e.addition) continue
      const [a, b] = ends(e)
      if (!(near(a.y, 0) && near(b.y, 0))) continue
      if (e.role === 'column' || e.role === 'rafter' || e.role === 'post' || e.role === 'girt') d.line(LAYER_OF[e.role], ox + mm(a.x), mm(a.z), ox + mm(b.x), mm(b.z))
    }
    for (const x of G.postXs) d.text('TEXT', ox + mm(x) + 150, 600, TXT * 0.8, `POST ${spec.sections.post}`, 0, 90)
    d.dim('DIM', ox, 0, ox + W, 0, 3500, TXT)
    let px = 0
    for (const x of [...G.postXs, spec.span]) { d.dim('DIM', ox + mm(px), 0, ox + mm(x), 0, 2000, TXT * 0.8); px = x }
    ox += W + 2 * M + 3000
  }

  /* ── S5 일람표 + 표제란 ── */
  {
    const W = 26000, rowH = 600
    const sch = memberSchedule(spec, model)
    const conns = connections ?? []
    const H = (sch.rows.length + conns.length + 16) * rowH + 6000
    sheet(W, H, 'S5  SCHEDULES')
    let y = H - 2000
    const cols = [0, 3500, 9500, 12500, 16000, 19500]
    const rowTxt = (cells: string[], xs = cols) => { cells.forEach((c, i) => d.text('TEXT', ox + xs[i] + 150, y + 150, TXT * 0.9, c)); d.line('GRID', ox, y, ox + W, y); y -= rowH }
    d.text('TEXT', ox, y + 400, TXT * 1.2, 'MEMBER SCHEDULE'); y -= rowH
    rowTxt(['TYPE', 'SECTION', model.additions?'PHYSICAL':'ELEMS', 'LENGTH (m)', 'kg/m', 'WEIGHT (t)'])
    for (const r of sch.rows) rowTxt([r.addition ? ({'platform-column':'Platform column','platform-beam':'Platform beam','runway-beam':'Runway beam','opening-header':'Door header','roof-trimmer':'Roof trimmer','floor-trimmer':'Floor edge beam'}[r.addition]) : ROLE_EN[r.role], r.section, String(r.count), r.length.toFixed(1), r.kgPerM.toFixed(1), r.weight.toFixed(2)])
    rowTxt(['TOTAL', '', '', '', '', sch.total.toFixed(2)])
    y -= rowH
    d.text('TEXT', ox, y + 400, TXT * 1.2, 'CONNECTION SCHEDULE'); y -= rowH
    const cc = [0, 4000, 22800] // 상세 문구 최대 110자 → 비율 열과 겹치지 않게
    rowTxt(['TYPE', 'DETAIL', 'RATIO'], cc)
    const CN: Record<string, string> = { base: 'Column base', knee: 'Knee', apex: 'Apex splice', brace: 'Brace end' }
    for (const c of conns) rowTxt([CN[c.type], Object.values(c.dims).join(', ').slice(0, 110), c.ratio.toFixed(3)], cc)
    y -= rowH
    rowTxt(['RESTRAINTS: ' + restraintKeys(spec).map((k) => `${k}=${support(spec, k)}`).join('; ')])
    rowTxt(['Assumed restraints need design verification of stiffness, connections and anchorage.'])
    rowTxt(['EXCLUDED: gable-post bases, cleats, fly braces, sag rods, brace crossing connectors, cladding.'])
    if (spec.frame === 'multi') rowTxt(['MULTI-SPAN: interior column-top / valley connections and gutters require separate design and takeoff.'])
    if (model.additions) rowTxt(['ADDITIONS: rails/brackets, door hardware, connections and new foundations excluded. Modeled steel included.'])
    /* 표제란 */
    const tbY = -M + 300, tbW = 12000
    d.rect('BORDER', ox + W + M - tbW - 300, tbY, tbW, 3000)
    d.text('TEXT', ox + W + M - tbW, tbY + 2200, TXT, title.replace(/[^\x20-\x7e]/g, '').trim() || 'STEEL PORTAL FACTORY')
    d.text('TEXT', ox + W + M - tbW, tbY + 1500, TXT * 0.8, `SPAN ${spec.span} m x ${G.length} m, EAVE ${spec.eaveHeight} m, ${spec.material}`)
    d.text('TEXT', ox + W + M - tbW, tbY + 800, TXT * 0.8, `CODE: ${spec.code} ${profileOf(spec.code).method} (${spec.code === 'CN' ? 'GB50017-2017 / GB55006-2021' : spec.code === 'KR' ? 'KDS 41 30 10 / KDS 14 31 10' : `Gen NX ${profileOf(spec.code).gen.designCode}`})  UNITS: mm  DATE ${new Date().toISOString().slice(0, 10)}`)
    d.text('TEXT', ox + W + M - tbW, tbY + 200, TXT * 0.7, 'Generated by Steel Frame Agent - check before construction')
  }
  if (model.additions) {
    ox += 26000 + 2 * M + 3000
    const p=spec.features?.mezzanine ? spec.additions?.platform : undefined
    const c=spec.features?.crane ? spec.additions?.crane : undefined
    const W=mm(G.length),H=mm(spec.span)
    sheet(W,H,'S6  ADDITION PLAN - PRELIMINARY',6500)
    d.rect('GRID',ox,0,W,H)
    frameYs.forEach((y,i)=>{d.line('GRID',ox+mm(y),0,ox+mm(y),H);gridBubble(ox+mm(y),H+1500,String(i+1))})
    for (const e of model.elements.filter((e)=>e.addition && e.addition!=='platform-column')) {
      const [a,b]=ends(e); d.line('STRUT',ox+mm(a.y),mm(a.x),ox+mm(b.y),mm(b.x))
    }
    for (const e of spec.additions?.equipment ?? []) {
      d.circle('TEXT',ox+mm(e.y),mm(e.x),300)
      d.text('TEXT',ox+mm(e.y)+400,mm(e.x),TXT,`${e.name.replace(/[^\x20-\x7e]/g,'')||e.id}  ${e.weight} kN`)
    }
    if(p) {
      const beamNodes=new Set(model.elements.filter((e)=>e.addition==='platform-beam').flatMap((e)=>[e.n1,e.n2]))
      const supports=new Set(model.elements.filter((e)=>e.role==='column'||e.role==='post').flatMap((e)=>[e.n1,e.n2]).filter((id)=>beamNodes.has(id) && near(nodes.get(id)!.z,p.elevation)))
      for(const id of supports){const n=nodes.get(id)!;d.circle('POST',ox+mm(n.y),mm(n.x),150)}
    }
    if(c) for(const y of frameYs) for(const x of [0,spec.span]) d.circle('COLUMN',ox+mm(y),mm(x),200)
    d.text('TEXT',ox,-2200,TXT,p?`PLATFORM z=${p.elevation} m; D=${p.dead}, L=${p.live} kN/m2; BEAM ${p.beamSection}`:'Roof equipment locations / crane reaction support locations')
    d.text('TEXT',ox,-3400,TXT*.8,'No rail/bracket, slab/diaphragm, door hardware or connection/foundation detailing.')
    d.text('TEXT',ox,-4600,TXT*.8,'See calculation report for physical member IDs, load sources and project factors.')
    ox+=W+2*M+3000
    const yF=frameYs[p?.firstBay ?? 0]
    sheet(mm(spec.span),mm(G.ridgeZ),'S7  ADDITION FRAME - PRELIMINARY',6500)
    for(const e of model.elements) {
      const [a,b]=ends(e)
      if(!near(a.y,yF)||!near(b.y,yF)||(!e.addition && e.role!=='column' && e.role!=='rafter'))continue
      d.line(LAYER_OF[e.role],ox+mm(a.x),mm(a.z),ox+mm(b.x),mm(b.z))
    }
    if(c) for(const x of [0,spec.span]) {d.circle('COLUMN',ox+mm(x),mm(c.elevation),200);d.text('TEXT',ox+mm(x),mm(c.elevation)+500,TXT*.8,`CRANE z=${c.elevation} m`,x?2:0)}
    d.text('TEXT',ox,-2200,TXT*.8,c?.runway?'RUNWAY: column-axis simple beams; static samples, fatigue / local wheel bearing excluded.':'CRANE: support reactions only; wind/seismic concurrency, fatigue and runway design are separate.')
    d.text('TEXT',ox,-3400,TXT*.8,'PLATFORM: beam grillage; project review of stability, seismic system and foundations required.')
    const o=spec.features?.opening?spec.additions?.wallOpening:undefined
    if(c?.runway || o) {
      ox+=mm(spec.span)+2*M+3000
      sheet(W,mm(G.ridgeZ),'S8  RUNWAY / CLOSED DOOR ELEVATION - PRELIMINARY',6500)
      const wallX=o?.face==='xL'?spec.span:0
      for(const e of model.elements) {
        const [a,b]=ends(e)
        if(!near(a.x,wallX)||!near(b.x,wallX))continue
        d.line(LAYER_OF[e.role],ox+mm(a.y),mm(a.z),ox+mm(b.y),mm(b.z))
      }
      if(o){d.rect('GRID',ox+mm(frameYs[o.bay]),0,mm(frameYs[o.bay+1]-frameYs[o.bay]),mm(o.height));d.text('TEXT',ox,-2200,TXT,`CLOSED DOOR: BAY ${o.bay+1}; H=${o.height.toFixed(3)} m; HEADER ${o.headerSection}`)}
      if(c?.runway)d.text('TEXT',ox,-3400,TXT,`RUNWAY z=${c.elevation} m; ${c.runway.section}; PROJECT LIMIT L/${c.runway.deflectionDivisor}`)
      if(c){const range=craneTravel(spec);d.text('TEXT',ox,-4000,TXT*.8,`CRANE BAYS ${range.firstBay+1}-${range.lastBay+1}; Y=${range.start.toFixed(3)}-${range.end.toFixed(3)} m`)}
      d.text('TEXT',ox,-4600,TXT*.8,'Column jambs retained. Door pressure area retained. Closed-door wind only; hardware/detail design excluded.')
    }
    if(model.additions.voids?.length || spec.additions?.link) {
      ox+=Math.max(W,mm(spec.span))+2*M+3000
      sheet(W,H,'S9  OPENINGS / BUILDING INTERFACE - PRELIMINARY',9000)
      d.rect('GRID',ox,0,W,H)
      frameYs.forEach((y,i)=>{d.line('GRID',ox+mm(y),0,ox+mm(y),H);gridBubble(ox+mm(y),H+1500,String(i+1))})
      let rowY=-2000
      for(const v of model.additions.voids??[]) {
        d.rect('STRUT',ox+mm(v.y0),mm(v.x0),mm(v.y1-v.y0),mm(v.x1-v.x0))
        d.text('TEXT',ox,rowY,TXT,`${v.kind==='roof'?'CLOSED ROOF HATCH':'FLOOR VOID'} ${v.id}: A=${v.area.toFixed(2)} m2; z=${v.z0.toFixed(2)}..${v.z1.toFixed(2)} m`);rowY-=1200
      }
      const link=spec.additions?.link
      if(link) {
        d.circle('POST',ox+mm(frameYs[link.frame]),mm(link.face==='x0'?0:spec.span),300)
        const r=linkReview(link)
        d.text('TEXT',ox,rowY,TXT,`LINK INTERFACE ${link.mode}: FRAME ${link.frame+1}; z=${link.elevation} m; GAP=${link.availableGapMm} mm; DEMAND=${r.required} mm`);rowY-=1200
        d.text('TEXT',ox,rowY,TXT*.8,'External building / bridge not modeled. Only confirmed interface reactions transfer to this factory.');rowY-=1200
      }
      d.text('TEXT',ox,rowY,TXT*.8,'Closed roof cover load area retained; floor void load area excluded. Connections and local details need separate review.')
    }
  }
  return d
}
