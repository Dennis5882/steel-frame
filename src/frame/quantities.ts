/* 다층 강골조 물량 산출 (순수, 문구 없음) — 해석 모델의 부재(중심선 길이) 기준. CSV·Excel 행은 quantitySheet.ts.
   접합부 판재·볼트·용접은 접합부 설계가 없어 제외(시트에 명시). 할증은 공장 앱과 같은 부재 5 %. */
import { hSection } from './design'
import { elementLength } from './geometry'
import type { FrameModel, FrameRole } from './types'

const ROLES: FrameRole[] = ['column', 'beam', 'brace']
/** 부재 기호 (GB/T 50105 관용: 钢柱 GZ · 钢梁 GL · 支撑 ZC) — 도면·계산서·물량 공통 */
export const FRAME_MARK: Record<FrameRole, string> = { column: 'GZ1', beam: 'GL1', brace: 'ZC1' }
const STEEL_KG_MM3 = 7.85e-6
/** 부재 할증 — 공장 앱 domain/quantities LOSS.member 와 같은 값 (그 모듈은 문구를 불러와 순수 모듈에서 쓰지 않음) */
export const MEMBER_LOSS = 0.05

export interface FrameQtyRow { role: FrameRole; mark: string; section: string; members: number; length: number; kgPerM: number; weight: number; paint: number }
export interface FrameQuantities {
  rows: FrameQtyRow[]
  /** 층(1 = 1층) × 종류 중량 (t) */
  byStory: { story: number; t: Record<FrameRole, number> }[]
  memberT: number; orderT: number; paintM2: number
  /** 연면적 (m²) = 층 평면 면적 × 지점 위 레벨 수 */
  grossArea: number
}

/** H 단면 둘레 (도장 면적/m, mm): 2d + 4bf − 2tw (필릿 무시) */
const hPerimeter = (s: { d: number; bf: number; tw: number }) => 2 * s.d + 4 * s.bf - 2 * s.tw

export function frameQuantities(model: FrameModel): FrameQuantities {
  const rows: FrameQtyRow[] = []
  for (const role of ROLES) {
    const els = model.elements.filter((e) => e.role === role)
    for (const section of [...new Set(els.map((e) => e.section))]) {
      const list = els.filter((e) => e.section === section), s = hSection(section)
      const length = list.reduce((a, e) => a + elementLength(model, e), 0), kgPerM = s.A * 1000 * STEEL_KG_MM3
      rows.push({ role, mark: FRAME_MARK[role], section, members: new Set(list.map((e) => e.member)).size, length, kgPerM, weight: kgPerM * length / 1000, paint: hPerimeter(s) / 1000 * length })
    }
  }
  const stories = [...new Set(model.elements.map((e) => e.story))].sort((a, b) => a - b)
  const byStory = stories.map((story) => {
    const tt = { column: 0, beam: 0, brace: 0 } as Record<FrameRole, number>
    for (const e of model.elements) if (e.story === story) tt[e.role] += hSection(e.section).A * 1000 * STEEL_KG_MM3 * elementLength(model, e) / 1000
    return { story, t: tt }
  })
  const memberT = rows.reduce((a, r) => a + r.weight, 0)
  return { rows, byStory, memberT, orderT: memberT * (1 + MEMBER_LOSS), paintM2: rows.reduce((a, r) => a + r.paint, 0), grossArea: model.floorArea * (model.levels.length - 1) }
}
