import { baySpans, frameSpans, type Element, type ElementRole, type Face, type FactoryModel, type FactorySpec, type FrameType, type Node } from './types'
import { applyAdditions } from './additions'

/** 지붕면 하나 (횡단면, x 증가 방향). rising = x 가 커질수록 높아짐 — 법선 (∓sinθ, 0, cosθ) 방향과 풍상·풍하 판정에 쓴다 */
export interface RoofPlane { xa: number; xb: number; za: number; zb: number; rising: boolean }
/** 지붕 절점(퍼린·스트럿 줄) x 가 분담하는 지붕면과 폭 */
export interface RoofTrib { plane: number; trib: number }

/** 형상 상수 — 하중·설계가 같은 값을 쓰도록 한 곳에서 계산.
    횡단면 기술(eaveXs·ridges·planes·roofTrib …)은 형식(단경간 박공·편경사·다경간)과 무관하게 순회하도록 두는 공통 표현 —
    하중·설계·접합·도면은 'x === 0 / span / span/2' 대신 이것을 쓴다. 현재는 단경간 박공(기둥 2열·지붕면 2·마루 1). */
export function portalGeometry(spec: FactorySpec): Geometry {
  if (spec.frame === 'multi') return multiGeometry(spec)
  const { span, eaveHeight, roofSlope, purlinSpacing, girtSpacing } = spec
  const mono = spec.frame === 'mono'
  const spans = baySpans(spec)
  /** 지붕면 하나의 수평 길이 — 박공 = 스팬/2, 편경사 = 스팬 */
  const run = mono ? span : span / 2
  const rise = run * roofSlope
  const slopeLen = Math.hypot(run, rise)
  const nPurlin = Math.max(1, Math.round(slopeLen / purlinSpacing))
  const nGirtOf = (h: number) => Math.max(1, Math.round(h / girtSpacing))
  const nGirt = nGirtOf(eaveHeight)
  const rafterXs = Array.from({ length: nPurlin + 1 }, (_, i) => run * (i / nPurlin))
  /** 지붕보 절점 x (박공: 처마 → 마루 → 처마 / 편경사: 낮은 처마 → 높은 처마) */
  const xs = mono ? rafterXs : [...rafterXs, ...rafterXs.slice(0, -1).reverse().map((x) => span - x)]
  const zAt = mono ? (x: number) => eaveHeight + x * roofSlope : (x: number) => eaveHeight + Math.min(x, span - x) * roofSlope
  /** 거트 높이 (기초·처마 제외) — x0 측벽(낮은 쪽). 높이가 다른 벽은 girtZsAt */
  const levels = (h: number) => { const n = nGirtOf(h); return Array.from({ length: n - 1 }, (_, g) => (h * (g + 1)) / n) }
  const girtZs = levels(eaveHeight)
  /** 기둥 열 x 의 벽 거트 높이·간격 (박공은 양쪽 같음) */
  const girtZsAt = (x: number) => (Math.abs(zAt(x) - eaveHeight) < 1e-9 ? girtZs : levels(zAt(x)))
  const gWallAt = (x: number) => zAt(x) / nGirtOf(zAt(x))
  /** 박공벽(y0·yL) 거트 높이·간격 — 가장 높은 기둥 열 기준 (편경사는 높은 쪽), 지붕선 아래만 */
  const hEnd = Math.max(zAt(0), zAt(span))
  const endGirtZs = Math.abs(hEnd - eaveHeight) < 1e-9 ? girtZs : levels(hEnd)
  const gEnd = hEnd / nGirtOf(hEnd)
  /** 박공벽 풍주 x — 목표 간격으로 등분한 뒤 가장 가까운 지붕보 절점에 맞춤 */
  const nPost = Math.max(1, Math.round(span / Math.max(spec.postSpacing, 1)))
  const postXs = [...new Set(Array.from({ length: nPost - 1 }, (_, k) => {
    const target = (span * (k + 1)) / nPost
    return xs.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
  }))].filter((x) => x > 0 && x < span).sort((a, b) => a - b)
  const sRoof = slopeLen / nPurlin
  /** 박공 = 마루 높이, 편경사 = 높은 처마 높이 */
  const ridgeZ = eaveHeight + rise
  /* ── 횡단면 기술 ── */
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9
  /** 바깥 기둥 열 x (처마) — 순서: x0 측벽, xL 측벽 */
  const eaveXs = [0, span]
  /** 마루 x (편경사 없음) */
  const ridges = mono ? [] : [span / 2]
  const planes: RoofPlane[] = mono
    ? [{ xa: 0, xb: span, za: eaveHeight, zb: ridgeZ, rising: true }]
    : [
        { xa: 0, xb: span / 2, za: eaveHeight, zb: ridgeZ, rising: true },
        { xa: span / 2, xb: span, za: ridgeZ, zb: eaveHeight, rising: false },
      ]
  /** 처마 절점이면 그 측벽 */
  const eaveSide = (x: number): 'x0' | 'xL' | null => near(x, eaveXs[0]) ? 'x0' : near(x, eaveXs[eaveXs.length - 1]) ? 'xL' : null
  const isRidge = (x: number) => ridges.some((r) => near(x, r))
  /** 지붕 절점 x 의 분담 — 처마: 붙은 면 반 칸 / 마루: 양쪽 면 반 칸씩 / 그 밖: 한 면 한 칸 */
  const roofTrib = (x: number): RoofTrib[] => {
    const e = eaveSide(x)
    if (e) return [{ plane: e === 'x0' ? 0 : planes.length - 1, trib: sRoof / 2 }]
    if (isRidge(x)) { const i = planes.findIndex((p) => near(p.xb, x)); return [{ plane: i, trib: sRoof / 2 }, { plane: i + 1, trib: sRoof / 2 }] }
    return [{ plane: planes.findIndex((p) => x > p.xa && x < p.xb), trib: sRoof }]
  }
  /** 처마 띠 안 (외장재 구역 폭 a — 가장자리부터 a + eps 이내) */
  const nearEave = (x: number, a: number, eps = 0) => x <= eaveXs[0] + a + eps || x >= eaveXs[eaveXs.length - 1] - a - eps
  /** 마루 띠 안 */
  const nearRidge = (x: number, a: number, eps = 0) => ridges.some((r) => Math.abs(x - r) <= a + eps)
  /** 처마 절점(기둥 상단) / 마루 절점 — 접합 위치 */
  const isEaveNode = (n: { x: number; z: number }) => !!eaveSide(n.x) && Math.abs(n.z - zAt(n.x)) < 1e-9
  const isRidgeNode = (n: { x: number; z: number }) => isRidge(n.x) && Math.abs(n.z - ridgeZ) < 1e-9
  /** 지붕보 처짐 확인 x — 박공 = 마루, 편경사 = 경간 중앙에 가장 가까운 지붕보 절점 */
  const deflXs = mono ? [xs.reduce((a, b) => (Math.abs(b - span / 2) < Math.abs(a - span / 2) ? b : a))] : ridges
  const isDeflNode = (n: { x: number; z: number }) => deflXs.some((x) => near(n.x, x)) && Math.abs(n.z - zAt(n.x)) < 1e-9
  return {
    rise, slopeLen, nPurlin, nGirt, xs, zAt, girtZs, postXs,
    sRoof, gWall: eaveHeight / nGirt, length: spans.reduce((a, b) => a + b, 0), spans,
    theta: Math.atan(roofSlope), ridgeZ,
    frame: (mono ? 'mono' : 'gable') as FrameType,
    /** 흔들림 기둥 열 x (다경간 내부) */
    leanXs: [] as number[],
    valleys: [] as number[],
    /** 좌우 대칭 — 아니면 X 방향 하중(풍·지진 비틀림)을 양방향으로 */
    symmetric: !mono,
    eaveXs, ridges, planes, eaveSide, isRidge, roofTrib, nearEave, nearRidge, isEaveNode, isRidgeNode, deflXs, isDeflNode,
    girtZsAt, gWallAt, endGirtZs, gEnd,
    /** 처마 → 처마 지붕보 전체 길이 (경사 방향) — 기둥 유효길이 G 값·용량 설계 */
    rafterLen: mono ? slopeLen : 2 * slopeLen,
    /** 평균 지붕 높이 (지진 hn·풍 h) */
    hMean: eaveHeight + rise / 2,
  }
}

/** 횡단면 형상 — 박공·편경사·다경간 공통 키 */
export interface Geometry {
  rise: number; slopeLen: number; nPurlin: number; nGirt: number; xs: number[]; zAt: (x: number) => number; girtZs: number[]; postXs: number[]
  sRoof: number; gWall: number; length: number; spans: number[]; theta: number; ridgeZ: number; frame: FrameType; leanXs: number[]; valleys: number[]
  symmetric: boolean; eaveXs: number[]; ridges: number[]; planes: RoofPlane[]; eaveSide: (x: number) => 'x0' | 'xL' | null; isRidge: (x: number) => boolean
  roofTrib: (x: number) => RoofTrib[]; nearEave: (x: number, a: number, eps?: number) => boolean; nearRidge: (x: number, a: number, eps?: number) => boolean
  isEaveNode: (n: { x: number; z: number }) => boolean; isRidgeNode: (n: { x: number; z: number }) => boolean; deflXs: number[]; isDeflNode: (n: { x: number; z: number }) => boolean
  girtZsAt: (x: number) => number[]; gWallAt: (x: number) => number; endGirtZs: number[]; gEnd: number; rafterLen: number; hMean: number
}

/** 위치 x 의 지붕면이 오르막인지 (3D 퍼린 춤 방향) — 경계는 오른쪽 면이 아니라 왼쪽 면 기준 (x < 마루 = 오르막) */
export function risingAt(spec: FactorySpec): (x: number) => boolean {
  const planes = portalGeometry(spec).planes
  return (x) => (planes.find((p) => x >= p.xa - 1e-9 && x < p.xb - 1e-9) ?? planes[planes.length - 1]).rising
}

/** 다경간 박공 — 경간마다 쌍坡, 골(내부 기둥 열) 높이 = 처마. 지붕보는 골에서 연속, 내부 기둥은 흔들림 기둥 */
function multiGeometry(spec: FactorySpec): Geometry {
  const { eaveHeight, roofSlope, purlinSpacing, girtSpacing } = spec
  const widths = frameSpans(spec)
  const W = widths.reduce((a, b) => a + b, 0)
  const colXs = widths.reduce<number[]>((a, w) => [...a, a[a.length - 1] + w], [0])
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9
  const spanOf = (x: number) => Math.max(0, Math.min(widths.length - 1, colXs.findIndex((c, i) => i > 0 && x <= c + 1e-9) - 1))
  const zAt = (x: number) => { const i = spanOf(x), x0 = colXs[i], x1 = colXs[i + 1]; return eaveHeight + Math.min(x - x0, x1 - x) * roofSlope }
  const planes: (RoofPlane & { s: number })[] = []
  const xsSet: number[] = []
  let slopeMax = 0, sMax = 0, nMax = 1
  widths.forEach((w, i) => {
    const run = w / 2, rise = run * roofSlope, len = Math.hypot(run, rise)
    const n = Math.max(1, Math.round(len / purlinSpacing)), s = len / n
    slopeMax = Math.max(slopeMax, len); sMax = Math.max(sMax, s); nMax = Math.max(nMax, n)
    const x0 = colXs[i], xm = x0 + run, x1 = colXs[i + 1]
    for (let k = 0; k <= n; k++) xsSet.push(x0 + run * (k / n))
    for (let k = n - 1; k >= 0; k--) xsSet.push(x1 - run * (k / n))
    planes.push({ xa: x0, xb: xm, za: eaveHeight, zb: eaveHeight + rise, rising: true, s }, { xa: xm, xb: x1, za: eaveHeight + rise, zb: eaveHeight, rising: false, s })
  })
  const xs = [...new Set(xsSet.map((x) => +x.toFixed(9)))].sort((a, b) => a - b)
  const ridges = widths.map((w, i) => colXs[i] + w / 2)
  const valleys = colXs.slice(1, -1)
  const riseMax = Math.max(...widths.map((w) => (w / 2) * roofSlope))
  const nGirt = Math.max(1, Math.round(eaveHeight / girtSpacing))
  const girtZs = Array.from({ length: nGirt - 1 }, (_, g) => (eaveHeight * (g + 1)) / nGirt)
  const gWall = eaveHeight / nGirt
  /* 박공벽 풍주: 기둥(바깥·내부) 사이를 목표 간격으로 — 각 경간에서 등분해 지붕보 절점에 맞춤 */
  const postXs = widths.flatMap((w, i) => {
    const n = Math.max(1, Math.round(w / Math.max(spec.postSpacing, 1)))
    return Array.from({ length: n - 1 }, (_, k) => { const t = colXs[i] + (w * (k + 1)) / n; return xs.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a)) })
  }).filter((x) => !colXs.some((c) => near(c, x)))
  const eaveXs = [0, W]
  const eaveSide = (x: number): 'x0' | 'xL' | null => near(x, 0) ? 'x0' : near(x, W) ? 'xL' : null
  const isRidge = (x: number) => ridges.some((r) => near(x, r))
  const isValley = (x: number) => valleys.some((v) => near(x, v))
  const roofTrib = (x: number): RoofTrib[] => {
    const e = eaveSide(x)
    if (e) { const i = e === 'x0' ? 0 : planes.length - 1; return [{ plane: i, trib: planes[i].s / 2 }] }
    if (isRidge(x) || isValley(x)) { const i = planes.findIndex((p) => near(p.xb, x)); return [{ plane: i, trib: planes[i].s / 2 }, { plane: i + 1, trib: planes[i + 1].s / 2 }] }
    const i = planes.findIndex((p) => x > p.xa && x < p.xb)
    return [{ plane: i, trib: planes[i].s }]
  }
  const symmetric = widths.every((w, i) => near(w, widths[widths.length - 1 - i]))
  const spans = baySpans(spec)
  return {
    rise: riseMax, slopeLen: slopeMax, nPurlin: nMax, nGirt, xs, zAt, girtZs, postXs,
    sRoof: sMax, gWall, length: spans.reduce((a, b) => a + b, 0), spans,
    theta: Math.atan(roofSlope), ridgeZ: eaveHeight + riseMax,
    frame: 'multi', leanXs: valleys, valleys, symmetric,
    eaveXs, ridges, planes, eaveSide, isRidge, roofTrib,
    nearEave: (x, a, eps = 0) => x <= a + eps || x >= W - a - eps,
    nearRidge: (x, a, eps = 0) => ridges.some((r) => Math.abs(x - r) <= a + eps),
    isEaveNode: (n) => !!eaveSide(n.x) && Math.abs(n.z - eaveHeight) < 1e-9,
    isRidgeNode: (n) => isRidge(n.x) && Math.abs(n.z - zAt(n.x)) < 1e-9,
    deflXs: ridges,
    isDeflNode: (n) => isRidge(n.x) && Math.abs(n.z - zAt(n.x)) < 1e-9,
    girtZsAt: () => girtZs, gWallAt: () => gWall, endGirtZs: girtZs, gEnd: gWall,
    /* 바깥 기둥 유효길이 G: 처마에 붙은 끝 경간 지붕보(처마~골) — 큰 쪽(보수적 K) */
    rafterLen: Math.max(...[widths[0], widths[widths.length - 1]].map((w) => 2 * Math.hypot(w / 2, (w / 2) * roofSlope))),
    hMean: eaveHeight + riseMax / 2,
  }
}

/** 단경간 포털 프레임 + 2차부재 + 박공벽 풍주·거트 + 양 끝 베이 X-가새 형상 생성 (순수 함수).
    전역: X = 스팬, Y = 길이, Z = 높이. */
export function buildPortal(spec: FactorySpec): FactoryModel {
  const { sections: sec } = spec
  const G = portalGeometry(spec)
  const bays = G.spans.length
  const ys = G.spans.reduce<number[]>((a, s) => [...a, a[a.length - 1] + s], [0])
  const nodes: Node[] = []
  const elements: Element[] = []
  const byKey = new Map<string, number>()
  const node = (x: number, y: number, z: number) => {
    const k = [x, y, z].map((v) => v.toFixed(4)).join('|')
    let id = byKey.get(k)
    if (id === undefined) { id = nodes.length + 1; byKey.set(k, id); nodes.push({ id, x, y, z }) }
    return id
  }
  const elem = (a: number, b: number, role: ElementRole, section: string, face?: Face, lean?: true) => {
    elements.push({ id: elements.length + 1, n1: a, n2: b, role, section, ...(face ? { face } : {}), ...(lean ? { lean } : {}) })
  }
  const yOf = (b: number) => ys[b]
  const gableFace = (b: number): Face | null => (b === 0 ? 'y0' : b === bays ? 'yL' : null)

  for (let b = 0; b <= bays; b++) {
    const y = yOf(b)
    const gable = gableFace(b)
    /* 기둥: 거트 높이마다 절점 */
    for (const x of G.eaveXs) {
      /* 박공 프레임 기둥은 박공벽 거트 높이에도 절점 — 편경사는 측벽·박공벽 거트 높이가 달라, 없으면 박공 거트 끝이 떠서 불안정 */
      const zs = gable ? [...new Set([...G.girtZsAt(x), ...G.endGirtZs.filter((z) => z < G.zAt(x) - 1e-6)])].sort((p, q) => p - q) : G.girtZsAt(x)
      let prev = node(x, y, 0)
      for (const z of [...zs, G.zAt(x)]) {
        const cur = node(x, y, z)
        elem(prev, cur, 'column', sec.column)
        prev = cur
      }
    }
    /* 다경간 내부 기둥(흔들림 기둥): 기초 → 골. 박공 프레임은 박공벽 거트 높이에 절점.
       크레인을 받는 기둥이면 흔들림 기둥 불가(강접) — 현재 크레인은 적용범위에서 막혀 있음(scope.ts) */
    for (const x of G.leanXs) {
      let prev = node(x, y, 0)
      for (const z of [...(gable ? G.endGirtZs.filter((z) => z < G.zAt(x) - 1e-6) : []), G.zAt(x)]) {
        const cur = node(x, y, z)
        elem(prev, cur, 'column', sec.column, undefined, true)
        prev = cur
      }
    }
    /* 박공벽 풍주: 기초 → 지붕보 절점, 거트 높이마다 절점 */
    if (gable) {
      for (const x of G.postXs) {
        let prev = node(x, y, 0)
        for (const z of [...G.endGirtZs.filter((z) => z < G.zAt(x) - 1e-6), G.zAt(x)]) {
          const cur = node(x, y, z)
          elem(prev, cur, 'post', sec.post, gable)
          prev = cur
        }
      }
    }
    /* 지붕보: 퍼린 위치마다 절점 */
    for (let i = 0; i < G.xs.length - 1; i++) {
      elem(node(G.xs[i], y, G.zAt(G.xs[i])), node(G.xs[i + 1], y, G.zAt(G.xs[i + 1])), 'rafter', sec.rafter)
    }
    /* 박공 거트: 기둥·풍주 사이, 거트 높이마다 */
    if (gable) {
      const lines = [G.eaveXs[0], ...G.postXs, ...G.leanXs, G.eaveXs[G.eaveXs.length - 1]]
      if (G.leanXs.length) lines.sort((p, q) => p - q)
      for (const z of G.endGirtZs) {
        for (let i = 0; i < lines.length - 1; i++) {
          if (z >= G.zAt(lines[i]) || z >= G.zAt(lines[i + 1])) continue
          elem(node(lines[i], y, z), node(lines[i + 1], y, z), 'girt', sec.girt, gable)
        }
      }
    }
  }

  /* 길이 방향 2차부재 (인접 프레임 사이) */
  for (let b = 0; b < bays; b++) {
    const y0 = yOf(b), y1 = yOf(b + 1)
    for (const x of G.xs) {
      const edge = !!G.eaveSide(x) || G.isRidge(x) || G.valleys.some((v) => Math.abs(v - x) < 1e-9) // 처마·마루·골
      elem(node(x, y0, G.zAt(x)), node(x, y1, G.zAt(x)), edge ? 'strut' : 'purlin', edge ? sec.strut : sec.purlin)
    }
    for (const x of G.eaveXs) {
      for (const z of G.girtZsAt(x)) elem(node(x, y0, z), node(x, y1, z), 'girt', sec.girt, G.eaveSide(x)!)
    }
  }

  /* X-가새 (TRUSS) — 양 측벽과 양 지붕면, 교차점은 연결하지 않음.
     베이가 4 이상이면 끝에서 두 번째 베이에 둔다: 박공 프레임은 중력하중이 절반이라 내부 프레임과 처짐이 달라,
     끝 베이 지붕 가새가 중력에서 큰 축력(라이브: 187 kN 압축)을 받는다. 박공 풍하중은 끝 베이 스트럿이 가새 베이로 전달. */
  const braceBays = [...new Set(bays >= 4 ? [1, bays - 2] : [0, bays - 1])].filter((b) => b >= 0)
  // GB/T 50011 9.2: wall bracing in the middle of the temperature unit;
  // roof bracing at the ends and aligned with the wall bracing.
  const cnWall = [...new Set(G.length > 60 ? [Math.floor(bays / 3), Math.floor(2 * bays / 3)] : [Math.floor((bays - 1) / 2)])].map((b) => Math.min(bays - 1, b))
  const wallBays = spec.code === 'CN' ? cnWall : braceBays
  const roofBays = spec.code === 'CN' ? [...new Set([0, ...cnWall, bays - 1])] : braceBays
  for (const b of wallBays) {
    const y0 = yOf(b), y1 = yOf(b + 1)
    for (const x of G.eaveXs) {
      const f: Face = G.eaveSide(x)!
      elem(node(x, y0, 0), node(x, y1, G.zAt(x)), 'brace', sec.brace, f)
      elem(node(x, y1, 0), node(x, y0, G.zAt(x)), 'brace', sec.brace, f)
    }
  }
  for (const b of roofBays) {
    const y0 = yOf(b), y1 = yOf(b + 1)
    /* 지붕면마다 낮은 끝(처마) → 높은 끝(마루) X. 편경사는 면이 스팬 전체라 경간 중앙 지붕보 절점에서 두 패널로 (각도 확보) */
    for (const p of G.planes) {
      const lo = p.rising ? p.xa : p.xb, hi = p.rising ? p.xb : p.xa
      const pts = G.frame === 'mono' ? [lo, G.deflXs[0], hi] : [lo, hi]
      for (let i = 0; i < pts.length - 1; i++) {
        const [xa, xb] = [pts[i], pts[i + 1]]
        elem(node(xa, y0, G.zAt(xa)), node(xb, y1, G.zAt(xb)), 'brace', sec.brace, 'roof')
        elem(node(xa, y1, G.zAt(xa)), node(xb, y0, G.zAt(xb)), 'brace', sec.brace, 'roof')
      }
    }
  }
  return applyAdditions(spec, { nodes, elements })
}
