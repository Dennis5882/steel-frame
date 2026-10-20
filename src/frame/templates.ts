/* 다층 강골조 시작 템플릿 — 형상·단면·하중의 출발점. 단면은 GB-YB05 목록(gen-section-properties.json CN) 안에서 고른다.
   blank = 새 프레임 출발점(정형 격자, 가새 없음), tutorial = Gen NX 예제 그대로 (docs/tutorial-cn-braced-frame.md). */
import { TUTORIAL_SPEC } from './tutorial'
import type { FrameSpec } from './types'

const base = (o: Partial<FrameSpec>): FrameSpec => ({ ...JSON.parse(JSON.stringify(TUTORIAL_SPEC)), ...o })

export const FRAME_TEMPLATE_KEYS = ['blank', 'tutorial'] as const
export type FrameTemplateKey = (typeof FRAME_TEMPLATE_KEYS)[number]

export const FRAME_TEMPLATES: Record<FrameTemplateKey, { spec: FrameSpec }> = {
  /** 새 프레임: 정형 격자 4×3 (6 m), 3층, 가새 없음 — 평면 편집기에서 형상·가새를 만든다 (가새 없는 방향 기둥 μ = 附录 E.0.2 有侧移) */
  blank: {
    spec: base({
      xs: [0, 6, 12, 18, 24], ys: [0, 6, 12, 18], baseZ: 0, heights: [4.2, 3.6, 3.6], storyNames: ['1F', '2F', '3F', 'Roof'], removed: [],
      sections: { beam: 'HN 400x200x8/13', column: 'HW 400x400x13/21', brace: 'HW 200x200x8/12' },
      braces: [],
      design: { seismicGrade: 3, braced: { X: false, Y: false }, netAreaRatio: 0.85 },
    }),
  },
  /** Gen NX 예제 그대로 (검증·시연용) */
  tutorial: { spec: TUTORIAL_SPEC },
}
