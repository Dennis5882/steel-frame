/* 기본 모델링 템플릿 (story 건물유형과 같은 역할) — 형상만 정한다.
   지역·하중·재료·단면은 현재 설계기준 기본값/직전 입력을 그대로 쓴다 (session 'new').
   단면은 기본값이므로 큰 스팬은 설계 검토 후 단면 최적화로 조정한다.
   치수: CN 적용 범위(스팬 ≤ 60 m, 처마 ≤ 18 m, 길이 ≤ 90 m) 안에서 고른 대표값. */
import type { FactorySpec } from './types'

export type TemplateKey = 'small' | 'general' | 'long' | 'logistics'
export const TEMPLATE_KEYS: TemplateKey[] = ['small', 'general', 'long', 'logistics']

export type TemplateGeometry = Pick<FactorySpec, 'span' | 'bays' | 'baySpacing' | 'eaveHeight' | 'roofSlope'>

export const TEMPLATES: Record<TemplateKey, TemplateGeometry> = {
  small: { span: 18, bays: 5, baySpacing: 6, eaveHeight: 6, roofSlope: 0.1 },
  general: { span: 24, bays: 6, baySpacing: 6, eaveHeight: 8, roofSlope: 0.1 },
  long: { span: 30, bays: 8, baySpacing: 7.5, eaveHeight: 10, roofSlope: 0.1 },
  logistics: { span: 36, bays: 10, baySpacing: 8, eaveHeight: 11, roofSlope: 0.1 }, // 평균 높이 11.9 m — TW 표1-3 R 의 h ≤ 12 m 안
}
