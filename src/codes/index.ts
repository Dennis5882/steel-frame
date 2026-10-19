/* 설계기준 프로필 레지스트리 — 기준 추가 = 프로필 파일 + 여기 한 줄 */
import { TW } from './tw'
import { CN } from './cn'
import { KR } from './kr'
import type { CodeId, CodeProfile } from './types'

export const PROFILES: Record<CodeId, CodeProfile> = { TW, CN, KR }
export const CODE_IDS = Object.keys(PROFILES) as CodeId[]
export const DEFAULT_CODE: CodeId = 'TW'

export function profileOf(id: CodeId | undefined): CodeProfile {
  return PROFILES[id ?? DEFAULT_CODE] ?? PROFILES[DEFAULT_CODE]
}

export type * from './types'
