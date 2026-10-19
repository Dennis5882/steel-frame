/* 형상 모델 → Gen NX MAPI 페이로드 (순수 함수). 단위 m, kN (Gen 모델 단위계는 전송 전 db/UNIT 으로 맞춘다). */
import { profileOf } from '../codes'
import type { ElementRole, FactoryModel, FactorySpec } from './types'

export interface GenPayloads {
  UNIT: Record<string, unknown>
  MATL: Record<string, unknown>
  SECT: Record<string, unknown>
  NODE: Record<string, unknown>
  ELEM: Record<string, unknown>
  CONS: Record<string, unknown>
  FRLS: Record<string, unknown>
}

/* 요소 국부축 회전각(beta). 거트·풍주는 강축이 벽면에 수직(풍압 방향)이 되도록 90°. 퍼린은 경사 지붕 면 정렬 생략(0°). */
const ANGLE: Partial<Record<ElementRole, number>> = { girt: 90, post: 90 }
/** 양단 핀(My·Mz 해제, 비틀림은 연결해 불안정 방지) — 단순보로 거동하는 2차부재 */
const PINNED_BOTH: ElementRole[] = ['purlin', 'girt', 'strut']
const PIN = '0000110', FIX = '0000000'

export function buildGenPayloads(spec: FactorySpec, model: FactoryModel): GenPayloads {
  const prof = profileOf(spec.code)
  const mat = prof.materials[spec.material]
  if (!mat) throw new Error(`unknown material: ${spec.material}`)

  /* 퍼린·거트 재료를 따로 (CN Q235B · KR SS275) */
  const twoMat = spec.code === 'CN' || spec.code === 'KR'
  const secondary = spec.secondaryMaterial ?? (spec.code === 'KR' ? 'SS275' : 'Q235B')

  /* 단면: 사용된 이름을 등장 순서대로 번호 부여 */
  const sectId = new Map<string, number>()
  for (const e of model.elements) if (!sectId.has(e.section)) sectId.set(e.section, sectId.size + 1)

  /* TRUSS 요소에 쓰는 단면은 뒴(7번째 자유도) 옵션 불가 — "Section property considering 7th DOF ... only to the beam elements" (라이브 2026-10-15) */
  const trussSects = new Set(model.elements.filter((e) => e.role === 'brace').map((e) => e.section))
  const SECT: Record<string, unknown> = {}
  for (const [name, id] of sectId) {
    SECT[id] = {
      SECTTYPE: 'DBUSER',
      SECT_NAME: name.replace(/ /g, ''),
      SECT_BEFORE: {
        OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0,
        HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0, VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0,
        USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: !trussSects.has(name),
        SHAPE: prof.gen.shapeOf(name),
        DATATYPE: 1,
        SECT_I: { DB_NAME: prof.gen.sectionDbOf?.(name) ?? prof.gen.sectionDb, SECT_NAME: name },
      },
    }
  }

  const NODE: Record<string, unknown> = {}
  for (const n of model.nodes) NODE[n.id] = { X: n.x, Y: n.y, Z: n.z }

  const ELEM: Record<string, unknown> = {}
  for (const e of model.elements) {
    ELEM[e.id] = { TYPE: e.role === 'brace' ? 'TRUSS' : 'BEAM', MATL: twoMat && (e.role === 'purlin' || e.role === 'girt') ? 2 : 1, SECT: sectId.get(e.section), NODE: [e.n1, e.n2], ANGLE: e.addition ? 0 : ANGLE[e.role] ?? 0 }
  }

  /* 단부 해제: 2차부재 양단 핀, 풍주는 지붕보에 닿는 상단만 핀(기초는 핀 지점이라 해제 불필요 — 양단 해제 시 기초 절점 회전 불안정) */
  const FRLS: Record<string, unknown> = {}
  const postStarts = new Set(model.elements.filter((e) => e.role === 'post').map((e) => e.n1))
  /* 흔들림 기둥(다경간 내부) 상단 = 지붕보에 핀 */
  const leanStarts = new Set(model.elements.filter((e) => e.lean).map((e) => e.n1))
  for (const e of model.elements) {
    if (e.addition && e.addition !== 'platform-column') {
      const group = model.elements.filter((v) => v.physicalKey === e.physicalKey)
      const end = (id: number) => group.filter((v) => v.n1 === id || v.n2 === id).length === 1
      const pinI = end(e.n1), pinJ = end(e.n2)
      if (pinI || pinJ) FRLS[e.id] = { ITEMS: [{ ID: 1, bVALUE: false, FLAG_I: pinI ? PIN : FIX, VALUE_I: [0, 0, 0, 0, 0, 0, 0], FLAG_J: pinJ ? PIN : FIX, VALUE_J: [0, 0, 0, 0, 0, 0, 0] }] }
      continue
    }
    if (e.addition === 'platform-column') continue
    const both = PINNED_BOTH.includes(e.role)
    const postTop = (e.role === 'post' && !postStarts.has(e.n2)) || (!!e.lean && !leanStarts.has(e.n2))
    if (!both && !postTop) continue
    FRLS[e.id] = { ITEMS: [{ ID: 1, bVALUE: false, FLAG_I: both ? PIN : FIX, VALUE_I: [0, 0, 0, 0, 0, 0, 0], FLAG_J: PIN, VALUE_J: [0, 0, 0, 0, 0, 0, 0] }] }
  }

  const code = spec.baseFixity === 'fixed' ? '1111111' : '1110000'
  /* 흔들림 기둥 기초는 항상 핀 */
  const leanBase = new Set(model.elements.filter((e) => e.lean).map((e) => e.n1))
  const CONS: Record<string, unknown> = {}
  for (const n of model.nodes) {
    /* GROUP_NAME 은 미리 정의된 경계 그룹만 허용(없는 이름이면 Unknown Error, 라이브 확인) → 생략 */
    if (n.z === 0) CONS[n.id] = { ITEMS: [{ ID: n.id, CONSTRAINT: model.additions?.fixedBases.includes(n.id) ? '1111111' : leanBase.has(n.id) ? '1110000' : code }] }
  }

  const material = (name: string) => {
    const m = prof.materials[name]
    if (!m) throw new Error(`unknown material: ${name}`)
    return { TYPE: 'STEEL', NAME: name, DAMP_RAT: spec.code === 'CN' ? spec.china?.damping ?? 0.05 : 0.02, PARAM: [{ P_TYPE: 1, STANDARD: m.gen.standard, CODE: '', DB: m.gen.db, bELAST: false }] }
  }
  return {
    UNIT: { 1: { FORCE: 'KN', DIST: 'M', HEAT: 'KJ', TEMPER: 'C' } },
    MATL: { 1: material(spec.material), ...(twoMat ? { 2: material(secondary) } : {}) },
    SECT, NODE, ELEM, CONS, FRLS,
  }
}
