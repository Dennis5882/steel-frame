/* 기준 예제 스펙 — Gen NX 튜토리얼 「工业钢框架支撑结构分析设计」 (docs/tutorial-cn-braced-frame.md) */
import type { FrameSpec } from './types'

export const TUTORIAL_SPEC: FrameSpec = {
  code: 'CN',
  xs: [0, 6, 12, 18, 24],
  ys: [0, 4, 8, 12, 16],
  baseZ: -4.5,
  heights: [4.5, 3.3, 3.3, 3.3],
  storyNames: ['1F', '2F', '3F', '4F', 'Roof'],
  /* L자: X 0~12 × Y 0~8 (1·2축 × A·B축) 패널 제거 */
  removed: [[0, 0], [1, 0], [0, 1], [1, 1]],
  material: 'Q355B',
  sections: { beam: 'HW 200x200x8/12', column: 'HW 250x250x9/14', brace: 'HW 150x150x7/10' },
  braces: [
    { axis: 'X', line: 16, a: 6, b: 18, type: 'chevron' },
    { axis: 'X', line: 8, a: 6, b: 18, type: 'chevron' },
    { axis: 'Y', line: 24, a: 4, b: 12, type: 'chevron' },
  ],
  loads: { floorDead: 5, floorLive: 2, roofDead: 2, roofLive: 0.5, edgeFloor: 5, edgeRoof: 1, roofSnow: 0, snowMu: 1 },
  wind: { w0: 0.3, terrain: 'B', muWindward: 0.8, muLeeward: -0.5, damping: 0.02 },
  seismic: { intensity: '7_010', group: 2, site: 'II', damping: 0.02, liveMassFactor: 0.5, modes: 12, accidentalEccentricity: true },
  design: { seismicGrade: 2, braced: { X: true, Y: true }, netAreaRatio: 0.85 },
}
