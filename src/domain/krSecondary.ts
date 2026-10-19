import { sagCount } from './validity'
/* 한국 KDS 41 12 00 5.4·5.8 — 퍼린·거트 외장재설계용 풍하중 (순수 함수).
   KDS 1.2 용어: 외장재설계용 풍하중은 외장재와 이를 지지하는 파스너·퍼린·거트에 적용 → 주골조 풍압 대신 이 하중으로도 검토(둘 중 불리).
   W_C/A_C = q_H(Ĉpe − Ĉpi) (5.4-3), |p| ≥ 0.675 kN/m². 단순보(양단 핀): Mx = wL²/8, V = wL/2.
   조합 (1.7.1): 정압 1.2D + 1.6(Lr 또는 S) + 0.5W (1.7-3) · 1.2D + 1.0W + 0.5(Lr 또는 S) (1.7-4), 부압 0.9D + 1.0W (1.7-6).
   구역: 부재가 걸친 가장 불리한 구역을 전 길이에 (보수적). 박공·다중박공 θ > 10° 는 용마루 양측 띠도 ②, 다중박공은 경간마다
   (θ ≤ 10° 는 표 5.8-2② ① 을 건물 전체 외곽으로). 편지붕은 가장자리 띠 2a·모서리 2a × 4a (양방향) 로 보수적 단순화.
   벽: 표 5.8-2① 모서리 띠 a 안 = ⑤. 플랜지 구속: 순하중이 외장재 쪽(정압)이면 구속, 바깥(부압)이면 새그로드 간격 L_b. */
import { cpeCCKR, cpiCCKR, CC_MIN_KR, effAreaKR, zoneWidthKR, type CCZoneKR, type RoofFormKR } from '../codes/krWindCC'
import { velocityKR } from '../codes/krLateral'
import { profileOf } from '../codes'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import type { CCLoad } from './secondary'
import { frameSpans, type FactoryModel, type FactorySpec } from './types'

/** 외장재 설계속도압 q_H (kN/m²) — 조도 A·B·C → C, D → D (5.4.2(1)) */
export function ccVelocityKR(spec: FactorySpec, info: LoadInfo): number {
  const k = spec.korea!
  return velocityKR({ V0: k.V0, KD: k.KD, Kzt: k.Kzt, Iw: info.kr!.Iw, H: info.wind.hRef, cat: k.exposure === 'D' ? 'D' : 'C' }).qH
}

export function krCCLoads(spec: FactorySpec, model: FactoryModel, info: LoadInfo): Map<number, CCLoad> {
  const out = new Map<number, CCLoad>()
  const G = portalGeometry(spec), k = spec.korea!
  const form: RoofFormKR = spec.frame === 'mono' ? 'mono' : spec.frame === 'multi' ? 'multi' : 'gable'
  const H = info.wind.hRef, q = ccVelocityKR(spec, info)
  const [cpiPos, cpiNeg] = cpiCCKR(k.cpi)
  const deg = (G.theta * 180) / Math.PI
  const gamma = profileOf(spec.code).materials[spec.secondaryMaterial ?? spec.material]?.gamma ?? profileOf(spec.code).materials[spec.material].gamma
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const cos = Math.cos(G.theta), sin = Math.sin(G.theta)
  const grav = Math.max(info.roofLive, info.snow ?? 0) // 지붕활하중·균형 적설 중 큰 값 (수평투영)
  /* 구역 폭 — 벽·건물 외곽 a (최소폭 = 전체), 다중박공 θ > 10° 는 경간 a */
  const aAll = zoneWidthKR(H, Math.min(spec.span, G.length))
  const spans = frameSpans(spec), edges = spans.reduce<number[]>((xs, s) => [...xs, xs[xs.length - 1] + s], [0])
  const perSpan = form === 'multi' && deg > 10
  /** 지붕 x 위치의 가장자리 띠 여부와 구역 폭 */
  const roofEdge = (x: number): { edge: boolean; a: number } => {
    if (perSpan) {
      const i = Math.max(0, edges.findIndex((e, j) => j > 0 && x <= e + 1e-9) - 1), x0 = edges[i], x1 = edges[i + 1]
      const a = zoneWidthKR(H, Math.min(x1 - x0, G.length))
      return { edge: x <= x0 + a + 1e-9 || x >= x1 - a - 1e-9 || Math.abs(x - (x0 + x1) / 2) <= a + 1e-9, a }
    }
    const eave = x <= aAll + 1e-9 || x >= spec.span - aAll - 1e-9
    return { edge: eave || (deg > 10 && G.ridges.some((r) => Math.abs(x - r) <= aAll + 1e-9)), a: aAll }
  }
  const nSeg = sagCount(spec) + 1
  for (const e of model.elements) {
    if (e.role !== 'purlin' && e.role !== 'girt') continue
    const p1 = nodes.get(e.n1)!, p2 = nodes.get(e.n2)!
    const L = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z)
    const self = gamma * sectionProps(e.section, spec.code).A * 1e-6 // kN/m
    const yLo = Math.min(p1.y, p2.y), yHi = Math.max(p1.y, p2.y)
    let zone: CCZoneKR, trib: number, wD: number, wS: number, wt: number
    if (e.role === 'purlin') {
      trib = G.sRoof
      const dy = Math.min(yLo, G.length - yHi) // 박공(마구리)벽에서 부재 끝까지
      if (form === 'mono') {
        /* 편지붕: 가장자리 띠 2a, 모서리 2a × 4a 를 양방향으로 (방향 구분 생략 — 보수적) */
        const dx = Math.min(p1.x, spec.span - p1.x), a2 = 2 * aAll
        const corner = (dx <= a2 + 1e-9 && dy < 2 * a2 - 1e-9) || (dx <= 2 * a2 + 1e-9 && dy < a2 - 1e-9)
        zone = corner ? 3 : dx <= a2 + 1e-9 || dy < a2 - 1e-9 ? 2 : 1
      } else {
        const { edge, a } = roofEdge(p1.x), nearGable = dy < a - 1e-9
        zone = edge && nearGable ? 3 : edge || nearGable ? 2 : 1
      }
      const D = spec.roofDead * trib + self
      wD = D * cos // 지붕면 법선
      wS = grav * trib * cos * cos // 수평투영 → 법선
      wt = (1.2 * D + 0.5 * grav * trib * cos) * sin // 경사 성분 (약축)
    } else {
      const side = e.face === 'x0' || e.face === 'xL'
      trib = side ? G.gWallAt(p1.x) : G.gEnd
      const xLo = Math.min(p1.x, p2.x), xHi = Math.max(p1.x, p2.x)
      zone = (side ? yLo < aAll - 1e-9 || yHi > G.length - aAll + 1e-9 : xLo < aAll - 1e-9 || xHi > spec.span - aAll + 1e-9) ? 5 : 4
      wD = 0; wS = 0
      wt = 1.2 * (spec.wallDead * trib + self) // 벽 자중 (약축)
    }
    const A = effAreaKR(L, trib)
    const c = cpeCCKR(form, zone, A, deg)
    /* 정압 = 면을 향함(+). Ĉpi 는 반대 부호를 짝지어 불리하게 */
    const pPos = Math.max(q * (c.pos - cpiNeg), CC_MIN_KR), pNeg = Math.min(q * (c.neg - cpiPos), -CC_MIN_KR)
    const My = (wt * (L / nSeg) ** 2) / 8
    const mk = (combo: string, w: number, braced: boolean) => ({ combo, f: { P: 0, Mx: (Math.abs(w) * L ** 2) / 8, My, V: (Math.abs(w) * L) / 2 }, braced })
    const w3 = 1.2 * wD + 1.6 * wS + 0.5 * pPos * trib
    const w4 = 1.2 * wD + 1.0 * pPos * trib + 0.5 * wS
    const w6 = 0.9 * wD + 1.0 * pNeg * trib
    out.set(e.id, {
      zone, A, pPos, pNeg,
      demands: [
        ...(e.role === 'purlin' ? [mk(`C&C+ z${zone} 1.7-3`, w3, true)] : []),
        mk(`C&C+ z${zone} 1.7-4`, w4, true),
        mk(`C&C− z${zone} 1.7-6`, w6, w6 > 0),
      ],
    })
  }
  return out
}
