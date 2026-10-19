/* 다층 강골조 → Gen NX DB 페이로드 (순수). 단위 kN·m.
   라이브 확인(docs/gate-0-report.md): STOR 15필드, FBLD/FBLA, STYP/LTOM, SPFC CH2010, SPLC XY+우발편심, LCOM-GEN(ST+RS).
   재료: GB50017-17(S) DB 는 API 거부 → 사용자 정의 STEEL (gen-api-cautions.md 5). */
import type { FrameModel, FrameSpec } from './types'
import { elementLength } from './geometry'
import { ALPHA_MAX, SFI, frameCombos, tgOf, windLoads, type CaseKey } from './loads'

const CASE: Record<CaseKey, { name: string; anal: 'ST' | 'RS' }> = {
  D: { name: 'DL', anal: 'ST' }, L: { name: 'LL', anal: 'ST' }, LF: { name: 'LF', anal: 'ST' }, S: { name: 'SL', anal: 'ST' }, WX: { name: 'WX', anal: 'ST' }, WY: { name: 'WY', anal: 'ST' },
  RX: { name: 'RX', anal: 'RS' }, RY: { name: 'RY', anal: 'RS' },
}
export const caseName = (k: CaseKey) => CASE[k].name

export interface FramePayloads {
  UNIT: object; MATL: object; SECT: object; NODE: object; ELEM: object; CONS: object
  STLD: object; BODF: object; FBLD: object; FBLA: object; BMLD: object; CNLD: object
  STOR: object; STYP: object; LTOM: object; EIGV: object; SPFC: object; SPLC: object; 'LCOM-GEN': object
  /** 참고: 조합 이름·지진 여부, 풍력 */
  combos: ReturnType<typeof frameCombos>
  wind: ReturnType<typeof windLoads>[]
}

const E_KN_M2 = 2.06e8

export function framePayloads(spec: FrameSpec, model: FrameModel): FramePayloads {
  const sectNo = { beam: 1, column: 2, brace: 3 } as const
  const sect = (name: string) => ({
    SECTTYPE: 'DBUSER', SECT_NAME: name.replace(/ /g, ''),
    SECT_BEFORE: { OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0, HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0, VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0,
      USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: false, SHAPE: 'H', DATATYPE: 1, SECT_I: { DB_NAME: 'GB-YB05', SECT_NAME: name } },
  })
  const NODE: Record<number, object> = {}
  for (const n of model.nodes) NODE[n.id] = { X: n.x, Y: n.y, Z: n.z }
  const ELEM: Record<number, object> = {}
  for (const e of model.elements) ELEM[e.id] = { TYPE: 'BEAM', MATL: 1, SECT: sectNo[e.role], NODE: [e.n1, e.n2], ANGLE: 0 }
  const CONS: Record<number, object> = {}
  for (const id of model.supports) CONS[id] = { ITEMS: [{ ID: id, CONSTRAINT: '1111110' }] }

  const ns = model.levels.length - 1
  const FBLA: Record<number, object> = {}
  model.floorRegions.forEach((r, i) => { FBLA[i + 1] = { FLOOR_LOAD_TYPE_NAME: r.level === ns ? 'ROOF' : 'FLOOR', FLOOR_DIST_TYPE: 2, DIR: 'GZ', NODES: r.nodes, GROUP_NAME: '' } })
  const BMLD: Record<number, object> = {}
  for (const e of model.elements) if (e.role === 'beam' && e.edge) {
    const w = e.story === ns ? spec.loads.edgeRoof : spec.loads.edgeFloor
    if (w > 0) BMLD[e.id] = { ITEMS: [{ ID: 1, LCNAME: 'DL', GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: 'GZ', USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [-w, -w, 0, 0] }] }
  }
  /* 풍: 층력을 그 레벨 모든 절점에 균등 분배 (강성 바닥). 한 절점의 같은 케이스는 하나만 — 케이스별 ITEM */
  const wind = [windLoads(spec, model, 'X'), windLoads(spec, model, 'Y')]
  const CNLD: Record<number, { ITEMS: object[] }> = {}
  for (const w of wind) for (const s of w.stories) {
    const ids = model.nodes.filter((n) => n.level === s.level).map((n) => n.id)
    const f = s.F / ids.length
    for (const id of ids) {
      const it = (CNLD[id] ??= { ITEMS: [] }).ITEMS
      it.push({ ID: it.length + 1, LCNAME: w.dir === 'X' ? 'WX' : 'WY', GROUP_NAME: '', FX: w.dir === 'X' ? f : 0, FY: w.dir === 'Y' ? f : 0, FZ: 0, MX: 0, MY: 0, MZ: 0 })
    }
  }

  /* 층 데이터 — 받는 폭·중심은 평면 외곽 기준, 우발편심 5% */
  const xs = model.nodes.map((n) => n.x), ys = model.nodes.map((n) => n.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const STOR: Record<number, object> = {}
  model.levels.forEach((z, k) => {
    STOR[k + 1] = { STORY_NAME: spec.storyNames[k], STORY_LEVEL: z, bFLOOR_DIAPHRAGM: k > 0,
      WIND_FLOOR_WIDTH_X: y1 - y0, WIND_FLOOR_WIDTH_Y: x1 - x0, WIND_CENTER_X: (x0 + x1) / 2, WIND_CENTER_Y: (y0 + y1) / 2,
      WIND_ECCENT_X: 0, WIND_ECCENT_Y: 0, SEIS_ACC_ECCENT_X: 0.05 * (x1 - x0), SEIS_ACC_ECCENT_Y: 0.05 * (y1 - y0),
      SEIS_INHERENT_ECCENT_X: 0, SEIS_INHERENT_ECCENT_Y: 0, SEIS_TORSIONAL_AMP_FACTOR_X: 1, SEIS_TORSIONAL_AMP_FACTOR_Y: 1 }
  })

  const s = spec.seismic, Tg = tgOf(s)
  const splc = (name: string, angle: number) => ({ NAME: name, DIR: 'XY', ANGLE: angle, SCALE: 1, PMFT: 1, bDAMP: false, INTERP: 'LOG', DESC: '', COMTYPE: 'CQC',
    bADDSIGN: true, iSIGNTYPE: 0, bMODE: false, aFUNCNAME: ['CN-RS'],
    ...(s.accidentalEccentricity ? { bACCECC: true, bACCECC_AUTO: true, ACCECC_PERCENT: 5, bACCECC_CONSIDER_GL: false, bACCECC_MINIMUM_TORSION: false, aACCECC_ECCEN_LIST: [] } : {}) })

  /* 적설: 지붕 SL = μr·s0, 바닥 활하중만 LF (적설 조합용). 없으면 예제와 같은 4케이스 */
  const snow = spec.loads.roofSnow * spec.loads.snowMu > 0
  const combos = frameCombos(snow)
  const LCOM: Record<number, object> = {}
  combos.forEach((c, i) => {
    LCOM[i + 1] = { NAME: c.name, ACTIVE: 'ACTIVE', iTYPE: 0, DESC: c.desc, vCOMB: c.terms.map(([k, f]) => ({ ANAL: CASE[k].anal, LCNAME: CASE[k].name, FACTOR: f })) }
  })

  return {
    UNIT: { 1: { FORCE: 'KN', DIST: 'M', HEAT: 'KJ', TEMPER: 'C' } },
    MATL: { 1: { TYPE: 'STEEL', NAME: spec.material === 'Q355B' ? 'Q355' : 'Q235', DAMP_RAT: s.damping,
      PARAM: [{ P_TYPE: 2, ELAST: E_KN_M2, POISN: 0.3, THERMAL: 1.2e-5, DEN: 78.5, MASS: 78.5 / 9.806 }] } },
    SECT: { 1: sect(spec.sections.beam), 2: sect(spec.sections.column), 3: sect(spec.sections.brace) },
    NODE, ELEM, CONS,
    STLD: { 1: { NAME: 'DL', TYPE: 'D', DESC: 'Dead' }, 2: { NAME: 'LL', TYPE: 'L', DESC: 'Live' }, 3: { NAME: 'WX', TYPE: 'W', DESC: 'Wind X' }, 4: { NAME: 'WY', TYPE: 'W', DESC: 'Wind Y' },
      ...(snow ? { 5: { NAME: 'SL', TYPE: 'S', DESC: 'Roof snow' }, 6: { NAME: 'LF', TYPE: 'L', DESC: 'Floor live (snow combinations)' } } : {}) },
    BODF: { 1: { LCNAME: 'DL', GROUP_NAME: '', FV: [0, 0, -1] } },
    FBLD: {
      1: { NAME: 'FLOOR', DESC: '', ITEM: [{ LCNAME: 'DL', FLOOR_LOAD: -spec.loads.floorDead, OPT_SUB_BEAM_WEIGHT: true }, { LCNAME: 'LL', FLOOR_LOAD: -spec.loads.floorLive, OPT_SUB_BEAM_WEIGHT: true },
        ...(snow ? [{ LCNAME: 'LF', FLOOR_LOAD: -spec.loads.floorLive, OPT_SUB_BEAM_WEIGHT: true }] : [])] },
      2: { NAME: 'ROOF', DESC: '', ITEM: [{ LCNAME: 'DL', FLOOR_LOAD: -spec.loads.roofDead, OPT_SUB_BEAM_WEIGHT: true }, { LCNAME: 'LL', FLOOR_LOAD: -spec.loads.roofLive, OPT_SUB_BEAM_WEIGHT: true },
        ...(snow ? [{ LCNAME: 'SL', FLOOR_LOAD: -spec.loads.roofSnow * spec.loads.snowMu, OPT_SUB_BEAM_WEIGHT: true }] : [])] },
    },
    FBLA, BMLD, CNLD, STOR,
    STYP: { 1: { bSELFWEIGHT: true } },
    LTOM: { 1: { DIR: 'XY', bNODAL: true, bBEAM: true, bFLOOR: true, bPRES: false, GRAV: 9.806, vLC: snow  // 적설 시 중력대표값 D + ψ·LF + 0.5S (GB/T 50011 5.1.3: 지붕 활하중 불계입, 雪 0.5)
      ? [{ LCNAME: 'DL', FACTOR: 1 }, { LCNAME: 'LF', FACTOR: s.liveMassFactor }, { LCNAME: 'SL', FACTOR: 0.5 }]
      : [{ LCNAME: 'DL', FACTOR: 1 }, { LCNAME: 'LL', FACTOR: s.liveMassFactor }] } },
    EIGV: { 1: { TYPE: 'LANCZOS', iFREQ: s.modes, iITER: 20, iDIM: 1, TOL: 1e-10, bMINMAX: false, FRMIN: 0, FRMAX: 0, bSTRUM: false } },
    SPFC: { 1: { NAME: 'CN-RS', iTYPE: 1, iMETHOD: 0, SCALE: 1, GRAV: 9.806, DRATIO: s.damping,
      STR: { SPEC_CODE: 'CH2010', SFI: SFI[s.intensity], SC_: s.site, EQ_: 'FREQUENT' }, OPT: { NSC: s.group - 1, nLForce: 0 },
      VAL: { aTG: [Tg, 0, 0], DP: s.damping, MaxEQ: ALPHA_MAX[s.intensity], PERIOD: 6 }, CALC_OPT: true } },
    SPLC: { 1: splc('RX', 0), 2: splc('RY', 90) },
    'LCOM-GEN': LCOM,
    combos, wind,
  }
}

/** 오프라인 자중 (kN) — 요소 길이 × 단면적 × 78.5 */
export function selfWeight(model: FrameModel, area: (section: string) => number): number {
  return model.elements.reduce((a, e) => a + elementLength(model, e) * area(e.section) * 1e-6 * 78.5, 0)
}
