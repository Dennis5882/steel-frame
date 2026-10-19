import { sagCount } from './validity'
/* GB 51022-2015 4.2 퍼린·거트(외장재) 풍하중 — 폐쇄형.
   wk = β·μw·μz·w0, β = 1.5 (4.2.1), μz 는 10 m 미만이면 10 m 값. μw 는 내압 포함 (표 4.2.2-3 외벽, 4.2.2-4 쌍坡,
   4.2.2-5 다경간, 4.2.2-6 편坡), 유효 면적 A = l·c, c ≥ max(부담폭, l/3) (4.2.3).
   구역(그림 4.2.2-3·4a·4b·4c·6a·6b): 부재가 걸친 가장 불리한 구역을 전 길이에 적용. */
import { muZ } from '../codes/cnLateral'
import { BETA_CC_CN, ccRoofCN, ccWallCN, edgeACN, effAreaCN, type ZoneCC } from '../codes/cnPortal'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import { snowShapeCN } from './cnLoads'
import type { FactoryModel, FactorySpec } from './types'
import type { LoadInfo } from './loads'
import type { CCLoad } from './secondary'

/** 외장재 속도압 β·μz·w0 (kN/m²) */
export const ccQCN = (spec: FactorySpec, h: number) => {
  const c = spec.china!
  return BETA_CC_CN * c.w0 * c.topography * muZ(Math.max(h, 10), c.terrain)
}

export function cnCCLoads(spec: FactorySpec, model: FactoryModel, info: LoadInfo): Map<number, CCLoad> {
  const c = spec.china!, G = portalGeometry(spec), out = new Map<number, CCLoad>()
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const h = info.wind.hRef, deg = G.theta * 180 / Math.PI, B = spec.span, Lb = G.length
  const a = edgeACN(Math.min(B, Lb), h), q = ccQCN(spec, h)
  const shape = snowShapeCN(spec, G)
  const kind = spec.frame === 'mono' ? 'mono' : G.ridges.length > 1 ? 'multi' : 'gable'
  const near = (v: number, lo: number, hi: number, w: number) => v <= lo + w + 1e-9 || v >= hi - w - 1e-9
  /** 지붕 구역 — 4a(θ≤10°, 다경간 포함): 처마·박공 가장자리 a, 4b·4c(θ>10°): 마루(다경간은 골 포함) 양쪽 a 추가,
      편坡 6a(3~10°): 높은 처마 2a(모서리 3′ 4a·나머지 2′), 낮은 처마 a(모서리 3 2a·나머지 2), 박공 쪽 2a 는 2′(보수적),
      편坡 6b(10~30°): 높은 처마 2a(모서리 3 4a·나머지 2), 낮은 처마·박공 쪽 a = 2 */
  const roofZone = (x: number, y0: number, y1: number): ZoneCC => {
    const endIn = (w: number) => y0 <= w + 1e-9 || y1 >= Lb - w - 1e-9
    if (kind === 'mono' && deg > 3) {
      const hi = G.zAt(B) >= G.zAt(0) ? B : 0
      const dHi = Math.abs(x - hi), dLo = Math.abs(x - (B - hi))
      if (deg <= 10) {
        if (dHi <= 2 * a + 1e-9) return endIn(4 * a) ? "3'" : "2'"
        if (dLo <= a + 1e-9) return endIn(2 * a) ? '3' : '2'
        return endIn(2 * a) ? "2'" : '1'
      }
      if (dHi <= 2 * a + 1e-9) return endIn(4 * a) ? '3' : '2'
      return dLo <= a + 1e-9 || endIn(a) ? '2' : '1'
    }
    const lines = deg > 10 ? [...G.ridges, ...G.valleys] : []
    const edge = near(x, 0, B, a) || lines.some((r) => Math.abs(x - r) <= a + 1e-9)
    const end = endIn(a)
    return edge && end ? '3' : edge || end ? '2' : '1'
  }
  for (const e of model.elements) {
    if (e.role !== 'purlin' && e.role !== 'girt') continue
    const n1 = nodes.get(e.n1)!, n2 = nodes.get(e.n2)!, sp = sectionProps(e.section, spec.code)
    const L = Math.hypot(n2.x - n1.x, n2.y - n1.y, n2.z - n1.z)
    const y0 = Math.min(n1.y, n2.y), y1 = Math.max(n1.y, n2.y), x0 = Math.min(n1.x, n2.x), x1 = Math.max(n1.x, n2.x)
    const gableWall = e.face === 'y0' || e.face === 'yL'
    const trib = e.role === 'purlin' ? G.sRoof : gableWall ? G.gEnd : G.gWallAt(n1.x)
    const A = effAreaCN(L, trib)
    let zone: ZoneCC | '4' | '5', mu: { neg: number; pos: number }
    if (e.role === 'girt') {
      /* 외벽 5구역 = 모서리에서 a 안 (측벽은 박공 쪽, 박공벽은 측벽 쪽) */
      const corner = gableWall ? near(x0, 0, B, a) || near(x1, 0, B, a) : y0 <= a + 1e-9 || y1 >= Lb - a - 1e-9
      zone = corner ? '5' : '4'; mu = ccWallCN(zone, A)
    } else { zone = roofZone(n1.x, y0, y1); mu = ccRoofCN(kind, deg, zone, A) }
    const pPos = q * mu.pos, pNeg = q * mu.neg
    const self = 78.5 * sp.A * 1e-6, D = (e.role === 'purlin' ? spec.roofDead : spec.wallDead) * trib + self
    const normalD = e.role === 'purlin' ? D * Math.cos(G.theta) : 0
    /* 4.3.5-1 퍼린 = 불균등 적설 최악 (쌍坡 1.25μr, 다경간 골 2.0) */
    const sPeak = e.role === 'purlin' ? c.snow * c.snowMu * shape.peakAt(n1.x) : 0
    const S = sPeak * trib * Math.cos(G.theta) ** 2
    const wt = e.role === 'purlin' ? (1.3 * D + 1.05 * sPeak * trib * Math.cos(G.theta)) * Math.sin(G.theta) : 1.3 * D
    const My = wt * (L / (sagCount(spec) + 1)) ** 2 / 8
    const demand = (combo: string, w: number) => ({ combo, f: { P: 0, Mx: c.gamma0 * Math.abs(w) * L ** 2 / 8, My: c.gamma0 * My, V: c.gamma0 * Math.abs(w) * L / 2 }, braced: false })
    out.set(e.id, { zone: zone as CCLoad['zone'], A, pPos, pNeg, demands: [demand(`GB C&C+ z${zone}`, 1.3 * normalD + 1.05 * S + 1.5 * pPos * trib), demand(`GB C&C- z${zone}`, normalD + 1.5 * pNeg * trib)] })
  }
  return out
}
