/* 다층 강골조 시작 템플릿 — 형상·단면·하중의 출발점. 단면은 GB-YB05 목록(gen-section-properties.json CN) 안에서 고른다.
   tutorial = Gen NX 예제 그대로 (docs/tutorial-cn-braced-frame.md). 나머지는 예시 값이며 프로젝트 조건으로 고쳐 쓴다. */
import { TUTORIAL_SPEC } from './tutorial'
import type { FrameSpec } from './types'

const base = (o: Partial<FrameSpec>): FrameSpec => ({ ...JSON.parse(JSON.stringify(TUTORIAL_SPEC)), ...o })

export const FRAME_TEMPLATE_KEYS = ['tutorial', 'braced', 'moment'] as const
export type FrameTemplateKey = (typeof FRAME_TEMPLATE_KEYS)[number]

export const FRAME_TEMPLATES: Record<FrameTemplateKey, { spec: FrameSpec }> = {
  tutorial: { spec: TUTORIAL_SPEC },
  /** 정형 가새골조 5×3 베이, 3층 — 외곽 골조선 중앙 베이에 人자형 가새 */
  braced: {
    spec: base({
      xs: [0, 6, 12, 18, 24, 30], ys: [0, 6, 12, 18], baseZ: 0, heights: [4.2, 3.6, 3.6], storyNames: ['1F', '2F', '3F', 'Roof'], removed: [],
      sections: { beam: 'HN 350x175x7/11', column: 'HW 300x300x10/15', brace: 'HW 250x250x9/14' },
      braces: [
        { axis: 'X', line: 0, a: 12, b: 18, type: 'chevron' }, { axis: 'X', line: 18, a: 12, b: 18, type: 'chevron' },
        { axis: 'Y', line: 0, a: 6, b: 12, type: 'chevron' }, { axis: 'Y', line: 30, a: 6, b: 12, type: 'chevron' },
      ],
      design: { seismicGrade: 3, braced: { X: true, Y: true }, netAreaRatio: 0.85 },
    }),
  },
  /** 순수 모멘트골조 3×2 베이, 3층 — 가새 없음 (기둥 μ = 附录 E.0.2 有侧移) */
  moment: {
    spec: base({
      xs: [0, 8, 16, 24], ys: [0, 6, 12], baseZ: 0, heights: [4.5, 3.9, 3.9], storyNames: ['1F', '2F', '3F', 'Roof'], removed: [],
      sections: { beam: 'HN 400x200x8/13', column: 'HW 400x400x13/21', brace: 'HW 150x150x7/10' },
      braces: [],
      design: { seismicGrade: 3, braced: { X: false, Y: false }, netAreaRatio: 0.85 },
    }),
  },
}
