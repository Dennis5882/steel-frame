import { additionDesign } from './additionDesign'
import { factoryOnly } from './additions'
/* 부재 설계 검토 (M3) — 해석 결과 + 기준 프로필 강도식 → 부재별 강도비, 사용성.
   길이 가정 (보고서에 그대로 표기):
   - 기둥: 면내 K = 횡이동 골조 정렬도(4.8) · L = 처마높이, 면외 K = 1 · L = 거트 간격(거트 + 플라이브레이스가 양 플랜지 지지), Lb = 거트 간격
   - 지붕보: 면내 K = 1 · L = 처마~마루 경사길이, 면외 L = 퍼린 간격(퍼린 + 플라이브레이스), Lb = 퍼린 간격
   - 퍼린·거트(냉간성형 CC): 冷軋型鋼 규범(AISI S100 유효폭법, twColdFormed) — 해석 부재력 + 국부 풍압(風力規範 3장, secondary.ts) 중 지배.
     강축 L = 베이, 약축·Lb = 베이 / (새그로드 + 1), 약축 모멘트 × 1/(새그로드+1)² (해석 모델에 새그로드 없음).
     해석 부재력의 압축 플랜지: 퍼린은 중력 처짐과 같은 부호면 외장재 쪽(구속), 반대면 자유 플랜지(횡비틀림). 거트는 보수적으로 자유 플랜지
   - 스트럿: L = Lb = 베이 / 풍주: 강축 L = 풍주 높이, 약축·Lb = 거트 간격
   - 가새: X 교차점에서 서로 지지 → KL = 대각선 길이 / 2 (해석 모델은 교차점 미연결)
   2차 효과: 골조 부재(기둥·지붕보) B = max(B1, B2), B2 = (8.2-5) 조합 방향(X: 횡풍·X 지진, Y: 종풍·Y 지진, 중력: 큰 쪽);
   그 외 B = B1 (Cm = 1.0, 보수적). */
import { profileOf } from '../codes'
import { runCnDesign } from './cnDesign'
import { KR_DEFL, krPurlinDefl, runKrDesign } from './krDesign'
import { b1Of, b2Of, capacity, cbOf, check, kSway, SLENDER_LIMIT, type Capacity, type CheckResult } from '../codes/twSteel'
import type { Results } from '../actions/results'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { cfCapacity, cfCheck } from '../codes/twColdFormed'
import { ccLoads } from './secondary'
import { validateDesignResults } from './resultValidation'
import { roofDeflection } from './roofDeflection'
import { sagCount, support, withRestraintIssues, type DesignIssue } from './validity'
import { sectionProps } from './sections'
import type { ElementRole, FactoryModel, FactorySpec } from './types'

export interface MemberCheck {
  addition?: import('./additionTypes').AdditionUsage
  physicalKey?: string
  id: number
  role: ElementRole
  section: string
  ratio: number
  /** KR strength envelope before the separate slenderness/detail check. */
  strengthRatio?: number
  strengthGoverning?: { combo: string; eq: MemberCheck['eq']; part: number; B: number; Cb: number }
  combo: string
  /** 지배 지점 0..4 (I, 1/4, 2/4, 3/4, J), 가새는 -1 */
  part: number
  eq: CheckResult['eq'] | 'KL/r' | 'C5' | 'C3.3' | `TW CF ${string}` | `GB ${string}` | `KDS ${string}`
  forces: { P: number; Mx: number; My: number; V: number }
  cap: Pick<Capacity, 'phiPnc' | 'phiPnt' | 'phiMnx' | 'phiMny' | 'phiVn' | 'mxMode' | 'compact' | 'KLr' | 'lambdaC'>
  B: number
  Cb: number
  lengths: { KLx: number; KLy: number; Lb: number }
  slender: { value: number; limit: number }
  notes: string[]
  issues?: DesignIssue[]
}

export interface ServiceCheck {
  key: 'roofOpeningDefl' | 'linkGap' | 'linkSeat' | 'platformDefl' | 'craneDefl' | 'runwayDefl' | 'windDriftX' | 'windDriftY' | 'seisDriftX' | 'seisDriftY' | 'rafterDefl' | 'purlinDefl' | 'girtDefl' | 'postDefl'
  value: number
  limit: number
  ratio: number
  case: string
  clause: string
}
export const isLengthService=(key:ServiceCheck['key'])=>key.endsWith('Defl')||key==='linkGap'||key==='linkSeat'

/** LRFD 13.4.1 기둥 축력 — 휨 무시, 1.2PD + 0.5PL ± 1.4Fu·PE ≤ φPn. 일반 조합 Pu/φcPn ≤ 0.4 이면 면제 */
export interface ColumnAxial13 { elem: number; puRatio: number; exempt: boolean; ratio: number; combo: string; P: number; phiPn: number }

/** 국부 풍압 요약 (역할·구역별 대표) */
export interface CCSummary { role: ElementRole; zone: number | string; A: number; pPos: number; pNeg: number; count: number }

export interface DesignResult {
  /** CN: GB 51022 8.4.2 隅撑 설계 축력 (kN, 한쪽 배치 기준 — 쌍이면 각 1/2) */
  kneeBrace?: { column: number; rafter: number }
  cc?: CCSummary[]
  /** 13.4.1 지배 기둥 (내진 특별 조합이 있을 때) */
  col13?: ColumnAxial13 | null
  members: MemberCheck[]
  service: ServiceCheck[]
  /** 역할별 최대 강도비 부재 */
  byRole: Partial<Record<ElementRole, MemberCheck>>
  maxRatio: number
  ng: number
}

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

/** 조합 이름에서 횡력 방향 — 'WX…', '±EX' → X / 'WY…', '±EY' → Y / 중력 → null */
const comboDir = (c: string): 'X' | 'Y' | null => (/(W|E)X/.test(c) ? 'X' : /(W|E)Y/.test(c) ? 'Y' : null)

/** 퍼린 활하중 처짐 (m) — 단순보 5wL⁴/384EI, w = 지붕 활하중 × 퍼린 간격 × cosθ */
export function purlinDefl(spec: FactorySpec, info: LoadInfo, section: string): number {
  if (spec.code === 'KR') return krPurlinDefl(spec, info, section)
  const mat = profileOf(spec.code).materials[spec.material]
  const G = portalGeometry(spec)
  const wLR = spec.code === 'CN'
    ? (spec.roofDead + Math.max(info.roofLive * Math.cos(G.theta), (info.snowPeak ?? info.snow ?? 0) * Math.cos(G.theta))) * G.sRoof + mat.gamma * sectionProps(section, spec.code).A * 1e-6
    : info.roofLive * G.sRoof * Math.cos(G.theta) // kN/m
  return (5 * wLR * spec.baySpacing ** 4) / (384 * mat.E * 1e3 * (sectionProps(section, spec.code).Ix * 1e-12)) // m (E kPa, I m⁴)
}

/** 퍼린 처짐 한계 = 베이 / 이 값 — TW LRFD 11.5.3 L/360, CN GB 51022 표 3.3.2 L/150, KR 프로젝트 기준 L/240 */
export const purlinLimitDiv = (code: FactorySpec['code']) => (code === 'CN' ? 150 : code === 'KR' ? KR_DEFL.purlin : 360)

/** roles 를 주면 그 역할 부재만 검토하고 사용성은 생략 (단면 최적화 후보 평가용) */
export function runDesign(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, roles?: readonly ElementRole[]): DesignResult {
  validateDesignResults(spec, model, info, res, roles)
  return additionDesign(spec, model, info, res, runFactoryDesign(spec, factoryOnly(model), info, res, roles), roles)
}

function runFactoryDesign(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, roles?: readonly ElementRole[]): DesignResult {
  if (spec.code === 'CN') return withRestraintIssues(spec, runCnDesign(spec, model, info, res, roles))
  if (spec.code === 'KR') return withRestraintIssues(spec, runKrDesign(spec, model, info, res, roles))
  validateDesignResults(spec, model, info, res, roles)
  const prof = profileOf(spec.code)
  const mat = prof.materials[spec.material]
  const G = portalGeometry(spec)
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const mm = (m: number) => m * 1000

  /* 기둥 면내 K — G_top = (Ic/Lc) / (Ir/Lr), 지붕보 길이 = 처마~처마 경사길이(대칭 횡이동 = 역대칭 곡률), G_bottom = 핀 10 / 고정 1 */
  const col = sectionProps(spec.sections.column, spec.code), raf = sectionProps(spec.sections.rafter, spec.code)
  /* 기둥 열마다 높이 h = 그 열 처마 높이 (편경사는 좌우 다름, 박공은 같음) */
  const Kcol = (h: number) => kSway((col.Ix / h) / (raf.Ix / G.rafterLen), spec.baseFixity === 'fixed' ? 1 : 10)
  const KcolAt = new Map(G.eaveXs.map((x) => [x, Kcol(G.zAt(x))]))
  const Lsec = (spec.baySpacing / (sagCount(spec) + 1))

  const lengthsOf = (role: ElementRole, Lel: number, e: { n1: number; n2: number; lean?: true }) => {
    const flyL = support(spec, 'flyBraces') === 'none' ? (role === 'rafter' ? G.slopeLen : G.zAt(nodes.get(e.n1)!.x)) : Lel
    const crossL = support(spec, 'braceCrossing') === 'none' ? Lel : Lel / 2
    switch (role) {
      /* 흔들림 기둥(다경간 내부): 양단 핀 → 면내 K = 1, L = 기둥 전체 높이 */
      case 'column': { const x = nodes.get(e.n1)!.x; return { KLx: mm((e.lean ? 1 : KcolAt.get(x)!) * G.zAt(x)), KLy: mm(flyL), Lb: mm(flyL) } }
      case 'rafter': return { KLx: mm(G.slopeLen), KLy: mm(flyL), Lb: mm(flyL) }
      case 'purlin': case 'girt': return { KLx: mm(Lel), KLy: mm(Math.min(Lel, Lsec)), Lb: mm(Math.min(Lel, Lsec)) }
      case 'post': return { KLx: mm(G.zAt(nodes.get(e.n1)!.x)), KLy: mm(flyL), Lb: mm(flyL) }
      case 'brace': return { KLx: mm(crossL), KLy: mm(crossL), Lb: mm(crossL) }
      default: return { KLx: mm(Lel), KLy: mm(Lel), Lb: mm(Lel) }
    }
  }

  /* 조합 용도: basic = 일반 검토, amplified(E′) = 가새 구조 부재(13.8.4)·기둥 축력(13.4.1)만, gravity = 접합부 용량 설계용 */
  const kindOf = (c: string) => info.comboKind?.[c] ?? 'basic'
  const usable = (role: ElementRole, c: string) => kindOf(c) === 'basic' || (role === 'brace' && kindOf(c) === 'amplified')
  let col13: ColumnAxial13 | null = null

  const cc = ccLoads(spec, model, info)
  /** 두께별 Fy — 판 두께 max(tf, tw) (프로필 fyAt, 없으면 재료 fy) */
  const fyOf = (sp: { tf: number; tw: number }) => prof.fyAt?.(spec.material, Math.max(sp.tf, sp.tw)) ?? mat.fy
  /** 냉간성형 퍼린·거트 — 해석 부재력(일반 조합) + 국부 풍압 */
  const coldFormedMember = (e: FactoryModel['elements'][number], Lel: number): MemberCheck | null => {
    const sp = sectionProps(e.section, spec.code)
    const { KLx, KLy, Lb } = lengthsOf(e.role, Lel, e)
    const cf = cfCapacity(e.section, sp, mat.fy, mat.E, { Lx: KLx, Ly: KLy, Lt: Lb, Lb }, 1)
    const myScale = 1 / (sagCount(spec) + 1) ** 2
    let best: MemberCheck | null = null
    const consider = (combo: string, part: number, f: MemberCheck['forces'], braced: boolean) => {
      const r = cfCheck(cf, f, braced)
      if (best && r.ratio <= best.ratio) return
      best = {
        id: e.id, role: e.role, section: e.section, ratio: r.ratio, combo, part, eq: r.eq, forces: f,
        cap: { phiPnc: cf.phiPnc, phiPnt: cf.phiPnt, phiMnx: braced ? cf.phiMnxBraced : cf.phiMnxLTB, phiMny: cf.phiMny, phiVn: cf.phiVn,
          mxMode: !braced && cf.phiMnxLTB < cf.phiMnxBraced ? 'CF-LTB' : cf.notes.includes('CF-distortional') ? 'CF-distortional' : 'CF', compact: 'noncompact', KLr: cf.KLr, lambdaC: Math.sqrt(mat.fy / Math.max(cf.Fn, 1e-9)) },
        B: 1, Cb: 1, lengths: { KLx, KLy, Lb }, slender: { value: 0, limit: 0 }, notes: cf.notes,
        issues: cf.applicable ? [] : [{ key: 'coldFormedRange', level: 'blocked', detail: 'TW CF 1.1 / 3.2 / 4.2 / 4.5' }],
      }
    }
    const beam = res.beam.get(e.id)
    /* 퍼린 처짐 부호: 중력 조합(2.2-2, 없으면 첫 basic) 중앙 모멘트 부호 */
    const grav = beam ? [...beam.entries()].find(([c]) => kindOf(c) === 'basic' && /2\.2-2/.test(c)) ?? [...beam.entries()].find(([c]) => kindOf(c) === 'basic') : undefined
    const sag = grav ? Math.sign(grav[1][2]?.My ?? 0) || 1 : 1
    let maxComp = 0
    for (const [combo, pts] of beam ?? []) {
      if (!usable(e.role, combo)) continue
      const braced = e.role === 'purlin' && Math.sign(pts[2]?.My ?? 0) === sag
      for (const [i, p] of pts.entries()) {
        maxComp = Math.max(maxComp, -p.P)
        consider(combo, i, { P: p.P, Mx: Math.abs(p.My), My: Math.abs(p.Mz) * myScale, V: Math.abs(p.Vz) }, braced)
      }
    }
    for (const d of cc.get(e.id)?.demands ?? []) consider(d.combo, 2, d.f, d.braced)
    if (!best) return null
    const b = best as MemberCheck
    const slender = maxComp > 1e-3
      ? { value: Math.max(KLx / sp.rx, KLy / sp.ry), limit: SLENDER_LIMIT.compression }
      : { value: Math.max(KLx, KLy) / Math.min(sp.rx, sp.ry), limit: SLENDER_LIMIT.tension }
    b.slender = slender
    if (slender.value / slender.limit > b.ratio) { b.ratio = slender.value / slender.limit; b.eq = 'KL/r' }
    return b
  }
  const members: MemberCheck[] = []
  for (const e of model.elements) {
    if (roles && !roles.includes(e.role)) continue
    if ((e.role === 'purlin' || e.role === 'girt') && sectionProps(e.section, spec.code).kind === 'CC') {
      const m = coldFormedMember(e, dist(nodes.get(e.n1)!, nodes.get(e.n2)!))
      if (m) members.push(m)
      continue
    }
    const sp = sectionProps(e.section, spec.code)
    const Lel = e.designLength ?? dist(nodes.get(e.n1)!, nodes.get(e.n2)!)
    const { KLx, KLy, Lb } = lengthsOf(e.role, Lel, e)
    const frame = e.role === 'column' || e.role === 'rafter'
    let best: MemberCheck | null = null
    let maxComp = 0

    const consider = (combo: string, part: number, f: MemberCheck['forces'], cap: Capacity, B: number, Cb: number) => {
      const r = check(cap, f, B)
      if (!best || r.ratio > best.ratio) {
        best = {
          id: e.id, role: e.role, section: e.section, ratio: r.ratio, combo, part, eq: r.eq, forces: f,
          cap: { phiPnc: cap.phiPnc, phiPnt: cap.phiPnt, phiMnx: cap.phiMnx, phiMny: cap.phiMny, phiVn: cap.phiVn, mxMode: cap.mxMode, compact: cap.compact, KLr: cap.KLr, lambdaC: cap.lambdaC },
          B, Cb, lengths: { KLx, KLy, Lb }, slender: { value: 0, limit: 0 }, notes: cap.notes,
          issues: cap.notes.filter((n) => n.startsWith('TW applicability:')).map((detail) => ({ key: 'sectionRange', level: 'blocked', detail })),
        }
      }
    }

    if (e.role === 'brace') {
      for (const [combo, P] of res.truss.get(e.id) ?? []) {
        if (!usable(e.role, combo)) continue
        if (P < 0) maxComp = Math.max(maxComp, -P)
        const cap = capacity(sp, fyOf(sp), mat.E, { KLx, KLy, Lb }, 1, Math.max(0, -P))
        consider(combo, -1, { P, Mx: 0, My: 0, V: 0 }, cap, 1, 1)
      }
    } else {
      let puMax = 0, ampMax = 0, ampCombo = '', ampP = 0, ampCap = 0
      for (const [combo, pts] of res.beam.get(e.id) ?? []) {
        if (e.role === 'column' && kindOf(combo) === 'amplified') {
          /* 13.4.1: 휨 무시 축력만 — 압축 φcPn, 인장 φtPn */
          const Pmin = Math.min(...pts.map((p) => p.P)), Pmax = Math.max(...pts.map((p) => p.P))
          const capA = capacity(sp, fyOf(sp), mat.E, { KLx, KLy, Lb }, 1, Math.max(0, -Pmin))
          for (const [P, cap] of [[Pmin, capA.phiPnc], [Pmax, capA.phiPnt]] as const) {
            const r = (P < 0 ? -P : P) / cap
            if (r > ampMax) { ampMax = r; ampCombo = combo; ampP = P; ampCap = cap }
          }
          continue
        }
        if (!usable(e.role, combo)) continue
        const Cb = cbOf(pts.map((p) => p.My))
        const Pc = Math.max(0, ...pts.map((p) => -p.P))
        maxComp = Math.max(maxComp, Pc)
        const cap = capacity(sp, fyOf(sp), mat.E, { KLx, KLy, Lb }, Cb, Pc)
        puMax = Math.max(puMax, Pc / cap.phiPnc)
        const B1 = b1Of(Pc, sp, mat.E, KLx > 0 ? Math.min(KLx, mm(Lel)) : mm(Lel))
        let B = B1
        if (frame) {
          const d = comboDir(combo)
          const sw = res.sway.get(combo)
          const b2 = (dir: 'X' | 'Y') => (sw ? b2Of(sw[dir].sumPu, sw[dir].drift, sw[dir].sumH, spec.eaveHeight) : 1)
          B = Math.max(B1, d ? b2(d) : Math.max(b2('X'), b2('Y')))
        }
        /* 퍼린·거트 약축: 해석 모델에 새그로드가 없어 베이 전체 경간으로 계산됨 → 경간 L/(n+1) 기준으로 1/(n+1)² 축소 */
        const myScale = e.role === 'purlin' || e.role === 'girt' ? 1 / (sagCount(spec) + 1) ** 2 : 1
        pts.forEach((p, i) => consider(combo, i, { P: p.P, Mx: Math.abs(p.My), My: Math.abs(p.Mz) * myScale, V: Math.abs(p.Vz) }, cap, B, Cb))
      }
      if (e.role === 'column' && ampCombo) {
        const exempt = puMax <= 0.4
        const c13: ColumnAxial13 = { elem: e.id, puRatio: puMax, exempt, ratio: ampMax, combo: ampCombo, P: ampP, phiPn: ampCap }
        /* 지배 = 면제 아닌 것 우선, 그다음 비율 */
        const key = (x: ColumnAxial13) => (x.exempt ? 0 : 10) + x.ratio
        if (!col13 || key(c13) > key(col13)) col13 = c13
      }
    }
    if (!best) continue
    const b = best as MemberCheck
    /* 4.4 세장비 — 압축이 있으면 200, 인장만이면 300 */
    const r = Math.min(sp.rx, sp.ry)
    const slender = maxComp > 1e-3
      ? { value: Math.max(KLx / sp.rx, KLy / sp.ry), limit: SLENDER_LIMIT.compression }
      : { value: Math.max(KLx, KLy) / r, limit: SLENDER_LIMIT.tension }
    b.slender = slender
    if (slender.value / slender.limit > b.ratio) { b.ratio = slender.value / slender.limit; b.eq = 'KL/r' }
    members.push(b)
  }

  /* ── 사용성 ── */
  const service: ServiceCheck[] = []
  if (roles) return { ...summarize(members, service), col13 }
  const eaveIds = model.nodes.filter(G.isEaveNode).map((n) => n.id)
  /* 風力規範 4.2: 50년 풍 층간변위각 ≤ 5/1000 — 순풍향·횡풍향·비틀림을 2.12 로 조합 (info.wind.variants, 양 풍향 모두) */
  const wv = info.wind.variants?.length ? info.wind.variants : [...res.disp.keys()].filter((c) => /^W[XY]\d/.test(c)).map((c) => ({ tag: c, dir: 'X' as const, parts: [{ lc: c, f: 1 }] }))
  for (const [key, comp] of [['windDriftX', 'dx'], ['windDriftY', 'dy']] as const) {
    let v = 0, at = ''
    for (const w of wv) for (const id of eaveIds) {
      const d = Math.abs(w.parts.reduce((s, p) => s + p.f * (res.disp.get(p.lc)?.get(id)?.[comp] ?? 0), 0))
      if (d > v) { v = d; at = w.tag }
    }
    service.push({ key, value: v / spec.eaveHeight, limit: 0.005, ratio: v / spec.eaveHeight / 0.005, case: at, clause: '風力規範 4.2·2.12' })
  }
  /* 耐震規範 2.16.1: V* (I = 1) 지진력 아래 층간변위각 ≤ 0.005 — EX/EY 변위 × cStar/c */
  for (const [key, comp, lc, d] of [['seisDriftX', 'dx', 'EX', 'X'], ['seisDriftY', 'dy', 'EY', 'Y']] as const) {
    const s = info.seismic[d]
    /* 2.16.1 "計算位移時應計及平移與扭轉位移" — E ± ET */
    let v = 0
    const dE = res.disp.get(lc), dT = res.disp.get(`ET${d}`)
    for (const id of eaveIds) for (const sg of [1, -1]) {
      const x = Math.abs((dE?.get(id)?.[comp] ?? 0) + sg * (dT?.get(id)?.[comp] ?? 0)) * (s.cStar / s.c)
      if (x > v) v = x
    }
    service.push({ key, value: v / spec.eaveHeight, limit: 0.005, ratio: v / spec.eaveHeight / 0.005, case: `${lc} × V*/V`, clause: '耐震規範 2.16.1' })
  }
  /* LRFD 11.5.3: 활하중 처짐 ≤ 스팬/360 — 지붕보: 마루 − 처마 평균 (LR), 퍼린: 단순보 5wL⁴/384EI */
  const lr = res.disp.get('LR')
  if (lr) {
    service.push({ key: 'rafterDefl', ...roofDeflection(spec, model, res, ['LR'], 360), clause: 'LRFD 11.5.3' })
  }
  const Lp = spec.baySpacing
  const dPur = purlinDefl(spec, info, spec.sections.purlin)
  service.push({ key: 'purlinDefl', value: dPur, limit: Lp / 360, ratio: dPur / (Lp / 360), case: 'LR', clause: 'LRFD 11.5.3' })
  const out = summarize(members, service)
  const ccSum = new Map<string, CCSummary>()
  for (const [id, c] of cc) {
    const role = model.elements.find((x) => x.id === id)?.role ?? 'purlin'
    const k = `${role}|${c.zone}`
    const s = ccSum.get(k)
    if (s) { s.count++; s.pNeg = Math.min(s.pNeg, c.pNeg); s.pPos = Math.max(s.pPos, c.pPos) }
    else ccSum.set(k, { role, zone: c.zone, A: c.A, pPos: c.pPos, pNeg: c.pNeg, count: 1 })
  }
  out.cc = [...ccSum.values()].sort((x, y) => (x.role === y.role ? String(x.zone).localeCompare(String(y.zone)) : x.role === 'purlin' ? -1 : 1))
  const c13 = col13 as ColumnAxial13 | null
  if (c13 && !c13.exempt && c13.ratio > 1) out.ng++
  return withRestraintIssues(spec, { ...out, col13: c13 })
}

function summarize(members: MemberCheck[], service: ServiceCheck[]): DesignResult {
  const byRole: DesignResult['byRole'] = {}
  for (const m of members) if (!byRole[m.role] || m.ratio > byRole[m.role]!.ratio) byRole[m.role] = m
  const maxRatio = Math.max(0, ...members.map((m) => m.ratio))
  const ng = members.filter((m) => m.ratio > 1).length + service.filter((s) => s.ratio > 1).length
  return { members, service, byRole, maxRatio, ng }
}
