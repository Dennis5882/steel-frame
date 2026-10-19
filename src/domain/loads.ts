/* 하중 케이스·하중·하중조합 → Gen NX 페이로드 (순수 함수). 단위 kN, m.
   케이스: D(자중+마감) · LR(지붕 활하중) · EX/EY(정적 등가 지진)
           WX1~4(횡방향 풍 +X: 지붕 풍상 Cp high/low × ±GCpi) · WY1~2(종방향 풍 +Y: ±GCpi)
           WLX·WLY(횡풍향 풍력 2.10: W_L = 0.87(L/B)·W_D, 풍향 직각) · WT(풍 비틀림 2.11: M_T = 0.28·max(B·W_D)).
   풍 조합 (2.12 간이식): 순풍향 단독 + 0.841·W_D + 0.7(W_L ± W_T) — 대칭 구조라 (+,+)·(+,−) 두 변형이면 미러로 나머지 포함.
   벽 하중은 거트(측벽·박공벽)와 처마 스트럿, 박공 상부(최상단 거트 위 반 칸 + 삼각부)는 박공 지붕보에 재하.
   반대 방향 풍(−X·−Y)은 대칭 구조라 미러 결과로 대체. 미구현: 우발편심(2.14)·수직지진(2.18). */
import { profileOf } from '../codes'
import type { ComboKind, LoadCaseType } from '../codes'
import { portalGeometry } from './portal'
import type { Face, FactoryModel, FactorySpec, Node } from './types'
import { nodeWeights } from './weights'
import { BASIN } from '../codes/twSites'
import { buildCnLoads } from './cnLoads'
import { buildKrLoads, type KrLoadInfo } from './krLoads'
import { additionErrors, factoryOnly, hasAdditions } from './additions'
import { buildAdditionLoads } from './additionLoads'
import type { AdditionModel, AdditionFactors } from './additionTypes'

export interface LoadInfo {
  additions?: { sources: AdditionModel['sources']; craneCases: AdditionModel['craneCases']; serviceCases: string[]; factors?: AdditionFactors; combinationBasis?: Record<string,string>; preliminary: true }
  snow?: number
  /** CN: 퍼린 설계용 최대 적설 (kN/m², GB 51022 4.3.5-1 불균등 최악) — 없으면 snow */
  snowPeak?: number
  /** CN: GB 51022 수직지진 비율(4.4.2-3, 0 = 없음)·풍 끝 구역 폭 2a (m) */
  cn?: { verticalRatio: number; endZone: number }
  /** KR: KDS 중간값 (스펙트럼·가스트·적설 계수) — 계산서 표시 */
  kr?: KrLoadInfo
  /** 지붕 활하중 (kN/m², 수평투영) */
  roofLive: number
  seismic: Record<'X' | 'Y', { T: number; c: number; cStar: number; cV: number; cMin: number; cM: number; gov: string; V: number; Fu: number; R: number; Mt: number }> & { W: number }
  /** 조합 이름 → 용도 (basic 이 아닌 것은 일반 부재 검토에서 제외) */
  comboKind: Record<string, ComboKind>
  /** 증폭 지진력 계수 Ω = E′/E (방향별) */
  omega: Record<'X' | 'Y', number>
  wind: {
    qh: number; hRef: number; cases: { name: string; dir: 'X' | 'Y'; roofCp: number; gcpi: number }[]; windwardRoofCp: { low: number; high: number }
    /** 2.10~2.12: 순풍향 합력 W_D (kN), 횡풍향 W_L (kN), 비틀림 M_T (kN·m), 순풍향 계수 kD */
    across: { WDx: number; WDy: number; WLX: number; WLY: number; MT: number; kD: number }
    /** 풍 변형 — 조합·변위각 계산용 (케이스 × 계수) */
    variants: { tag: string; dir: 'X' | 'Y'; parts: { lc: string; f: number }[] }[]
  }
}

export interface LoadPayloads {
  STLD: Record<string, unknown>
  BODF: Record<string, unknown>
  BMLD: Record<string, unknown>
  CNLD: Record<string, unknown>
  'LCOM-GEN': Record<string, unknown>
  info: LoadInfo
}

type Dir = 'GX' | 'GY' | 'GZ'
/** 조합 변형 — parts: (케이스, 계수) 목록 */
interface Variant { parts: { lc: string; f: number }[]; tag: string }

/** 벽 바깥 법선 (단위 벡터, x·y 성분) */
const OUT: Record<Exclude<Face, 'roof'>, [number, number]> = { x0: [-1, 0], xL: [1, 0], y0: [0, -1], yL: [0, 1] }

export function buildLoadPayloads(spec: FactorySpec, model: FactoryModel): LoadPayloads {
  const errors = additionErrors(spec)
  if (errors.length) throw new Error(`Unconfirmed/invalid additions: ${errors.map((e)=>e.path).join(', ')}`)
  const base=factoryOnly(model), removed=model.additions?.removedGirts ?? []
  const virtual=removed.map((e,i)=>({...e,id:base.elements.length+i+1,loadOnly:true as const}))
  const roof=model.additions?.roofCollectors??[]
  const roofVirtual=roof.map((v,i)=>({...v.original,id:base.elements.length+virtual.length+i+1,loadOnly:true as const}))
  const load = buildFactoryLoads(spec, {...base,elements:[...base.elements,...virtual,...roofVirtual]})
  // Closed door loads follow the original horizontal cladding strips: lower strips
  // transfer to jamb columns; the top strip loads the new header. No ghost steel.
  const transfers=virtual.map((e)=>({e,items:(load.BMLD[e.id] as {ITEMS:any[]}|undefined)?.ITEMS ?? []}))
  const roofTransfers=roofVirtual.map((e,i)=>({collector:roof[i],items:(load.BMLD[e.id] as {ITEMS:any[]}|undefined)?.ITEMS??[]}))
  for(const e of [...virtual,...roofVirtual]) delete load.BMLD[e.id]
  const header=model.elements.find((e)=>e.addition==='opening-header')
  for(const {e,items} of transfers) {
    const a=model.nodes[e.n1-1],b=model.nodes[e.n2-1],L=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)
    if(header && Math.abs(a.z-model.nodes[header.n1-1].z)<1e-7) {
      load.BMLD[header.id]={ITEMS:items.map((it,i)=>({...it,ID:i+1}))}
      continue
    }
    for(const it of items) {
      if(it.TYPE!=='UNILOAD' || it.P[0]!==it.P[1] || !['GX','GY','GZ'].includes(it.DIRECTION)) throw new Error('Unsupported door load transfer')
      for(const id of [e.n1,e.n2]) {
        const rec=(load.CNLD[id] ??= {ITEMS:[]}) as {ITEMS:any[]}
        let item=rec.ITEMS.find((v)=>v.LCNAME===it.LCNAME)
        if(!item){item={ID:rec.ITEMS.length+1,LCNAME:it.LCNAME,GROUP_NAME:'',FX:0,FY:0,FZ:0,MX:0,MY:0,MZ:0};rec.ITEMS.push(item)}
        item[{GX:'FX',GY:'FY',GZ:'FZ'}[it.DIRECTION as 'GX'|'GY'|'GZ']]+=it.P[0]*L/2
      }
    }
  }
  for(const {collector,items} of roofTransfers) for(const [i,key] of collector.keys.entries()) {
    const share=collector.shares[i]
    if(share<1e-9)continue
    const target=model.elements.find((e)=>e.physicalKey===key)
    if(!target)throw new Error('Roof collector has no physical trimmer')
    const rec=(load.BMLD[target.id]??={ITEMS:[]}) as {ITEMS:any[]}
    for(const it of items)rec.ITEMS.push({...it,ID:rec.ITEMS.length+1,P:it.P.map((v:number)=>v*share)})
  }
  return buildAdditionLoads(spec, model, load)
}

function buildFactoryLoads(spec: FactorySpec, model: FactoryModel): LoadPayloads {
  if (spec.code === 'CN') return buildCnLoads(spec, model)
  if (spec.code === 'KR') return buildKrLoads(spec, model)
  const prof = profileOf(spec.code)
  const lat = prof.lateral
  const { span, eaveHeight, roofSlope } = spec
  const G = portalGeometry(spec)
  const { sRoof, gWall, theta, length } = G
  const cosT = Math.cos(theta), sinT = Math.sin(theta)
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const ends = (id: number): [Node, Node] => { const e = model.elements[id - 1]; return [nodeById.get(e.n1)!, nodeById.get(e.n2)!] }
  /** 박공 지붕보 요소 — y 가 0 또는 길이 */
  const gableOf = (a: Node): 'y0' | 'yL' | null => (a.y === 0 ? 'y0' : Math.abs(a.y - length) < 1e-9 ? 'yL' : null)
  /** 박공 상부 띠 높이 — 최상단 거트가 위로 반 칸(gWall/2)을 받으므로 그 위부터 지붕선까지. 요소 중점 x 기준 */
  const topGirt = (x: number) => { const zs = G.endGirtZs.filter((z) => z < G.zAt(x) - 1e-6); return zs.length ? zs[zs.length - 1] : 0 }
  const stripH = (x: number) => Math.max(0, G.zAt(x) - topGirt(x) - G.gEnd / 2)
  /** 벽 거트 분담 높이 — 측벽은 그 벽 높이의 거트 간격(편경사는 좌우 다름), 박공벽은 박공벽 간격 */
  const wallTrib = (face: Exclude<Face, 'roof'>) => (face === 'x0' ? G.gWallAt(G.eaveXs[0]) : face === 'xL' ? G.gWallAt(G.eaveXs[G.eaveXs.length - 1]) : G.gEnd)

  /* ── 보하중 누적 ── */
  const BMLD: Record<string, { ITEMS: unknown[] }> = {}
  const deadLine = new Map<number, number>() // 요소별 마감 고정하중 kN/m (지진 무게용)
  /** 케이스별 하중 합력 (kN) — 순풍향 W_D 산정용 */
  const total = new Map<string, { x: number; y: number }>()
  const elLen = (id: number) => { const [a, b] = ends(id); return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) }
  const addLine = (elemId: number, lc: string, dir: Dir, w: number) => {
    if (Math.abs(w) < 1e-9) return
    const t = total.get(lc) ?? { x: 0, y: 0 }
    if (dir === 'GX') t.x += w * elLen(elemId)
    if (dir === 'GY') t.y += w * elLen(elemId)
    total.set(lc, t)
    const items = (BMLD[elemId] ??= { ITEMS: [] }).ITEMS
    items.push({
      ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: dir,
      USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [w, w, 0, 0],
    })
  }
  const addDead = (id: number, w: number) => { addLine(id, 'D', 'GZ', -w); deadLine.set(id, (deadLine.get(id) ?? 0) + w) }

  /* ── 중력: D, LR ── */
  const qLive = prof.roofLive({ slope: roofSlope, tribArea: Math.min(...portalGeometry(spec).spans) * sRoof * cosT }) // 불균등 베이: 최소 베이 (면적 작을수록 하중 큼 → 보수적)
  for (const e of model.elements) {
    const [a, b] = ends(e.id)
    if (e.role === 'girt') { addDead(e.id, spec.wallDead * (e.face && e.face !== 'roof' ? wallTrib(e.face) : gWall)); continue }
    if (e.role === 'rafter') {
      const g = gableOf(a)
      if (g) addDead(e.id, spec.wallDead * stripH((a.x + b.x) / 2)) // 박공 상부 벽 → 박공 지붕보
      continue
    }
    if (e.role !== 'purlin' && e.role !== 'strut') continue
    /* 지붕: 처마 스트럿 = 반 간격 + 측벽 반 칸, 마루 스트럿 = 양쪽 반 간격 = 1 간격, 퍼린 = 1 간격 */
    const eave = !!G.eaveSide(a.x)
    const sTrib = G.roofTrib(a.x).reduce((t, r) => t + r.trib, 0)
    addDead(e.id, spec.roofDead * sTrib + (eave ? spec.wallDead * (G.gWallAt(a.x) / 2) : 0))
    addLine(e.id, 'LR', 'GZ', -(qLive * sTrib * cosT))
  }

  /* ── 지진: 절점 무게 × 높이 분배 (2.11), 단일 층이므로 Ft 는 T > 0.7s 일 때만 ── */
  const W = nodeWeights(spec, model, (id) => deadLine.get(id) ?? 0)
  const Wtot = [...W.values()].reduce((x, y) => x + y, 0)
  const hn = G.hMean // 기면~평균 지붕면
  const si = spec.seismic
  const CNLD: Record<string, { ITEMS: unknown[] }> = {}
  const seismic = { W: Wtot } as LoadInfo['seismic']
  let denom = 0
  for (const n of model.nodes) denom += (W.get(n.id) ?? 0) * n.z
  const zTop = Math.max(...model.nodes.map((n) => n.z))
  const topW = model.nodes.filter((n) => n.z === zTop).reduce((x, n) => x + (W.get(n.id) ?? 0), 0)
  for (const dir of ['X', 'Y'] as const) {
    const T = lat.period(dir === 'X' ? 'moment' : 'braced', hn)
    const basin = si.county === BASIN
    const cf = lat.seismicCoef({ SDS: si.SDS, SD1: si.SD1, SMS: si.SMS, SM1: si.SM1, basin, I: si.I, R: dir === 'X' ? si.Rx : si.Ry, T })
    const V = cf.c * Wtot
    const Ft = T > 0.7 ? Math.min(0.07 * T * V, 0.25 * V) : 0
    for (const n of model.nodes) {
      const w = W.get(n.id) ?? 0
      let F = denom > 0 ? ((V - Ft) * w * n.z) / denom : 0
      if (Ft > 0 && n.z === zTop && topW > 0) F += (Ft * w) / topW
      if (F === 0) continue
      const items = (CNLD[n.id] ??= { ITEMS: [] }).ITEMS
      items.push({ ID: items.length + 1, LCNAME: `E${dir}`, GROUP_NAME: '', FX: dir === 'X' ? F : 0, FY: dir === 'Y' ? F : 0, FZ: 0, MX: 0, MY: 0, MZ: 0 })
    }
    /* cStar 는 I = 1.0 으로 재계산 (2.16.1 — 용도계수 > 1 건물도 I = 1 로 변위 산정 가능) */
    const cStar1 = lat.seismicCoef({ SDS: si.SDS, SD1: si.SD1, basin, I: 1.0, R: dir === 'X' ? si.Rx : si.Ry, T }).cStar
    /* 2.14 우발 비틀림: 질심을 직각 방향 치수의 5% 이동 → Mt = V·0.05·B⊥ (X 지진: B⊥ = 건물 길이, Y: 스팬). 비틀림 비정형 Ax 증폭은 미적용 */
    const Mt = V * 0.05 * (dir === 'X' ? length : span)
    seismic[dir] = { T, c: cf.c, cStar: cStar1, cV: cf.cV, cMin: cf.cMin, cM: cf.cM, gov: cf.gov, V, Fu: cf.Fu, R: dir === 'X' ? si.Rx : si.Ry, Mt }
  }

  /* ── 풍. 封閉/部分封閉 건물 MWFRS p = q·G·Cp − q_i·(GCpi) (風力規範 2.2), p > 0 = 면을 향하는 압력 ── */
  const wi = spec.wind
  /* 風力規範 符號 h — θ < 10° 이면 처마 높이. 편경사는 처마가 둘이라 평균 지붕 높이(높은 쪽 쪽으로 보수적) */
  const hRef = theta < (10 * Math.PI) / 180 && G.symmetric ? eaveHeight : G.hMean
  const qOf = (z: number) => lat.windQ(z, { V10: wi.V10, I: wi.I, exposure: wi.exposure })
  const qh = qOf(hRef)
  const Gf = lat.gust
  const gpi = lat.gcpi(wi.enclosure)
  const rc = lat.roofCp({ thetaDeg: (theta * 180) / Math.PI, hOverL: hRef / span })
  const SIDE_CP = -0.7 // 표2.4 측풍면
  const ROOF_PARALLEL_CP = Math.max(hRef / span, hRef / length) <= 2.5 ? -0.7 : -0.8 // 표2.5 풍향 ∥ 용마루

  /** from: X 풍이 불어오는 측벽. 대칭(박공)은 x0 만 — 반대 방향은 미러. 비대칭(편경사)은 xL 풍도 별도 케이스(WX5~8) */
  interface WindCase { name: string; dir: 'X' | 'Y'; s: 1 | -1; roofW: number; roofL: number; from?: 'xL'; fromY?: 'yL' }
  const windCases: WindCase[] = [
    { name: 'WX1', dir: 'X', s: 1, roofW: rc.high, roofL: rc.leeward }, { name: 'WX2', dir: 'X', s: -1, roofW: rc.high, roofL: rc.leeward },
    { name: 'WX3', dir: 'X', s: 1, roofW: rc.low, roofL: rc.leeward }, { name: 'WX4', dir: 'X', s: -1, roofW: rc.low, roofL: rc.leeward },
    ...(G.symmetric && !hasAdditions(spec) ? [] : [
      { name: 'WX5', dir: 'X', s: 1, roofW: rc.high, roofL: rc.leeward, from: 'xL' }, { name: 'WX6', dir: 'X', s: -1, roofW: rc.high, roofL: rc.leeward, from: 'xL' },
      { name: 'WX7', dir: 'X', s: 1, roofW: rc.low, roofL: rc.leeward, from: 'xL' }, { name: 'WX8', dir: 'X', s: -1, roofW: rc.low, roofL: rc.leeward, from: 'xL' },
    ] as WindCase[]),
    { name: 'WY1', dir: 'Y', s: 1, roofW: ROOF_PARALLEL_CP, roofL: ROOF_PARALLEL_CP }, { name: 'WY2', dir: 'Y', s: -1, roofW: ROOF_PARALLEL_CP, roofL: ROOF_PARALLEL_CP },
    ...(hasAdditions(spec) ? [{ name: 'WY3', dir: 'Y', s: 1, roofW: ROOF_PARALLEL_CP, roofL: ROOF_PARALLEL_CP, fromY: 'yL' }, { name: 'WY4', dir: 'Y', s: -1, roofW: ROOF_PARALLEL_CP, roofL: ROOF_PARALLEL_CP, fromY: 'yL' }] as WindCase[] : []),
  ]
  /** 表2.8 鋸齒狀屋頂 — 풍상 쪽부터 경사면 순서: D(첫 풍상면)·E(첫 풍하면)·D′·E′·D″ … 의 위치.
      첫 면이 풍을 마주보지 않으면(편경사 높은 쪽 풍) 그 면은 E 부터. 박공 = D·E 로 表2.5 와 같음 */
  const facePos = (plane: number, from?: 'xL') => {
    const n = G.planes.length
    const order = from ? n - 1 - plane : plane
    const firstFacing = from ? !G.planes[n - 1].rising : G.planes[0].rising
    return order + (firstFacing ? 0 : 1)
  }
  /** 위치별 Cp — D 表2.5 풍상, E·D′ 表2.5 풍하, E′·D″ −0.5, E″·D‴ −0.4, 그 뒤 −0.3. null = 表2.5 값(케이스의 roofW·roofL) */
  const SAW_CP = [null, null, null, -0.5, -0.5, -0.4, -0.4, -0.3]
  for (const wc of windCases) {
    const pi = qh * wc.s * gpi
    /** 벽면 순압력 p(z) — 풍상벽 0.8·q(z), 풍하벽 Cp(L/B)·q(h), 측벽 −0.7·q(h) */
    const wallP = (face: Exclude<Face, 'roof'>, z: number): number => {
      const windward = wc.dir === 'X' ? (wc.from ?? 'x0') : wc.fromY ?? 'y0'
      const leeward = wc.dir === 'X' ? (wc.from ? 'x0' : 'xL') : wc.fromY ? 'y0' : 'yL'
      const LB = wc.dir === 'X' ? span / length : length / span // L = 풍향 평행, B = 직각
      if (face === windward) return qOf(z) * Gf * lat.wallCp.windward - pi
      if (face === leeward) return qh * Gf * lat.wallCp.leeward(LB) - pi
      return qh * Gf * SIDE_CP - pi
    }
    /** 벽 하중 (kN/m) → 전역 성분: 힘 = p × 폭 × (−바깥 법선) */
    const wallForce = (id: number, face: Exclude<Face, 'roof'>, z: number, trib: number) => {
      const f = wallP(face, z) * trib
      const [ox, oy] = OUT[face]
      addLine(id, wc.name, 'GX', -f * ox)
      addLine(id, wc.name, 'GY', -f * oy)
    }
    for (const e of model.elements) {
      const [a, b] = ends(e.id)
      if (e.role === 'girt' && e.face && e.face !== 'roof') { wallForce(e.id, e.face, a.z, wallTrib(e.face)); continue }
      if (e.role === 'rafter') {
        const g = gableOf(a)
        if (g) wallForce(e.id, g, (a.z + b.z) / 2, stripH((a.x + b.x) / 2))
        continue
      }
      if (e.role !== 'purlin' && e.role !== 'strut') continue
      /* 지붕 — 풍(x0 → xL)을 마주보는 면(rising) = 풍상, 법선 (−sinθ, 0, cosθ) / 반대면 = 풍하, (sinθ, 0, cosθ). 힘 = p·s·(−법선).
         절점이 분담하는 면마다(G.roofTrib) 더하고, 처마면 측벽 반 칸 */
      const pW = qh * Gf * wc.roofW - pi, pL = qh * Gf * wc.roofL - pi
      let fx = 0, fz = 0
      for (const { plane, trib } of G.roofTrib(a.x)) {
        /* X 풍: 表2.8 면 순서 계수 (다경간·편경사 공통, 박공은 表2.5 그대로). Y 풍: 용마루 평행 계수 */
        const rising = G.planes[plane].rising
        const pos = facePos(plane, wc.from), saw = SAW_CP[Math.min(pos, SAW_CP.length - 1)]
        const p = wc.dir !== 'X' || pos === 0 ? pW : saw === null ? pL : qh * Gf * saw - pi
        if (rising) { fx += p * trib * sinT; fz += -p * trib * cosT }
        else { fx += -p * trib * sinT; fz += -p * trib * cosT }
      }
      const side = G.eaveSide(a.x)
      if (side) { const f = wallP(side, G.zAt(a.x)) * (G.gWallAt(a.x) / 2); fx += side === 'x0' ? f : -f }
      addLine(e.id, wc.name, 'GX', fx)
      addLine(e.id, wc.name, 'GZ', fz)
    }
  }

  /* ── 횡풍향·비틀림 (2.10·2.11) — 단층: W_D = 순풍향 케이스의 수평 합력(내압은 상쇄), 방향별 최대 ── */
  const WDx = Math.max(0, ...windCases.filter((c) => c.dir === 'X').map((c) => Math.abs(total.get(c.name)?.x ?? 0)))
  const WDy = Math.max(0, ...windCases.filter((c) => c.dir === 'Y').map((c) => Math.abs(total.get(c.name)?.y ?? 0)))
  /* X 풍: 풍향 길이 L = 스팬, 직각 폭 B = 건물 길이 / Y 풍: L = 길이, B = 스팬 */
  const WLX = 0.87 * (span / length) * WDx, WLY = 0.87 * (length / span) * WDy
  const MT = 0.28 * Math.max(length * WDx, span * WDy)
  const kD = 1 / (1.128 * Gf) + 0.7 * ((1.128 * Gf - 1) / (1.128 * Gf)) // 2.12 간이식 순풍향 계수 (G = 1.88 → 0.841)
  /** 벽 거트에 균등 선하중 — 합력 F 를 거트 총길이로 나눔 */
  const spread = (lc: string, faces: Face[], dir: Dir, F: number) => {
    const gs = model.elements.filter((e) => e.role === 'girt' && e.face && faces.includes(e.face))
    const Ltot = gs.reduce((s, e) => s + elLen(e.id), 0)
    if (Ltot > 0) for (const e of gs) addLine(e.id, lc, dir, F / Ltot)
  }
  spread('WLX', ['y0', 'yL'], 'GY', WLX) // X 풍의 횡풍향 = +Y, 박공벽
  spread('WLY', ['x0', 'xL'], 'GX', WLY) // Y 풍의 횡풍향 = +X, 측벽
  /* 비틀림 +Z(반시계): 측벽 x = 스팬 에 +Y, x = 0 에 −Y 우력 (가새 측벽이 저항) — 처마 스트럿(RH) 축방향 선하중.
     거트(냉간성형)에 축력을 주지 않으려고 스트럿에 재하 (가새 베이로 직접 전달) */
  for (const [x, sgn] of [[span, 1], [0, -1]] as const) {
    const ss = model.elements.filter((e) => e.role === 'strut' && ends(e.id).every((n) => n.x === x && G.isEaveNode(n)))
    const Ls = ss.reduce((t, e) => t + elLen(e.id), 0)
    if (Ls > 0) for (const e of ss) addLine(e.id, 'WT', 'GY', (sgn * MT) / span / Ls)
  }

  /** 측벽 처마 스트럿 ±Y 우력으로 연직축 비틀림 M (반시계 +) — 가새 측벽이 저항 */
  const torsionCouple = (lc: string, M: number) => {
    for (const [x, sgn] of [[span, 1], [0, -1]] as const) {
      const ss = model.elements.filter((e) => e.role === 'strut' && ends(e.id).every((n) => n.x === x && G.isEaveNode(n)))
      const Ls = ss.reduce((t, e) => t + elLen(e.id), 0)
      if (Ls > 0) for (const e of ss) addLine(e.id, lc, 'GY', (sgn * M) / span / Ls)
    }
  }
  torsionCouple('ETX', seismic.X.Mt)
  torsionCouple('ETY', seismic.Y.Mt)

  /* ── 하중조합: 종류별 변형 전개 (E 는 ±, W 는 케이스 자체가 방향·내압 변형 + 2.12 조합 변형) ── */
  const windVariants: (Variant & { dir: 'X' | 'Y' })[] = [
    ...windCases.map((v) => ({ dir: v.dir, tag: ` ${v.name}`, parts: [{ lc: v.name, f: 1 }] })),
    ...windCases.flatMap((v) => ([1, -1] as const).flatMap((ts) =>
      /* 횡풍향 WLY(+X)는 비대칭(편경사)이면 −X 도 — WLX(+Y)는 길이 방향 대칭이라 미러 */
      ((v.dir === 'Y' && !G.symmetric) || hasAdditions(spec) ? [1, -1] as const : [1] as const).map((ls) => ({
        dir: v.dir, tag: ` ${v.name}${ls > 0 ? '+' : '-'}L${ts > 0 ? '+' : '-'}T`,
        parts: [{ lc: v.name, f: kD }, { lc: v.dir === 'X' ? 'WLX' : 'WLY', f: 0.7 * ls }, { lc: 'WT', f: 0.7 * ts }],
      })))),
  ]
  const variants: Record<LoadCaseType, Variant[]> = {
    S: [],
    D: [{ parts: [{ lc: 'D', f: 1 }], tag: '' }],
    L: [{ parts: [{ lc: 'LR', f: 1 }], tag: '' }],
    W: windVariants,
    /* 지진 + 우발 비틀림(같은 부호) — 대칭 구조라 (±E, ∓ET) 는 미러로 포함. 비대칭(편경사)은 반대 부호도 */
    E: (['EX', 'EY'] as const).flatMap((n) => [
      { parts: [{ lc: n, f: 1 }, { lc: `ET${n[1]}`, f: 1 }], tag: ` +${n}` },
      { parts: [{ lc: n, f: -1 }, { lc: `ET${n[1]}`, f: -1 }], tag: ` -${n}` },
      ...(G.symmetric && !hasAdditions(spec) ? [] : [
        { parts: [{ lc: n, f: 1 }, { lc: `ET${n[1]}`, f: -1 }], tag: ` +${n}-T` },
        { parts: [{ lc: n, f: -1 }, { lc: `ET${n[1]}`, f: 1 }], tag: ` -${n}+T` },
      ]),
    ]),
  }
  const LCOM: Record<string, unknown> = {}
  const comboKind: Record<string, ComboKind> = {}
  const omega = { X: 1, Y: 1 }
  const sc = prof.seismicCombos
  if (sc) for (const d of ['X', 'Y'] as const) omega[d] = sc.omega(seismic[d].Fu)
  let no = 0
  const all: (ReturnType<typeof prof.combos>[number] & { kind: ComboKind })[] = [
    ...prof.combos({ heavyLive: false }).map((c) => ({ ...c, kind: 'basic' as const })),
    ...(sc?.combos({ heavyLive: false }) ?? []),
  ]
  for (const c of all) {
    const wOrE = c.terms.map(([k]) => k).find((k) => k === 'W' || k === 'E')
    const amp = c.kind === 'amplified'
    for (const v of wOrE ? variants[wOrE] : [null]) {
      no++
      /* E′: 지진 케이스 계수 × Ω(방향) — 이름에 ′ 표시 */
      const om = amp && v ? omega[v.parts[0].lc === 'EX' ? 'X' : 'Y'] : 1
      const name = `${prof.method} ${c.ref}${amp && v ? `${v.tag}′` : v?.tag ?? ''}`
      comboKind[name] = c.kind
      LCOM[no] = {
        NAME: name, ACTIVE: 'ACTIVE', iTYPE: 0,
        DESC: c.terms.map(([k, f]) => `${f}${k}${amp && k === 'E' ? `′(${om.toFixed(2)})` : ''}`).join('+'),
        vCOMB: c.terms.flatMap(([k, f]) => {
          const vv = k === 'W' || k === 'E' ? v! : variants[k][0]
          return vv.parts.map((p) => ({ ANAL: 'ST', LCNAME: p.lc, FACTOR: f * p.f * (k === 'E' ? om : 1) }))
        }),
      }
    }
  }

  const STLD: Record<string, unknown> = {}
  const cases: [string, string, string][] = [
    ['D', 'D', 'Dead'], ['LR', 'LR', 'Roof live'], ['EX', 'E', 'Seismic X'], ['EY', 'E', 'Seismic Y'],
    ...windCases.map((v): [string, string, string] => [v.name, 'W', `Wind ${v.dir}`]),
    ['WLX', 'W', 'Across-wind (X wind)'], ['WLY', 'W', 'Across-wind (Y wind)'], ['WT', 'W', 'Wind torsion'],
    ['ETX', 'E', 'Accidental torsion X'], ['ETY', 'E', 'Accidental torsion Y'],
  ]
  cases.forEach(([name, type, desc], i) => { STLD[i + 1] = { NAME: name, TYPE: type, DESC: desc } })

  return {
    STLD,
    BODF: { 1: { LCNAME: 'D', GROUP_NAME: '', FV: [0, 0, -1] } },
    BMLD,
    CNLD,
    'LCOM-GEN': LCOM,
    info: {
      roofLive: qLive, seismic, comboKind, omega,
      wind: {
        qh, hRef, cases: windCases.map((v) => ({ name: v.name, dir: v.dir, roofCp: v.roofW, gcpi: v.s * gpi })), windwardRoofCp: { low: rc.low, high: rc.high },
        across: { WDx, WDy, WLX, WLY, MT, kD },
        variants: windVariants.map((v) => ({ tag: v.tag.trim(), dir: v.dir, parts: v.parts })),
      },
    },
  }
}
