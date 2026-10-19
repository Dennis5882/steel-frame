import { sagCount } from './validity'
/* 2차부재(퍼린·거트) 국부 풍압 하중 (순수 함수) — 대만 風力規範 3장 局部構材及外部被覆物.
   受風面積 < 65 m² 인 퍼린·거트는 MWFRS(2장) 대신 3.2 의 p = q(h)[(GCp) − (GCpi)] 로 설계 (3.1).
   단순보(양단 핀): Mx = wL²/8, V = wL/2. 조합 (LRFD 2.2): 정압 1.2D + 0.5L + 1.6W, 부압 0.9D + 1.6W.
   부재가 걸친 구역 중 가장 불리한 구역 적용(부재 전 길이에 동일 압력 — 보수적).
   플랜지 구속: 정압(외장재 쪽 플랜지 압축) = 구속, 부압(자유 플랜지 압축) = 새그로드 간격 횡비틀림.
   약축: 중력(지붕 경사 성분·벽 자중)을 새그로드 경간 L/(n+1) 단순보로 — wt·(L/(n+1))²/8. */
import { profileOf } from '../codes'
import { cnCCLoads } from './cnSecondary'
import { krCCLoads } from './krSecondary'
import { effArea, gcpCC, zoneWidth, type CCZone } from '../codes/twWindCC'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import type { FactoryModel, FactorySpec } from './types'

export interface CCDemand {
  combo: string
  f: { P: number; Mx: number; My: number; V: number }
  /** 압축 플랜지가 외장재에 구속 */
  braced: boolean
}
export interface CCLoad { zone: CCZone | string; A: number; pPos: number; pNeg: number; demands: CCDemand[] }

export function ccLoads(spec: FactorySpec, model: FactoryModel, info: LoadInfo): Map<number, CCLoad> {
  if (spec.code === 'CN') return cnCCLoads(spec, model, info)
  if (spec.code === 'KR') return krCCLoads(spec, model, info)
  const out = new Map<number, CCLoad>()
  const G = portalGeometry(spec)
  const gamma = profileOf(spec.code).materials[spec.material].gamma
  const gpi = Math.abs(info.wind.cases[0]?.gcpi ?? 0)
  const q = info.wind.qh
  const thetaDeg = (G.theta * 180) / Math.PI
  const a = zoneWidth(info.wind.hRef, Math.min(spec.span, G.length))
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const cos = Math.cos(G.theta), sin = Math.sin(G.theta)
  const nSeg = sagCount(spec) + 1
  for (const e of model.elements) {
    if (e.role !== 'purlin' && e.role !== 'girt') continue
    const p1 = nodes.get(e.n1)!, p2 = nodes.get(e.n2)!
    const L = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z)
    const self = gamma * sectionProps(e.section, spec.code).A * 1e-6 // kN/m
    let zone: CCZone, trib: number, wD: number, wL: number, wt: number
    const yLo = Math.min(p1.y, p2.y), yHi = Math.max(p1.y, p2.y)
    const nearGable = yLo < a - 1e-9 || yHi > G.length - a + 1e-9
    if (e.role === 'purlin') {
      trib = G.sRoof
      const nearEave = G.nearEave(p1.x, a, 1e-9)
      const nearRidge = thetaDeg > 7 && G.nearRidge(p1.x, a, 1e-9) // 7° 초과면 마루 띠도 ②
      const edge = nearEave || nearRidge
      zone = edge && nearGable ? 3 : edge || nearGable ? 2 : 1
      const D = spec.roofDead * trib + self
      wD = D * cos // 지붕면 법선
      wL = info.roofLive * trib * cos * cos // 수평투영 활하중 → 법선
      wt = (1.2 * D + 0.5 * info.roofLive * trib * cos) * sin // 경사 성분 (약축)
    } else {
      trib = G.gWall
      const wall = e.face === 'x0' || e.face === 'xL'
      const xLo = Math.min(p1.x, p2.x), xHi = Math.max(p1.x, p2.x)
      const corner = wall ? nearGable : xLo < a - 1e-9 || xHi > spec.span - a + 1e-9
      zone = corner ? 5 : 4
      wD = 0; wL = 0
      wt = 1.2 * (spec.wallDead * trib + self) // 벽 자중 (약축)
    }
    const A = effArea(L, trib)
    const g = gcpCC(zone, A, thetaDeg)
    const pPos = q * (g.pos + gpi), pNeg = q * (g.neg - gpi) // kN/m² (+ 면을 향함)
    const Ls = L / nSeg
    const My = (wt * Ls ** 2) / 8
    const mk = (combo: string, w: number, braced: boolean): CCDemand =>
      ({ combo, f: { P: 0, Mx: (Math.abs(w) * L ** 2) / 8, My, V: (Math.abs(w) * L) / 2 }, braced })
    /* 정압 — 외장재 쪽 플랜지 압축(구속). 부압 — 순하중이 바깥으로 향하면 자유 플랜지 압축 */
    const wPos = 1.2 * wD + 0.5 * wL + 1.6 * pPos * trib
    const wNeg = 0.9 * wD + 1.6 * pNeg * trib
    out.set(e.id, {
      zone, A, pPos, pNeg,
      demands: [mk(`C&C+ z${zone} 2.2-3`, wPos, true), mk(`C&C− z${zone} 2.2-6`, wNeg, wNeg > 0)],
    })
  }
  return out
}
