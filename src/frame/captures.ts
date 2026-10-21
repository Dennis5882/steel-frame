/* 상세 계산서용 Gen NX 화면 캡처 목록 (순수) — 예제 docx 그림(1-1·1-2·4-2·4-4·4-6·4-7·4-8)에 해당.
   라이브 확인(2026-10-20, scripts/live-capture.ts): /view/CAPTURE 는 이미지를 응답에 싣지 않고 EXPORT_PATH 에 PNG 만 쓴다.
   결과 그래픽은 /view/RESULTGRAPHIC 으로 먼저 바꾼 뒤 같은 RESULT_GRAPHIC 을 CAPTURE 에도 넘긴다.
   되는 모드: 'reactionforces/moments', 'displacementcontour', 'beamdiagrams', 'beamstresses' (LEGEND·VALUES·CONTOUR 옵션).
   안 되는 것: 진형도('VibrationModeShapes' 는 'Invalid Post Mode'), 단면 이름 표시(겹침). */
import { elevationLines, gridX, gridY } from './drawings'
import type { FrameDesign } from './design'
import type { FrameModel, FrameSpec } from './types'

export type CaptureSection = 'model' | 'analysis'
export interface CaptureShot {
  key: string; section: CaptureSection
  /** 그림 제목 사전 키와 인자 (report.ts 에서 t 로 풀이) */
  caption: [string, ...(string | number)[]]
  capture: Record<string, unknown>
  resultGraphic?: Record<string, unknown>
}

export const CAPTURE_SIZE = { WIDTH: 1200, HEIGHT: 900 }
const ISO = { HORIZONTAL: 30, VERTICAL: 15 }
const ALL = { ACTIVE_MODE: 'All' }
const LEGEND = { CONTOUR: { OPT_CHECK: true }, LEGEND: { OPT_CHECK: true } }
/** 결과 하중 이름 'sLCB30(max)' → 조합 이름 'sLCB30' */
export const comboName = (load: string) => load.replace(/[ (].*$/, '')

export function captureShots(spec: FrameSpec, model: FrameModel, design: FrameDesign | null): CaptureShot[] {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const shots: CaptureShot[] = [
    { key: 'model_iso', section: 'model', caption: ['rp_gen_iso'], capture: { SET_MODE: 'pre', SET_HIDDEN: false, ACTIVE: ALL, ANGLE: ISO } },
    { key: 'model_solid', section: 'model', caption: ['rp_gen_solid'], capture: { SET_MODE: 'pre', SET_HIDDEN: true, ACTIVE: ALL, ANGLE: ISO } },
  ]
  /* 표준층 평면 — 지점 위 첫 층 바닥(층 이름 = Gen 층) 만 활성 */
  const plan = spec.storyNames[1]
  if (plan) shots.push({ key: 'plan', section: 'model', caption: ['rp_gen_plan', plan], capture: { SET_MODE: 'pre', SET_HIDDEN: false, ANGLE: { HORIZONTAL: 0, VERTICAL: 90 },
    ACTIVE: { ACTIVE_MODE: 'Identity', IDENTITY_TYPE: 'STORY', IDENTITY_LIST: [plan], STORY_ACTIVE: 'FLOOR' } } })
  /* 골조선 입면 — 그 선의 기둥·보·가새만 활성. X 골조 = 정면(H 0·V 0), Y 골조 = 측면(H 90·V 0) */
  for (const ln of elevationLines(spec)) {
    const on = (id: number) => { const n = nodes.get(id)!; return near(ln.axis === 'X' ? n.y : n.x, ln.line) }
    const els = model.elements.filter((e) => on(e.n1) && on(e.n2) && (e.role === 'column' || e.axis === ln.axis))
    if (!els.length) continue
    const label = ln.axis === 'X' ? gridY(spec, spec.ys.findIndex((y) => near(y, ln.line))) : gridX(spec, spec.xs.findIndex((x) => near(x, ln.line)))
    shots.push({ key: `elev_${ln.axis}${label.replace(/[^A-Za-z0-9]/g, '_')}`, section: 'model', caption: ['rp_gen_elev', label], capture: { SET_MODE: 'pre', SET_HIDDEN: false,
      ANGLE: ln.axis === 'X' ? { HORIZONTAL: 0, VERTICAL: 0 } : { HORIZONTAL: 90, VERTICAL: 0 },
      ACTIVE: { ACTIVE_MODE: 'Active', E_LIST: els.map((e) => e.id), N_LIST: [...new Set(els.flatMap((e) => [e.n1, e.n2]))] } } })
  }
  /* 결과 — 반력·변위는 고정하중(예제 4-2·4-4), 내력·응력은 지배 조합 */
  const post = { SET_MODE: 'post', SET_HIDDEN: false, ACTIVE: ALL, ANGLE: ISO }
  const st = (name: string) => ({ TYPE: 'ST', NAME: name }), cb = (name: string) => ({ TYPE: 'CB', NAME: name })
  shots.push(
    { key: 'reaction', section: 'analysis', caption: ['rp_gen_reaction', 'DL'], capture: post,
      resultGraphic: { CURRENT_MODE: 'reactionforces/moments', LOAD_CASE_COMB: st('DL'), COMPONENTS: { COMP: 'FZ' }, TYPE_OF_DISPLAY: { VALUES: { OPT_CHECK: true, DECIMAL_PT: 1 }, LEGEND: { OPT_CHECK: true } } } },
    { key: 'displacement', section: 'analysis', caption: ['rp_gen_disp', 'DL'], capture: post,
      resultGraphic: { CURRENT_MODE: 'displacementcontour', LOAD_CASE_COMB: st('DL'), COMPONENTS: { COMP: 'DXYZ' }, TYPE_OF_DISPLAY: { ...LEGEND, VALUES: { OPT_CHECK: true, DECIMAL_PT: 4, MINMAX_ONLY: { OPT_CHECK: true } } } } },
  )
  const beamCombo = comboName(design?.byRole.beam?.worst.combo ?? 'sLCB1')
  const axialCombo = comboName((design?.byRole.brace ?? design?.byRole.column)?.worst.combo ?? beamCombo)
  shots.push(
    { key: 'moment', section: 'analysis', caption: ['rp_gen_moment', beamCombo], capture: post,
      resultGraphic: { CURRENT_MODE: 'beamdiagrams', LOAD_CASE_COMB: cb(beamCombo), COMPONENTS: { COMP: 'My' }, TYPE_OF_DISPLAY: { ...LEGEND, VALUES: { OPT_CHECK: true, DECIMAL_PT: 1, MINMAX_ONLY: { OPT_CHECK: true } } } } },
    { key: 'axial', section: 'analysis', caption: ['rp_gen_axial', axialCombo], capture: post,
      resultGraphic: { CURRENT_MODE: 'beamdiagrams', LOAD_CASE_COMB: cb(axialCombo), COMPONENTS: { COMP: 'Fx' }, TYPE_OF_DISPLAY: { ...LEGEND, VALUES: { OPT_CHECK: true, DECIMAL_PT: 1, MINMAX_ONLY: { OPT_CHECK: true } } } } },
    { key: 'stress', section: 'analysis', caption: ['rp_gen_stress', beamCombo], capture: post,
      resultGraphic: { CURRENT_MODE: 'beamstresses', LOAD_CASE_COMB: cb(beamCombo), COMPONENTS: { COMP: 'Combined' }, TYPE_OF_DISPLAY: LEGEND } },
  )
  return shots
}

export const captureFile = (stamp: string, key: string) => `sf_cap_${stamp}_${key}.png`
