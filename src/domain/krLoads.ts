/* 한국 KDS 하중 → Gen NX 페이로드 (순수 함수). 단위 kN, m. TW·CN 식은 쓰지 않는다.
   - 고정 D: 자중(BODF) + 지붕·벽 마감 (퍼린·거트·처마/마루 스트럿·박공 지붕보)
   - 지붕활하중 LR: KDS 41 12 00 표 3.2-1 L0 1.0 + 3.6.1 저감 (퍼린 부하면적 — 골조에는 보수적)
   - 적설 SN: 4.3 S_f = 0.7·Ce·Ct·Is·Sg (4.3.5 최소), 4.4 S_s = Cs·S_f (연속 경간 4.4.4 Cs = 1), 4.7.1 비 0.25.
     불균형 4.5.1 단경간 박공 15° < θ ≤ 70°: 풍상면 0, 풍하면 1.5S_s/Ce (SN1·SN2) / 4.5.3 다경간: 마루 0.5S_f → 골 2S_f/Ce (적설면 높이 한도, SNU)
   - 지진 KDS 41 17 00 7.2 등가정적: V = Cs·W (W = D + 평지붕 적설 > 1.5 kN/m² 이면 20%), 7.2.5 w·h^k 분배, 7.2.6.4 우발비틀림 0.05·B⊥ (양방향),
     8.1.3.3 범주 D 직교 100% + 30%. R = 3 (표 6.2-1 강구조기준 일반규정만 만족하는 철골구조시스템 — 내진상세 2단계)
   - 풍 KDS 41 12 00 5.2·5.3: 벽 G_D·q_H·(C_pe − C_pi), 지붕 G_pe·q_H·(C_pe − C_pi). 표 5.7-1 구역별 계수, 표 5.7-4 C_pi 두 값,
     5.13.1 풍직각방향 W_LC = γW_D (γ = 0.35D/B ≥ 0.2) 동시 작용 (밀폐형만), 5.13.3 지붕 + 수평 동시
   - KDS 14 31 15 4.3.2 유효길이법 가상하중 N = 0.002Y — 중력만의 조합에만 (NXD·NXL·NXS·NYD…) */
import { ccRangeKR } from '../codes/krWindCC'
import { KR, roofLiveKR } from '../codes/kr'
import {
  CPI_KR, csKR, distK, flatRoofCpeKR, flatSnowKR, gustKR, isPartialKR, IS_KR, IW_KR, kzKR, leewardRoofCpeKR, periodKR, roofGustKR,
  sdcKR, SEISMIC_GRADE, regionZoneKR, sMinKR, slopeCsKR, spectrumKR, SYSTEMS_KR, velocityKR, wallCpeKR, windwardRoofCpeKR, areaKa, type SpectrumKR,
} from '../codes/krLateral'
import type { ComboKind, LoadCaseType } from '../codes'
import type { LoadInfo, LoadPayloads } from './loads'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import { nodeWeights } from './weights'
import { hasAdditions } from './additions'
import { baySpans, frameSpans, type Face, type FactoryModel, type FactorySpec, type Node } from './types'

/** 계산서·결과 탭 표시용 KDS 중간값 */
export interface KrLoadInfo {
  spectrum: SpectrumKR; sdc: 'A' | 'B' | 'C' | 'D'; IE: number; grade: '특' | 'I' | 'II'; driftLimit: number; orth30: boolean
  /** 방향별 지진력저항시스템 (표 6.2-1) — 6.3 직교 방향마다 각자의 R·Ω0·Cd */
  sys: Record<'X' | 'Y', { key: string; R: number; Om: number; Cd: number; row: string }>
  VH: number; Kzr: number; Iw: number; GD: { X: number; Y: number }; Gpe: { X: number; Y: number }; resonant: { X: boolean; Y: boolean }; nR0: number
  cpi: readonly [number, number]; gammaL: { X: number; Y: number }
  Sf: number; Is: number; Cs: number; Ss: number; snowMin: number; rain: number; unbalanced: 'none' | 'gable' | 'multi'
}

export function validateKrSpec(spec: FactorySpec): void {
  const k = spec.korea
  if (!k) throw new Error('KDS project inputs are required')
  if (!(k.V0 >= 20 && k.V0 <= 60)) throw new Error('KDS 41 12 00 5.5.2: V0 must be 20–60 m/s (figure 5.5-1)')
  if (!(k.KD >= 0.85 && k.KD <= 1)) throw new Error('KDS 41 12 00 5.5.3: K_D must be 0.85–1.0')
  if (!(k.Kzt >= 1 && k.Kzt <= 3)) throw new Error('KDS 41 12 00 5.5.5: K_zt must be 1.0–3.0')
  if (!(k.roofZeta > 0 && k.roofZeta <= 0.1)) throw new Error('KDS 41 12 00 5.6.4: roof damping ratio must be 0–0.1')
  if (!(k.Sg >= 0.5 && k.Sg <= 10)) throw new Error('KDS 41 12 00 4.2.1(3): Sg must be ≥ 0.5 kN/m²')
  if (!(k.Ce >= 0.8 && k.Ce <= 1.2 && k.Ct >= 1 && k.Ct <= 1.2)) throw new Error('KDS 41 12 00 4.3: Ce 0.8–1.2, Ct 1.0–1.2')
  if (!(k.S > 0 && k.S <= 0.4)) throw new Error('KDS 41 17 00 3.2: S must be 0–0.4 g')
  /* KDS 17 10 00 표 4.2-1 — 고른 행정구역의 지진구역과 일치, KDS 41 17 00 3.2 — 지진위험지도 S ≥ 0.8·Z·2.0 */
  const rz = regionZoneKR(k.region)
  if (rz && rz !== k.zone) throw new Error(`KDS 17 10 00 table 4.2-1: ${k.region} is seismic zone ${rz === '1' ? 'I' : 'II'}`)
  if (k.S < sMinKR(k.zone) - 1e-9) throw new Error(`KDS 41 17 00 3.2: S ≥ 0.8 × Z × 2.0 = ${sMinKR(k.zone).toFixed(3)} g`)
  if (!(k.cpi in CPI_KR)) throw new Error('KDS 41 12 00 table 5.7-4: invalid enclosure class')
  /* 5.6.2 강체(n_D > 1 Hz) G_D 만 구현 — 근사주기 Ta ≥ 1 s 면 5.6.1 유연 G_D 필요 */
  if (periodKR('moment', portalGeometry(spec).hMean) >= 1) throw new Error('KDS 41 12 00 5.6.1: flexible building (n_D ≤ 1 Hz) gust factor is not implemented')
  /* 외장재 피크외압계수 표 5.8-2~5.8-4 = 기준높이 20 m 미만, 편지붕 θ ≤ 30° (그 밖 표 5.8-1·톱니 등은 미구현) */
  const G = portalGeometry(spec), deg = G.theta * 180 / Math.PI
  if (G.hMean >= 20) throw new Error('KDS 41 12 00 5.4.1: cladding wind for H ≥ 20 m (table 5.8-1) is not implemented')
  if (!ccRangeKR(spec.frame === 'mono' ? 'mono' : spec.frame === 'multi' ? 'multi' : 'gable', deg)) throw new Error('KDS 41 12 00 table 5.8-3: mono-slope cladding coefficients only up to 30°')
  for (const name of Object.values(spec.sections)) { const p = sectionProps(name, spec.code); if (![p.A, p.Ix, p.Iy, p.rx, p.ry].every((x) => Number.isFinite(x) && x > 0)) throw new Error(`KDS: invalid section ${name}`) }
}

type Dir = 'GX' | 'GY' | 'GZ'
interface Part { lc: string; f: number }
const OUT: Record<Exclude<Face, 'roof'>, [number, number]> = { x0: [-1, 0], xL: [1, 0], y0: [0, -1], yL: [0, 1] }

export function buildKrLoads(spec: FactorySpec, model: FactoryModel): LoadPayloads {
  validateKrSpec(spec)
  const k = spec.korea!, G = portalGeometry(spec)
  const { length, sRoof, gWall, theta } = G, span = spec.span
  const cos = Math.cos(theta), sin = Math.sin(theta), deg = theta * 180 / Math.PI
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const elById = new Map(model.elements.map((e) => [e.id, e]))
  const ends = (e: FactoryModel['elements'][number]): [Node, Node] => [nodes.get(e.n1)!, nodes.get(e.n2)!]
  const BMLD: Record<string, { ITEMS: unknown[] }> = {}, CNLD: Record<string, { ITEMS: unknown[] }> = {}
  const total: Record<string, { x: number; y: number }> = {}
  /** 케이스·요소별 연직 선하중 (가상하중용, kN/m 아래 +) */
  const vertical: Record<string, Map<number, number>> = {}
  const elLen = (id: number) => { const [a, b] = ends(elById.get(id)!); return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) }
  const add = (id: number, lc: string, dir: Dir, w: number) => {
    if (Math.abs(w) < 1e-12) return
    const items = (BMLD[id] ??= { ITEMS: [] }).ITEMS
    items.push({ ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: dir, USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [w, w, 0, 0] })
    const t = total[lc] ??= { x: 0, y: 0 }
    if (dir === 'GX') t.x += w * elLen(id)
    if (dir === 'GY') t.y += w * elLen(id)
    if (dir === 'GZ') { const m = vertical[lc] ??= new Map(); m.set(id, (m.get(id) ?? 0) - w) }
  }
  const topGirt = (x: number) => G.endGirtZs.filter((z) => z < G.zAt(x) - 1e-6).at(-1) ?? 0
  const strip = (x: number) => Math.max(0, G.zAt(x) - topGirt(x) - G.gEnd / 2)
  const wallTrib = (face: Exclude<Face, 'roof'>) => (face === 'x0' ? G.gWallAt(G.eaveXs[0]) : face === 'xL' ? G.gWallAt(G.eaveXs[G.eaveXs.length - 1]) : G.gEnd)
  const gable = (a: Node): 'y0' | 'yL' | null => a.y === 0 ? 'y0' : Math.abs(a.y - length) < 1e-8 ? 'yL' : null
  const imp = k.importance

  /* ── 중력: D, LR, 적설 ── */
  const qLive = roofLiveKR(spec.roofSlope, sRoof * cos * Math.min(...baySpans(spec)))
  const Is = IS_KR[imp]
  const multi = G.ridges.length > 1
  const flat = flatSnowKR({ Sg: k.Sg, Ce: k.Ce, Ct: k.Ct, Is, thetaDeg: deg })
  const Sf0 = 0.7 * k.Ce * k.Ct * Is * k.Sg
  const Cs = multi ? 1 : slopeCsKR(deg, k.Ct) // 4.4.4 연속 경간 Cs = 1
  /* 4.7.1 S_g ≤ 1.0 이고 θ ≤ (w/15)° (w = 처마~용마루 수평거리) 이면 비 0.25 kN/m² 추가 (최소설하중에는 미적용) */
  const wRun = spec.frame === 'mono' ? spec.span : Math.max(...frameSpans(spec)) / 2
  const rain = k.Sg <= 1.0 && deg <= wRun / 15 ? 0.25 : 0
  const Ss = Math.max(Cs * Sf0 + rain, deg <= 15 ? flat.min : 0)
  const unbalanced: KrLoadInfo['unbalanced'] = multi ? 'multi' : spec.frame !== 'mono' && deg > 15 && deg <= 70 ? 'gable' : 'none'
  const snowCases = unbalanced === 'gable' ? ['SN', 'SN1', 'SN2'] : unbalanced === 'multi' ? ['SN', 'SNU'] : ['SN']
  /* 4.5.3 다경간 불균형: 마루 0.5S_f → 골 2S_f/Ce, 골 적설면 ≤ 마루 적설면 → 골 하중 ≤ 0.5S_f + γ_s·(마루−골 높이), γ_s = 0.43S_g + 2.2 ≤ 4.7 (4.5-1). 바깥 처마 쪽 면은 0.5S_f */
  const gammaS = Math.min(0.43 * k.Sg + 2.2, 4.7)
  const widths = frameSpans(spec), colXs = widths.reduce<number[]>((a, w) => [...a, a[a.length - 1] + w], [0])
  const multiSnow = (x: number): number => {
    const i = Math.max(0, Math.min(widths.length - 1, colXs.findIndex((c, j) => j > 0 && x <= c + 1e-9) - 1))
    const half = widths[i] / 2, ridge = colXs[i] + half
    const toValley = x < ridge - 1e-9 ? i > 0 : x > ridge + 1e-9 ? i < widths.length - 1 : false
    if (!toValley) return 0.5 * Ss
    const peak = Math.min(2 * Ss / k.Ce, 0.5 * Ss + gammaS * half * spec.roofSlope)
    return 0.5 * Ss + (peak - 0.5 * Ss) * Math.min(1, Math.abs(x - ridge) / half)
  }
  const dead = new Map<number, number>(), snowLine = new Map<number, number>()
  for (const e of model.elements) {
    const [a, b] = ends(e)
    let w = 0
    if (e.role === 'girt') w = spec.wallDead * (e.face && e.face !== 'roof' ? wallTrib(e.face) : gWall)
    if (e.role === 'rafter' && gable(a)) w = spec.wallDead * strip((a.x + b.x) / 2)
    if (e.role === 'purlin' || e.role === 'strut') {
      const eave = !!G.eaveSide(a.x), rt = G.roofTrib(a.x), trib = rt.reduce((t, r) => t + r.trib, 0)
      w = spec.roofDead * trib + (eave ? spec.wallDead * G.gWallAt(a.x) / 2 : 0)
      add(e.id, 'LR', 'GZ', -qLive * trib * cos)
      snowLine.set(e.id, Ss * trib * cos)
      for (const lc of snowCases) {
        let q = Ss * trib
        if (lc === 'SN1' || lc === 'SN2') {
          /* SN1 = +X 풍(x0 → xL): 풍상(오르막 면) 0, 풍하면 1.5S_s/Ce. 마루 절점은 면별 합 */
          q = rt.reduce((t, r) => t + r.trib * (G.planes[r.plane].rising === (lc === 'SN1') ? 0 : 1.5 * Ss / k.Ce), 0)
        }
        if (lc === 'SNU') q = multiSnow(a.x) * trib
        add(e.id, lc, 'GZ', -q * cos)
      }
    }
    if (w) { add(e.id, 'D', 'GZ', -w); dead.set(e.id, w) }
  }

  /* ── 지진 (KDS 41 17 00 7.2) ── */
  const sp = spectrumKR(k.S, k.site)
  const sg = SEISMIC_GRADE[imp]
  const sdc = sdcKR(sp.SDS, sp.SD1, imp)
  const sys = { X: { key: k.systemX ?? 'general', ...SYSTEMS_KR[k.systemX ?? 'general'] }, Y: { key: k.systemY ?? 'general', ...SYSTEMS_KR[k.systemY ?? 'general'] } }
  const detailed = sys.X.key !== 'general' || sys.Y.key !== 'general'
  const snowW = flat.Sf > 1.5 ? 0.2 : 0 // 7.2.1 ④ 평지붕 적설 > 1.5 kN/m² 이면 20%
  const weights = nodeWeights(spec, model, (id) => (dead.get(id) ?? 0) + snowW * (snowLine.get(id) ?? 0))
  const W = [...weights.values()].reduce((a, b) => a + b, 0)
  const hn = G.hMean
  const seismic = { W } as LoadInfo['seismic']
  for (const d of ['X', 'Y'] as const) {
    const T = periodKR(d === 'X' ? 'moment' : 'braced', hn)
    const R = sys[d].R
    const cs = csKR(T, sp, R, sg.IE)
    const V = cs.c * W, kk = distK(T)
    const denom = model.nodes.reduce((s, n) => s + (weights.get(n.id) ?? 0) * n.z ** kk, 0)
    for (const n of model.nodes) {
      const F = denom > 0 ? V * (weights.get(n.id) ?? 0) * n.z ** kk / denom : 0
      if (!F) continue
      const items = (CNLD[n.id] ??= { ITEMS: [] }).ITEMS
      items.push({ ID: items.length + 1, LCNAME: `E${d}`, GROUP_NAME: '', FX: d === 'X' ? F : 0, FY: d === 'Y' ? F : 0, FZ: 0, MX: 0, MY: 0, MZ: 0 })
    }
    /* 7.2.6.4 우발비틀림 M_ta = 0.05 × 직각 평면치수 × V */
    const Mt = V * 0.05 * (d === 'X' ? length : span)
    seismic[d] = { T, c: cs.c, cStar: cs.c, cV: cs.cV, cMin: cs.cMin, cM: cs.cMax, gov: `KDS 41 17 00 ${cs.gov}`, V, Fu: 1, R, Mt }
  }
  /** 측벽 처마 스트럿 ±Y 우력으로 연직축 비틀림 M (반시계 +) — 가새 측벽이 저항 */
  const couple = (lc: string, M: number) => {
    for (const [x, sgn] of [[span, 1], [0, -1]] as const) {
      const ss = model.elements.filter((e) => e.role === 'strut' && ends(e).every((n) => Math.abs(n.x - x) < 1e-9 && G.isEaveNode(n)))
      const Ls = ss.reduce((t, e) => t + elLen(e.id), 0)
      if (Ls > 0) for (const e of ss) add(e.id, lc, 'GY', sgn * M / span / Ls)
    }
  }
  couple('ETX', seismic.X.Mt)
  couple('ETY', seismic.Y.Mt)

  /* ── 풍 (KDS 41 12 00 5장) ── */
  const H = G.hMean // 5.1.2(4) 지붕 평균높이
  const { VH, qH, Kzr } = velocityKR({ V0: k.V0, KD: k.KD, Kzt: k.Kzt, Iw: IW_KR[imp], H, cat: k.exposure })
  const GD = { X: gustKR(H, length, k.exposure), Y: gustKR(H, span, k.exposure) }
  /* 지붕보 1차 고유진동수 — 단순보 근사 f = (π/2L²)√(EI/m) (양단 강접 골조보다 낮음 → G_pe 보수적).
     m = 지붕 마감 + 지붕보 + 퍼린(분담) 질량 / 길이 */
  const wSpan = Math.max(...frameSpans(spec)), bay = spec.baySpacing, mat = KR.materials[spec.material]
  const raf = sectionProps(spec.sections.rafter, spec.code), pur = sectionProps(spec.sections.purlin, spec.code)
  const mLine = (spec.roofDead * bay + mat.gamma * (raf.A + pur.A * bay / spec.purlinSpacing) * 1e-6) * 1000 / 9.80665 // kg/m
  const nR0 = Math.PI / (2 * wSpan ** 2) * Math.sqrt(mat.E * 1e6 * raf.Ix * 1e-12 / mLine)
  const gpe = (parallel: boolean, l: number) => roofGustKR({ H, VH, cat: k.exposure, l, b: bay, parallel, nR0, zeta: k.roofZeta })
  const gX = gpe(true, wSpan), gY = gpe(false, wSpan)
  const Gpe = { X: gX.Gpe, Y: gY.Gpe }
  const cpi = CPI_KR[k.cpi]
  const enclosed = !isPartialKR(k.cpi)
  const ka = areaKa(bay * 0.5 * H)

  interface WindCase { name: string; dir: 'X' | 'Y'; from: 'x0' | 'xL' | 'y0' | 'yL'; r: 0 | 1; ci: 0 | 1 }
  const windCases: WindCase[] = []
  const froms: ('x0' | 'xL')[] = G.symmetric && !hasAdditions(spec) ? ['x0'] : ['x0', 'xL']
  for (const from of froms) for (const r of [0, 1] as const) for (const ci of [0, 1] as const)
    windCases.push({ name: `WX${windCases.filter((w) => w.dir === 'X').length + 1}`, dir: 'X', from, r, ci })
  /* Y 풍: 길이 대칭이면 y0 쪽만 (yL 쪽은 거울) */
  const bl0 = baySpans(spec), ySym0 = !hasAdditions(spec) && bl0.every((v, i) => Math.abs(v - bl0[bl0.length - 1 - i]) < 1e-9)
  for (const from of ySym0 ? ['y0'] as const : ['y0', 'yL'] as const) for (const r of [0, 1] as const) for (const ci of [0, 1] as const)
    windCases.push({ name: `WY${windCases.filter((w) => w.dir === 'Y').length + 1}`, dir: 'Y', from, r, ci })
  /** 풍상측부터 지붕면 순서 — 0 = 첫 풍상면(바람을 마주볼 때) */
  const faceOrder = (plane: number, from: 'x0' | 'xL') => {
    const n = G.planes.length, order = from === 'x0' ? plane : n - 1 - plane
    const facing = from === 'x0' ? G.planes[plane].rising : !G.planes[plane].rising
    return { order, facing }
  }
  const roofCases: { name: string; dir: 'X' | 'Y'; roofCp: number; gcpi: number }[] = []
  for (const wc of windCases) {
    const ci = cpi[wc.ci]
    const DX = wc.dir === 'X' ? span : length, BX = wc.dir === 'X' ? length : span // D = 풍방향 깊이, B = 풍직각 폭
    const DB = DX / BX, HD = H / DX, gd = GD[wc.dir], gp = Gpe[wc.dir]
    const windward = wc.from, leeward = ({ x0: 'xL', xL: 'x0', y0: 'yL', yL: 'y0' } as const)[wc.from]
    /** 벽 순압력 (kN/m², + = 면을 향함). dist = 풍상벽 끝단에서의 수평거리 (측벽 구역) */
    const wallP = (face: Exclude<Face, 'roof'>, z: number, dist: number) => {
      const cpe = face === windward ? wallCpeKR.windward(kzKR(Math.max(z, 1e-3), H, k.exposure), DB)
        : face === leeward ? wallCpeKR.leeward(DB) : wallCpeKR.side(dist, H)
      return gd * qH * (cpe - ci)
    }
    const distOf = (a: Node, b: Node) => {
      const xm = (a.x + b.x) / 2, ym = (a.y + b.y) / 2
      return wc.from === 'y0' ? ym : wc.from === 'yL' ? length - ym : wc.from === 'x0' ? xm : span - xm
    }
    const wall = (id: number, face: Exclude<Face, 'roof'>, z: number, trib: number, dist: number) => {
      const p = wallP(face, z, dist) * trib, [ox, oy] = OUT[face]
      add(id, wc.name, 'GX', -ox * p); add(id, wc.name, 'GY', -oy * p)
    }
    for (const e of model.elements) {
      const [a, b] = ends(e)
      if (e.role === 'girt' && e.face && e.face !== 'roof') { wall(e.id, e.face, a.z, wallTrib(e.face), distOf(a, b)); continue }
      if (e.role === 'rafter') { const f = gable(a); if (f) wall(e.id, f, (a.z + b.z) / 2, strip((a.x + b.x) / 2), distOf(a, b)); continue }
      if (e.role !== 'purlin' && e.role !== 'strut') continue
      let fx = 0, fz = 0
      const dist = distOf(a, b)
      for (const { plane, trib } of G.roofTrib(a.x)) {
        let cpe: number
        if (wc.dir === 'Y' || deg < 10) cpe = flatRoofCpeKR(dist, H, HD, ka)[wc.r] // θ < 10° 직각·모든 경사 평행: 풍상 끝단에서 거리별
        else {
          /* θ ≥ 10° 직각: 첫 풍상면 = 풍상 표, 그 밖 면 = 풍하 표 (편지붕은 전체가 풍상 또는 풍하 — 주 4) */
          const { order, facing } = faceOrder(plane, wc.from as 'x0' | 'xL')
          cpe = order === 0 && facing ? windwardRoofCpeKR(deg, HD)[wc.r] : spec.frame === 'mono' && facing ? windwardRoofCpeKR(deg, HD)[wc.r] : leewardRoofCpeKR(deg, HD, BX / DX)
        }
        const p = gp * qH * (cpe - ci)
        if (G.planes[plane].rising) { fx += p * trib * sin; fz -= p * trib * cos } else { fx -= p * trib * sin; fz -= p * trib * cos }
      }
      const side = G.eaveSide(a.x)
      if (side) { const f = wallP(side, G.zAt(a.x), dist) * G.gWallAt(a.x) / 2; fx += side === 'x0' ? f : -f }
      add(e.id, wc.name, 'GX', fx); add(e.id, wc.name, 'GZ', fz)
    }
    /* 표시용 대표값 — 풍상 끝단 구역 / 첫 풍상면 */
    roofCases.push({ name: wc.name, dir: wc.dir, roofCp: wc.dir === 'Y' || deg < 10 ? flatRoofCpeKR(0, H, HD, ka)[wc.r] : windwardRoofCpeKR(deg, HD)[wc.r], gcpi: ci })
  }
  /* 5.13.1 풍직각방향 조합하중 W_LC = γ·W_D, γ = 0.35·D/B ≥ 0.2 — 밀폐형만, 풍방향 하중과 동시 */
  const WDx = Math.max(0, ...windCases.filter((c) => c.dir === 'X').map((c) => Math.abs(total[c.name]?.x ?? 0)))
  const WDy = Math.max(0, ...windCases.filter((c) => c.dir === 'Y').map((c) => Math.abs(total[c.name]?.y ?? 0)))
  const gammaL = { X: Math.max(0.35 * span / length, 0.2), Y: Math.max(0.35 * length / span, 0.2) }
  const WLX = enclosed ? gammaL.X * WDx : 0, WLY = enclosed ? gammaL.Y * WDy : 0
  const spread = (lc: string, faces: Face[], dir: Dir, F: number) => {
    const gs = model.elements.filter((e) => e.role === 'girt' && e.face && faces.includes(e.face))
    const Lt = gs.reduce((s, e) => s + elLen(e.id), 0)
    if (Lt > 0) for (const e of gs) add(e.id, lc, dir, F / Lt)
  }
  if (enclosed) { spread('WLX', ['y0', 'yL'], 'GY', WLX); spread('WLY', ['x0', 'xL'], 'GX', WLY) }

  /* ── 가상하중 (KDS 14 31 15 4.2.1.2(2)·4.3.2): N = 0.002 × 중력 선하중, 같은 요소에 수평. 자중은 요소마다 0.002·γA ── */
  const notional: Record<string, string> = { D: 'D', L: 'LR', S: 'SN' }
  for (const [tag, lc] of Object.entries(notional)) {
    if (tag === 'S' && !snowCases.length) continue
    for (const d of ['X', 'Y'] as const) {
      const name = `N${d}${tag}`
      for (const e of model.elements) {
        let w = vertical[lc]?.get(e.id) ?? 0
        if (tag === 'D' && !e.loadOnly) w += mat.gamma * sectionProps(e.section, spec.code).A * 1e-6
        if (e.role !== 'brace') { add(e.id, name, d === 'X' ? 'GX' : 'GY', 0.002 * w); continue }
        /* 가새 = Gen TRUSS — 보 하중 불가("Beam Loads cannot be entered", 라이브 2026-10-16) → 양 끝 절점에 반씩 */
        const F = 0.002 * w * elLen(e.id) / 2
        if (Math.abs(F) < 1e-12) continue
        /* 한 절점에 같은 케이스 항목이 둘이면 Gen 은 하나만 남긴다(라이브 2026-10-16) → 합산 */
        for (const nid of [e.n1, e.n2]) {
          const items = (CNLD[nid] ??= { ITEMS: [] }).ITEMS as { LCNAME: string; FX: number; FY: number }[]
          const prev = items.find((it) => it.LCNAME === name)
          if (prev) { prev.FX += d === 'X' ? F : 0; prev.FY += d === 'Y' ? F : 0 }
          else items.push({ ID: items.length + 1, LCNAME: name, GROUP_NAME: '', FX: d === 'X' ? F : 0, FY: d === 'Y' ? F : 0, FZ: 0, MX: 0, MY: 0, MZ: 0 } as never)
        }
        const t = total[name] ??= { x: 0, y: 0 }
        if (d === 'X') t.x += 2 * F; else t.y += 2 * F
      }
    }
  }

  /* ── 하중조합 (KDS 41 12 00 1.7.1) ──
     대칭 축소: 좌우 대칭(xSym, x → 스팬 − x)·길이 대칭(ySym, 베이 간격 회문)이면 거울상 조합은 거울 위치 부재의 결과와 같다 →
     각 궤도에서 하나만 (모든 부재를 검토하므로 최댓값 동일). 거울: x → (EX, ET 부호 반전) · y → (EY, ET 부호 반전) */
  const xSym = G.symmetric && !hasAdditions(spec)
  const ySym = ySym0
  const orth30 = sdc === 'D' // 8.1.3.3 범주 D: 직교 100% + 30%
  const eVariants: { parts: Part[]; tag: string }[] = []
  for (const [m, o] of [['X', 'Y'], ['Y', 'X']] as const) {
    const seen = new Set<string>()
    for (const s1 of [1, -1]) for (const s3 of [1, -1]) for (const s2 of orth30 ? [1, -1] : [0]) {
      /* (sEX·sEY 성분, sET) — m 방향 주, o 방향 30% */
      const sx = m === 'X' ? s1 : s2, sy = m === 'X' ? s2 : s1
      const orbit = [[sx, sy, s3]]
      if (xSym) orbit.push(...orbit.map(([a, b, c]) => [-a, b, -c]))
      if (ySym) orbit.push(...orbit.map(([a, b, c]) => [a, -b, -c]))
      if (orbit.some((v) => seen.has(v.join()))) continue
      seen.add([sx, sy, s3].join())
      const parts: Part[] = [{ lc: `E${m}`, f: s1 }, { lc: `ET${m}`, f: s3 }]
      if (s2) parts.push({ lc: `E${o}`, f: 0.3 * s2 })
      eVariants.push({ parts, tag: ` ${s1 > 0 ? '+' : '-'}E${m}${s3 > 0 ? '+' : '-'}T${s2 ? `${s2 > 0 ? '+' : '-'}0.3E${o}` : ''}` })
    }
  }
  /* 풍직각 ±: X 풍(+Y 방향 WLX)은 길이 대칭이면 거울, Y 풍(+X 방향 WLY)은 좌우 대칭이면 거울 */
  const wVariants: { parts: Part[]; tag: string; dir: 'X' | 'Y' }[] = windCases.flatMap((c) => (enclosed
    ? ((c.dir === 'X' ? ySym : xSym) ? [1] as const : [1, -1] as const).map((sg) => ({ dir: c.dir, tag: ` ${c.name}${sg > 0 ? '+' : '-'}L`, parts: [{ lc: c.name, f: 1 }, { lc: c.dir === 'X' ? 'WLX' : 'WLY', f: sg }] }))
    : [{ dir: c.dir, tag: ` ${c.name}`, parts: [{ lc: c.name, f: 1 }] }]))
  const sVariants = snowCases.map((lc) => ({ parts: [{ lc, f: 1 }], tag: lc === 'SN' ? '' : ` ${lc}` }))
  /* 가상하중 방향 — 대칭이면 + 만 (거울) */
  const nDirs: { d: 'X' | 'Y'; s: number }[] = [{ d: 'X', s: 1 }, ...(xSym ? [] : [{ d: 'X' as const, s: -1 }]), { d: 'Y', s: 1 }, ...(ySym ? [] : [{ d: 'Y' as const, s: -1 }])]
  const LCOM: Record<string, unknown> = {}, comboKind: Record<string, ComboKind> = {}
  let no = 0
  const emit = (ref: string, tag: string, parts: Part[]) => {
    const name = `${ref}${tag}` // Gen 조합 이름 ≤ 20자 (라이브 2026-10-16) — "KDS " 접두사 없이
    comboKind[name] = 'basic'
    LCOM[++no] = { NAME: name, ACTIVE: 'ACTIVE', iTYPE: 0, DESC: 'KDS 41 12 00 1.7.1', vCOMB: parts.filter((p) => Math.abs(p.f) > 1e-12).map((p) => ({ ANAL: 'ST', LCNAME: p.lc, FACTOR: p.f })) }
  }
  for (const c of KR.combos({ heavyLive: false })) {
    const has = (t: LoadCaseType) => c.terms.some(([x]) => x === t)
    const fac = (t: LoadCaseType) => c.terms.find(([x]) => x === t)?.[1] ?? 0
    let base: { parts: Part[]; tag: string }[] = [{ parts: [{ lc: 'D', f: fac('D') }], tag: '' }]
    if (has('L')) base = base.map((b) => ({ parts: [...b.parts, { lc: 'LR', f: fac('L') }], tag: b.tag }))
    /* 지진 조합(0.2S)은 균형 적설만 — 불균형은 바람에 의한 재분포 */
    if (has('S')) base = base.flatMap((b) => (has('E') ? sVariants.slice(0, 1) : sVariants).map((v) => ({ parts: [...b.parts, ...v.parts.map((p) => ({ ...p, f: p.f * fac('S') }))], tag: b.tag + v.tag })))
    if (has('W')) base = base.flatMap((b) => wVariants.map((v) => ({ parts: [...b.parts, ...v.parts.map((p) => ({ ...p, f: p.f * fac('W') }))], tag: b.tag + v.tag })))
    if (has('E')) base = base.flatMap((b) => eVariants.map((v) => ({ parts: [...b.parts, ...v.parts.map((p) => ({ ...p, f: p.f * fac('E') }))], tag: b.tag + v.tag })))
    const gravityOnly = !has('W') && !has('E')
    for (const b of base) {
      if (!gravityOnly) { emit(c.ref, b.tag, b.parts); continue }
      /* 중력만의 조합 — 가상하중을 같은 계수로 (4.3.2(2)) */
      for (const { d, s } of nDirs) {
        const np: Part[] = [{ lc: `N${d}D`, f: s * fac('D') }]
        if (has('L')) np.push({ lc: `N${d}L`, f: s * fac('L') })
        if (has('S')) np.push({ lc: `N${d}S`, f: s * fac('S') })
        emit(c.ref, `${b.tag} ${s > 0 ? '+' : '-'}N${d}`, [...b.parts, ...np])
      }
    }
  }

  /* 증폭지진하중 (KDS 41 17 00 8.1.2.3, 8.1-1): Em = Ω0·E ± 0.2S_DS·D — 내진상세 계통(R > 3)을 고른 경우만.
     (1.2 + 0.2S_DS)D + Ω0E + 0.2S (1.7-5 기반) · (0.9 − 0.2S_DS)D + Ω0E (1.7-7 기반). 성분마다 그 방향 계통의 Ω0 (6.3).
     용도 'amplified' — 일반 부재 검토에는 쓰지 않고 접합·주각(14 31 60 4.1.5·4.5·4.7.3)·기둥 축력(4.1.3)만 */
  if (detailed) {
    for (const [ref, dF, sF] of [['A5', 1.2 + 0.2 * sp.SDS, 0.2], ['A7', 0.9 - 0.2 * sp.SDS, 0]] as const) for (const v of eVariants) {
      const parts: Part[] = [{ lc: 'D', f: dF }, ...(sF && snowCases.includes('SN') ? [{ lc: 'SN', f: sF }] : []), ...v.parts.map((p) => ({ ...p, f: p.f * sys[p.lc.endsWith('X') ? 'X' : 'Y'].Om }))]
      const name = `${ref}${v.tag}`
      comboKind[name] = 'amplified'
      LCOM[++no] = { NAME: name, ACTIVE: 'ACTIVE', iTYPE: 0, DESC: 'KDS 41 17 00 8.1-1 (Ω0)', vCOMB: parts.map((p) => ({ ANAL: 'ST', LCNAME: p.lc, FACTOR: p.f })) }
    }
  }

  const STLD: Record<string, unknown> = {}
  const cases: [string, string][] = [['D', 'D'], ['LR', 'LR'], ...snowCases.map((n): [string, string] => [n, 'S']), ['EX', 'E'], ['EY', 'E'], ['ETX', 'E'], ['ETY', 'E'],
    ...windCases.map((w): [string, string] => [w.name, 'W']), ...(enclosed ? [['WLX', 'W'], ['WLY', 'W']] as [string, string][] : []),
    ...(['X', 'Y'] as const).flatMap((d) => ['D', 'L', ...(snowCases.length ? ['S'] : [])].map((t): [string, string] => [`N${d}${t}`, 'USER']))]
  cases.forEach(([NAME, TYPE], i) => { STLD[i + 1] = { NAME, TYPE, DESC: `KDS ${NAME}` } })

  const kr: KrLoadInfo = {
    spectrum: sp, sdc, IE: sg.IE, grade: sg.grade, sys, driftLimit: sg.drift, orth30,
    VH, Kzr, Iw: IW_KR[imp], GD, Gpe, resonant: { X: gX.resonant, Y: gY.resonant }, nR0, cpi, gammaL,
    Sf: Sf0, Is, Cs, Ss, snowMin: flat.min, rain, unbalanced,
  }
  return {
    STLD, BODF: { 1: { LCNAME: 'D', GROUP_NAME: '', FV: [0, 0, -1] } }, BMLD, CNLD, 'LCOM-GEN': LCOM,
    info: {
      roofLive: qLive, snow: Ss, seismic, comboKind, omega: { X: sys.X.Om, Y: sys.Y.Om }, kr,
      wind: {
        qh: qH, hRef: H, cases: roofCases,
        windwardRoofCp: { low: Math.min(...roofCases.filter((c) => c.dir === 'X').map((c) => c.roofCp)), high: Math.max(...roofCases.filter((c) => c.dir === 'X').map((c) => c.roofCp)) },
        across: { WDx, WDy, WLX, WLY, MT: 0, kD: 1 },
        variants: wVariants.map((v) => ({ tag: v.tag.trim(), dir: v.dir, parts: v.parts })),
      },
    },
  }
}
