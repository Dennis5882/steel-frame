/* Gen 호출 대기 한도 — 화면(mapi/client.ts)과 라이브 스크립트(live-frame·live-detail)가 같이 쓴다. store 의존 없음.
   한도는 대기만 멈추고 Gen 작업은 취소하지 않는다. Gen 모달 대화상자가 뜨면 모든 호출이 응답하지 않으므로
   기본은 짧게 두고, 수 분 걸릴 수 있는 문서 명령(해석·열기·저장·새 문서)과 캡처만 길게 준다 (midas-nx 2.10.2 README). */
import { MidasConnectionError } from 'midas-nx'

export const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000
export const LONG_TIMEOUT_MS = 15 * 60 * 1000
const LONG_CALLS = new Set(['/doc/anal', '/doc/open', '/doc/saveas', '/doc/new', '/view/capture'])

/** 경로 정리 — 쿼리·끝의 '/' 를 떼고 소문자, '/' 로 시작하지 않으면 /db/ 아래로 (mapi() 와 같은 규칙) */
export function normalizeEndpoint(path: string): string {
  const p = path.split(/[?#]/)[0].trim().replace(/\/+$/, '')
  return (p.startsWith('/') ? p : `/db/${p}`).toLowerCase()
}

/** 호출별 한도 — 긴 호출이면 { timeout }, 아니면 undefined (클라이언트 기본 DEFAULT_TIMEOUT_MS) */
export function callTimeout(path: string): { timeout: number } | undefined {
  return LONG_CALLS.has(normalizeEndpoint(path)) ? { timeout: LONG_TIMEOUT_MS } : undefined
}

/** 응답 없이 끊긴 호출(시간 초과·연결 실패) — 같은 요청을 다시 보내면 Gen 대기열에 쌓이기만 한다 */
export function isConnectionError(e: unknown): boolean {
  return e instanceof MidasConnectionError || (e as { connection?: boolean } | null)?.connection === true
}
