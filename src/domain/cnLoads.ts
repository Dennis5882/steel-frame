/* GB loads for a regular, single-storey, closed portal-frame factory.
   Sources: GB 55001-2021 3.1.13 (load factors — supersede GB 51022 4.5.3), GB 55002-2021 4.3.2;
   GB 51022-2015 门式刚架 4.2 (wind μw·β), 4.3 (snow distribution), 4.4.2-3 (vertical earthquake), 1.0.2 (scope);
   GB 50009-2012 7.2 (μr by slope), 8.2 (μz); GB/T 50011-2010 (2024) 5.1.3–5.2.1, 5.2.5, 5.4.1.
   No Taiwan load factors, periods, amplified seismic or across-wind rules. */
import { CN } from '../codes/cn'
import { muZ, spectrum } from '../codes/cnLateral'
import { BETA_FRAME_CN, edgeACN, mwLongCN, mwTransCN, verticalRatioCN, zone2LenCN, type Internal, type ZoneMW } from '../codes/cnPortal'
import type { LoadCaseType } from '../codes'
import type { LoadInfo, LoadPayloads } from './loads'
import { portalGeometry, type Geometry } from './portal'
import { nodeWeights } from './weights'
import { baySpans, frameSpans, type FactoryModel, type FactorySpec, type Face, type Node } from './types'
import { sectionProps } from './sections'

export function validateCnSpec(spec: FactorySpec): void {
  const c = spec.china
  if (!c) throw new Error('CN project inputs are required')
  if (spec.wind.enclosure !== 'enclosed') throw new Error('GB: this factory model supports closed buildings; dominant openings require a separate pressure model')
  if (!(spec.eaveHeight > 0 && spec.eaveHeight <= 18 && spec.span > 0 && Math.max(...frameSpans(spec)) <= 60 && spec.bays >= 1 && Number.isInteger(spec.bays) && baySpans(spec).every((s) => s > 0) && spec.roofSlope > 0 && spec.roofSlope <= 1 && (spec.frame !== 'mono' || spec.eaveHeight + spec.span * spec.roofSlope <= 18))) throw new Error('GB scope: regular single-storey factory, eave ≤18 m, span ≤60 m, roof slope ≤1')
  for (const k of ['w0', 'topography', 'alphaMax', 'Tg', 'Tx', 'Ty', 'damping', 'snowMu', 'gamma0', 'concreteBearing', 'anchorFt'] as const)
    if (!(Number.isFinite(c[k]) && c[k] > 0)) throw new Error(`GB: invalid ${k}`)
  if (!(c.w0 >= .3 && c.topography >= .75 && c.snow >= 0 && Number.isFinite(c.snow) && c.snowMu >= .9 && c.gamma0 >= 1 && c.Tx <= 6 && c.Ty <= 6 && c.damping >= .045 && c.damping <= .05)) throw new Error('GB: check w0 ≥0.3, topography ≥0.75, snow multiplier ≥0.9, gamma0 ≥1, periods ≤6 s, damping 0.045–0.05')
  /* GB 51022 1.0.2 — 높이 ≤ 18 m·높이/폭 < 1 (μw 표 적용 조건 4.2.2), 그림 4.2.2-1(b) 편坡 θ < 30° */
  const hMean = spec.eaveHeight + Math.max(...frameSpans(spec)) * spec.roofSlope / (spec.frame === 'mono' ? 2 : 4)
  if (hMean > 18) throw new Error('GB 51022 1.0.2: mean roof height must be ≤18 m')
  if (!(hMean < spec.span)) throw new Error('GB 51022 1.0.2: height/width must be < 1')
  if (spec.frame === 'mono' && Math.atan(spec.roofSlope) * 180 / Math.PI >= 30) throw new Error('GB 51022 figure 4.2.2-1(b): mono-slope roof angle must be < 30°')
  if (baySpans(spec).reduce((a, b) => a + b, 0) > 90) throw new Error('GB: the current single temperature unit is limited to 90 m')
  for (const name of Object.values(spec.sections)) { const p = sectionProps(name, spec.code); if (![p.A, p.Ix, p.Iy, p.rx, p.ry].every((x) => Number.isFinite(x) && x > 0)) throw new Error(`GB: invalid section ${name}`) }
  if (spec.secondaryMaterial && spec.secondaryMaterial !== 'Q235B') throw new Error('GB/T 50018: the current cold-formed catalogue is configured for Q235B')
}

/** GB 51022 표 4.3.2 μr (항 1) — θ ≤ 25° 1.0, 60° 이상 0, 사이 직선 */
export function muRoofSnowCN(deg: number): number {
  const angles = [25, 30, 35, 40, 45, 50, 55, 60], mus = [1, .85, .7, .55, .4, .25, .1, 0]
  if (deg <= 25) return 1
  const i = angles.findIndex((a) => deg <= a)
  return i < 0 ? 0 : mus[i - 1] + (mus[i] - mus[i - 1]) * (deg - angles[i - 1]) / (angles[i] - angles[i - 1])
}

/** GB 51022 4.3.2·4.3.5 적설 분포 — 케이스별 지붕면 계수 k(x, 면) (기본 설하중 s0 에 곱함).
    SN 균일 (다경간 1.0), SN1·SN2 단경간 쌍坡 0.75/1.25 (모든 경사, 항 2), SV1·SV2 다경간 골 1.4 / 골 2.0 삼각 (항 3, 경사 > 1/20),
    SH1… 반경간 균일 (4.3.5-2 지붕보 — 쌍坡·다경간은 지붕면별, 편坡는 스팬 절반). halfSpan 케이스는 1.3D+1.5S 에만 조합 */
export function snowShapeCN(spec: FactorySpec, G: Geometry = portalGeometry(spec)) {
  const deg = G.theta * 180 / Math.PI, mu = muRoofSnowCN(deg)
  const multi = G.ridges.length > 1, gable = G.ridges.length === 1
  const uniform = multi ? 1 : mu
  const P = G.planes, last = P.length - 1
  const inner = (p: number) => p > 0 && p < last
  const valleyEnd = (p: number) => (G.valleys.some((v) => Math.abs(v - P[p].xa) < 1e-6) ? P[p].xa : P[p].xb)
  const halves: [number, number][] = spec.frame === 'mono' ? [[0, spec.span / 2], [spec.span / 2, spec.span]] : P.map((p) => [p.xa, p.xb])
  const cases: { name: string; half: boolean; k: (x: number, plane: number) => number }[] = [{ name: 'SN', half: false, k: () => uniform }]
  if (gable) for (const n of ['SN1', 'SN2']) cases.push({ name: n, half: false, k: (_x, p) => (P[p].rising === (n === 'SN1') ? 1.25 : .75) * mu })
  if (multi && spec.roofSlope > 1 / 20 + 1e-12) {
    cases.push({ name: 'SV1', half: false, k: (_x, p) => (inner(p) ? 1.4 : mu) })
    cases.push({ name: 'SV2', half: false, k: (x, p) => {
      if (!inner(p)) return mu
      const v = valleyEnd(p), w = P[p].xb - P[p].xa
      return mu + (2 - mu) * (1 - Math.min(1, Math.abs(x - v) / w))
    } })
  }
  halves.forEach(([xa, xb], j) => cases.push({ name: `SH${j + 1}`, half: true, k: (x, p) => {
    if (spec.frame !== 'mono') return p === j ? uniform : 0
    const inside = x > xa + 1e-6 && x < xb - 1e-6, edge = Math.abs(x - xa) < 1e-6 || Math.abs(x - xb) < 1e-6
    return (inside ? 1 : edge && x > 1e-6 && x < spec.span - 1e-6 ? .5 : edge ? 1 : 0) * uniform
  } }))
  /** 퍼린 설계용 최대 계수 (4.3.5-1 불균등 최악) */
  const peakAt = (x: number) => Math.max(...cases.filter((c) => !c.half).flatMap((c) => G.roofTrib(x).map((r) => c.k(x, r.plane))))
  const peak = Math.max(...G.xs.map(peakAt))
  return { mu, uniform, cases, peakAt, peak }
}

export function buildCnLoads(spec: FactorySpec, model: FactoryModel): LoadPayloads {
  validateCnSpec(spec)
  const c = spec.china!, G = portalGeometry(spec)
  const { length, sRoof, gWall, theta } = G
  const cos = Math.cos(theta), sin = Math.sin(theta), deg = theta * 180 / Math.PI
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const ends = (e: FactoryModel['elements'][number]): [Node, Node] => [nodes.get(e.n1)!, nodes.get(e.n2)!]
  const BMLD: Record<string, { ITEMS: unknown[] }> = {}, CNLD: Record<string, { ITEMS: unknown[] }> = {}
  const dead = new Map<number, number>(), snow = new Map<number, number>()
  const total: Record<string, { x: number; y: number }> = {}
  const add = (id: number, lc: string, dir: 'GX' | 'GY' | 'GZ', w: number) => {
    if (Math.abs(w) < 1e-12) return
    const items = (BMLD[id] ??= { ITEMS: [] }).ITEMS
    items.push({ ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: dir, USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [w, w, 0, 0] })
    const e = model.elements.find((x) => x.id === id)!, [a, b] = ends(e)
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const t = total[lc] ??= { x: 0, y: 0 }
    if (dir === 'GX') t.x += w * L
    if (dir === 'GY') t.y += w * L
  }
  const topGirt = (x: number) => G.endGirtZs.filter((z) => z < G.zAt(x) - 1e-6).at(-1) ?? 0
  const strip = (x: number) => Math.max(0, G.zAt(x) - topGirt(x) - G.gEnd / 2)
  /** 벽 거트 분담 높이 — 측벽은 그 벽의 간격(편경사 좌우 다름), 박공벽은 박공벽 간격 */
  const wallTrib = (face: Exclude<Face, 'roof'>) => (face === 'x0' ? G.gWallAt(G.eaveXs[0]) : face === 'xL' ? G.gWallAt(G.eaveXs[G.eaveXs.length - 1]) : G.gEnd)
  const gable = (a: Node): 'y0' | 'yL' | null => a.y === 0 ? 'y0' : Math.abs(a.y - length) < 1e-8 ? 'yL' : null
  const qLive = CN.roofLive({ slope: spec.roofSlope, tribArea: sRoof * cos * Math.min(...baySpans(spec)) })
  const s0 = c.snow * c.snowMu, shape = snowShapeCN(spec, G)
  const qSnow = s0 * shape.uniform
  const snowCases = c.snow > 0 ? shape.cases : []
  for (const e of model.elements) {
    const [a, b] = ends(e)
    let w = 0
    if (e.role === 'girt') w = spec.wallDead * (e.face && e.face !== 'roof' ? wallTrib(e.face) : gWall)
    if (e.role === 'rafter' && gable(a)) w = spec.wallDead * strip((a.x + b.x) / 2)
    if (e.role === 'purlin' || e.role === 'strut') {
      const eave = !!G.eaveSide(a.x), tribs = G.roofTrib(a.x), trib = tribs.reduce((t, r) => t + r.trib, 0)
      w = spec.roofDead * trib + (eave ? spec.wallDead * G.gWallAt(a.x) / 2 : 0)
      add(e.id, 'LR', 'GZ', -qLive * trib * cos)
      snow.set(e.id, qSnow * trib * cos)
      for (const sc of snowCases) add(e.id, sc.name, 'GZ', -s0 * cos * tribs.reduce((t, r) => t + sc.k(a.x, r.plane) * r.trib, 0))
    }
    if (w) { add(e.id, 'D', 'GZ', -w); dead.set(e.id, w) }
  }
  // Roof live is absent from seismic weight, snow combination value = 0.5.
  const weights = nodeWeights(spec, model, (id) => (dead.get(id) ?? 0) + .5 * (snow.get(id) ?? 0))
  const W = [...weights.values()].reduce((a, b) => a + b, 0)
  const denom = model.nodes.reduce((s, n) => s + (weights.get(n.id) ?? 0) * n.z, 0)
  const seismic = { W } as LoadInfo['seismic']
  const node = (id: number, lc: string, F: [number, number, number]) => {
    const items = (CNLD[id] ??= { ITEMS: [] }).ITEMS
    items.push({ ID: items.length + 1, LCNAME: lc, GROUP_NAME: '', FX: F[0], FY: F[1], FZ: F[2], MX: 0, MY: 0, MZ: 0 })
  }
  for (const d of ['X', 'Y'] as const) {
    const T = d === 'X' ? c.Tx : c.Ty
    const sa = spectrum(T, c.alphaMax, c.Tg, c.damping), minimum = .2 * c.alphaMax
    const coef = Math.max(sa, minimum), V = coef * W
    seismic[d] = { T, c: coef, cV: sa, cStar: coef, cMin: minimum, cM: 0, gov: sa >= minimum ? 'GB/T 50011 5.1.5' : 'GB/T 50011 5.2.5', V, Fu: 1, R: 1, Mt: 0 }
    for (const n of model.nodes) {
      const F = denom > 0 ? V * (weights.get(n.id) ?? 0) * n.z / denom : 0
      if (F) node(n.id, `E${d}`, [d === 'X' ? F : 0, d === 'Y' ? F : 0, 0])
    }
  }
  /* GB 51022 4.4.2-3 수직지진 — 8도·9도: 중력 대표값의 10%(0.20g)·15%(0.30g)·20%(9도), 아래 방향 + */
  const vRatio = verticalRatioCN(c.alphaMax)
  if (vRatio > 0) for (const n of model.nodes) { const w = weights.get(n.id) ?? 0; if (w) node(n.id, 'EV', [0, 0, -vRatio * w]) }

  /* GB 51022 4.2 — wk = β·μw·μz·w0, β 1.1 (주골조), μz 는 10 m 미만이면 10 m 값, h = 평균 지붕 높이 */
  const hRef = G.hMean, B = spec.span, minDim = Math.min(B, length)
  const q0 = c.w0 * c.topography * muZ(Math.max(hRef, 10), c.terrain), qF = BETA_FRAME_CN * q0
  /* 끝 구역 폭 2a — 횡방향은 박공 쪽, 종방향은 측벽 쪽 (그림 4.2.2-1·4.2.2-2; 종방향 그림 표기 a 이나 MBMA 와 같이 2a 로 보수적) */
  const endW = 2 * edgeACN(minDim, hRef)
  const nearGable = (y: number) => y <= endW + 1e-9 || y >= length - endW - 1e-9
  const nearSide = (x: number) => x <= endW + 1e-9 || x >= B - endW - 1e-9
  type WindCase = { name: string; dir: 'X' | 'Y'; sign: number; i: Internal }
  const winds: WindCase[] = []
  for (const dir of ['X', 'Y'] as const) for (const sign of [1, -1]) for (const i of ['+i', '-i'] as const)
    winds.push({ name: `W${dir}${winds.filter((w) => w.dir === dir).length + 1}`, dir, sign, i })
  const mu = (wc: WindCase, zone: ZoneMW) => (wc.dir === 'X' ? mwTransCN(deg, wc.i, zone) : mwLongCN(wc.i, zone))
  const E = (z: '1' | '2' | '3' | '4', end: boolean) => (end ? `${z}E` : z) as ZoneMW
  /** 벽 μw — 횡: 풍상 측벽 1, 풍하 측벽 4, 박공벽 5·6 / 종: 풍상 박공 1, 풍하 박공 4, 측벽 5·6 */
  const wallMu = (wc: WindCase, face: Exclude<Face, 'roof'>, x: number, y: number) => {
    const [windward, leeward] = wc.dir === 'X' ? (wc.sign > 0 ? ['x0', 'xL'] : ['xL', 'x0']) : (wc.sign > 0 ? ['y0', 'yL'] : ['yL', 'y0'])
    const end = wc.dir === 'X' ? nearGable(y) : nearSide(x)
    return mu(wc, face === windward ? E('1', end) : face === leeward ? E('4', end) : '5')
  }
  /** 지붕 μw — 횡: 풍상 처마에서 주 4 길이까지 2, 이후 3 / 종: 풍상 L/2 까지 2, 이후 3 */
  const roofMu = (wc: WindCase, x: number, y: number) => {
    if (wc.dir === 'X') {
      const xp = wc.sign > 0 ? x : B - x
      return mu(wc, E(xp < zone2LenCN(mu(wc, '2'), minDim, hRef, B) - 1e-9 ? '2' : '3', nearGable(y)))
    }
    const yp = wc.sign > 0 ? y : length - y
    return mu(wc, E(yp < length / 2 - 1e-9 ? '2' : '3', nearSide(x)))
  }
  const OUT: Record<Exclude<Face, 'roof'>, [number, number]> = { x0: [-1, 0], xL: [1, 0], y0: [0, -1], yL: [0, 1] }
  for (const wc of winds) {
    const wall = (id: number, face: Exclude<Face, 'roof'>, x: number, y: number, trib: number) => { const p = qF * wallMu(wc, face, x, y) * trib, [ox, oy] = OUT[face]; add(id, wc.name, 'GX', -ox * p); add(id, wc.name, 'GY', -oy * p) }
    for (const e of model.elements) {
      const [a, b] = ends(e), xm = (a.x + b.x) / 2, ym = (a.y + b.y) / 2
      if (e.role === 'girt' && e.face && e.face !== 'roof') { wall(e.id, e.face, xm, ym, wallTrib(e.face)); continue }
      if (e.role === 'rafter') { const face = gable(a); if (face) wall(e.id, face, xm, a.y, strip(xm)); continue }
      if (e.role !== 'purlin' && e.role !== 'strut') continue
      let fx = 0, fz = 0
      /* 지붕면마다(G.roofTrib) 면 쪽으로 조금 들어간 점의 구역 — 마루 퍼린의 풍상면 몫은 2구역 */
      for (const { plane, trib } of G.roofTrib(a.x)) {
        const pl = G.planes[plane], xe = Math.min(Math.max(a.x, pl.xa + 1e-6), pl.xb - 1e-6)
        const p = qF * roofMu(wc, xe, ym)
        fx += (pl.rising ? 1 : -1) * p * trib * sin; fz -= p * trib * cos
      }
      const side = G.eaveSide(a.x)
      if (side === 'x0') fx += qF * wallMu(wc, 'x0', a.x, ym) * G.gWallAt(a.x) / 2
      else if (side === 'xL') fx -= qF * wallMu(wc, 'xL', a.x, ym) * G.gWallAt(a.x) / 2
      add(e.id, wc.name, 'GX', fx); add(e.id, wc.name, 'GZ', fz)
    }
  }

  type Part = { lc: string; f: number }
  const full = snowCases.filter((s) => !s.half), halves = snowCases.filter((s) => s.half)
  const variants: Record<LoadCaseType, Part[][]> = { D: [[{ lc: 'D', f: 1 }]], L: [[{ lc: 'LR', f: 1 }]], S: full.length ? full.map((s) => [{ lc: s.name, f: 1 }]) : [[]], W: winds.map((w) => [{ lc: w.name, f: 1 }]), E: ['EX', 'EY'].flatMap((lc) => [1, -1].map((f) => [{ lc, f }])) }
  const LCOM: Record<string, unknown> = {}, comboKind: LoadInfo['comboKind'] = {}
  let no = 0
  const seen = new Set<string>()
  const push = (ref: string, parts: Part[]) => {
    const key = JSON.stringify(parts); if (seen.has(key)) return; seen.add(key)
    const suffix = parts.filter((p) => !['D', 'LR'].includes(p.lc)).map((p) => `${p.f < 0 ? '-' : ''}${p.lc}`).join(' ')
    const name = `GB ${ref}${suffix ? ` ${suffix}` : ''}`
    comboKind[name] = 'basic'
    // Structural importance gamma0 is applied to non-seismic combinations.
    const gamma = parts.some((p) => p.lc.startsWith('E')) ? 1 : c.gamma0
    LCOM[++no] = { NAME: name, ACTIVE: 'ACTIVE', iTYPE: 0, DESC: 'GB 55001 / GB 51022 / GB/T 50011', vCOMB: parts.map((p) => ({ ANAL: 'ST', LCNAME: p.lc, FACTOR: p.f * gamma })) }
  }
  for (const combo of CN.combos({ heavyLive: false })) {
    if (!snowCases.length && combo.ref === 'S') continue
    let combos: Part[][] = [[]]
    /* 지진 조합의 적설 = 중력 대표값(균일 0.5S) — 불균등·골 분포는 쓰지 않음 */
    const vs = (k: LoadCaseType) => (k === 'S' && combo.terms.some(([t]) => t === 'E') ? variants.S.slice(0, 1) : variants[k])
    for (const [k, factor] of combo.terms) combos = combos.flatMap((parts) => vs(k).map((v) => [...parts, ...v.map((p) => ({ lc: p.lc, f: p.f * factor }))]))
    for (const parts of combos) push(combo.ref, parts)
    /* 4.3.5-2 반경간 균일 적설 — 적설 지배 조합(1.3D + 1.5S)만 */
    if (combo.ref === 'S') for (const h of halves) push('S', [{ lc: 'D', f: 1.3 }, { lc: h.name, f: 1.5 }])
  }
  /* GB 55002 표 4.3.2 — 수직지진 단독 γEv 1.4, 수평 지배 시 γEh 1.4 + γEv 0.5. 중력 대표값 = D + 0.5S(균일) */
  if (vRatio > 0) {
    const g = (fav: boolean): Part[] => fav ? [{ lc: 'D', f: 1 }] : [{ lc: 'D', f: 1.3 }, ...(snowCases.length ? [{ lc: 'SN', f: .65 }] : [])]
    push('EV', [...g(false), { lc: 'EV', f: 1.4 }])
    push('EV', [...g(true), { lc: 'EV', f: -1.4 }])
    for (const [e] of variants.E) {
      push('EHV', [...g(false), { lc: e.lc, f: 1.4 * e.f }, { lc: 'EV', f: .5 }])
      push('EHV', [...g(true), { lc: e.lc, f: 1.4 * e.f }, { lc: 'EV', f: -.5 }])
    }
  }
  const STLD: Record<string, unknown> = {}
  const cases = [['D', 'D'], ['LR', 'LR'], ...snowCases.map((s) => [s.name, 'S']), ['EX', 'E'], ['EY', 'E'], ...(vRatio > 0 ? [['EV', 'E']] : []), ...winds.map((w) => [w.name, 'W'])]
  cases.forEach(([NAME, TYPE], i) => { STLD[i + 1] = { NAME, TYPE, DESC: `GB ${NAME}` } })
  const cp2 = (i: Internal) => mwTransCN(deg, i, '2')
  return { STLD, BODF: { 1: { LCNAME: 'D', GROUP_NAME: '', FV: [0, 0, -1] } }, BMLD, CNLD, 'LCOM-GEN': LCOM,
    info: { roofLive: qLive, snow: qSnow, snowPeak: s0 * shape.peak, seismic, comboKind, omega: { X: 1, Y: 1 }, cn: { verticalRatio: vRatio, endZone: endW },
      wind: { qh: q0, hRef, cases: winds.map((w) => ({ name: w.name, dir: w.dir, roofCp: mu(w, '2'), gcpi: w.i === '+i' ? 1 : -1 })), windwardRoofCp: { low: cp2('+i'), high: cp2('-i') }, across: { WDx: Math.max(...winds.filter((w) => w.dir === 'X').map((w) => Math.abs(total[w.name]?.x ?? 0))), WDy: Math.max(...winds.filter((w) => w.dir === 'Y').map((w) => Math.abs(total[w.name]?.y ?? 0))), WLX: 0, WLY: 0, MT: 0, kD: 1 }, variants: winds.map((w) => ({ tag: w.name, dir: w.dir, parts: [{ lc: w.name, f: 1 }] })) } } }
}
