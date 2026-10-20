/* MAPI — midas-nx SDK(MidasClient) 래퍼. 브라우저가 로컬 MIDAS Gen 에 직접 호출한다.
   path 가 '/' 로 시작하면 그대로, 아니면 /db/{path}. 호출·실패는 활동 로그에 남긴다. */
import { MidasAPIError, MidasClient, type JsonObject } from 'midas-nx'
import { S } from '../state/store'
import { log } from '../state/ui'
import { jobCall } from '../actions/job'

/* 대기 한도 (대기만 중단, Gen 작업은 취소되지 않음). Gen 모달 대화상자가 뜨면 모든 호출이 응답하지 않으므로
   기본은 짧게 두고 수 분 걸리는 해석만 길게 준다 (midas-nx 2.10.2 README). */
const TIMEOUT_MS = 3 * 60 * 1000
const LONG_TIMEOUT_MS = 15 * 60 * 1000
const LONG_CALLS = new Set(['/doc/anal'])

let cached: { key: string; base: string; client: MidasClient } | null = null

export function getClient(): MidasClient {
  const base = S.baseUrl.trim().replace(/\/$/, '')
  const key = S.mapiKey.trim()
  if (!cached || cached.key !== key || cached.base !== base) {
    cached = { key, base, client: new MidasClient({ mapiKey: key, baseUrl: base, product: 'gen', timeout: TIMEOUT_MS }) }
  }
  return cached.client
}

export function apiErrorMessage(e: unknown): string {
  if (e instanceof MidasAPIError) {
    const body = e.responseBody as any
    const m = body?.error?.message ?? (typeof body?.error === 'string' ? body.error : undefined) ?? body?.message
    if (m) return String(m)
    if (e.statusCode) return `HTTP ${e.statusCode}`
  }
  return e instanceof Error ? e.message : String(e)
}

export async function mapi<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: Record<string, any>, note = ''): Promise<T> {
  const ep = path.startsWith('/') ? path : `/db/${path}`
  jobCall(`${method} ${ep}`) // 취소됐으면 여기서 Cancelled — 보내기 전에 멈춘다
  log(`<span style="color:var(--blue)">${method}</span> ${ep}${note ? ` <span style="color:var(--dim)">· ${note}</span>` : ''}`, 'api')
  try {
    const opts = LONG_CALLS.has(ep.toLowerCase()) ? { timeout: LONG_TIMEOUT_MS } : undefined
    return (await getClient().request(method, ep, body as JsonObject | undefined, opts)) as T
  } catch (e) {
    const m = apiErrorMessage(e)
    log(`${method} ${ep} — ${m}`, 'err')
    throw new Error(m)
  }
}

export interface VerifyResult {
  ok: boolean
  status: number
  j: { status?: string; keyVerified?: boolean; program?: string; user?: string }
}

/** /mapikey/verify — 실패해도 throw 하지 않고 상태를 돌려준다 */
export async function verifyConn(): Promise<VerifyResult> {
  try {
    const j = (await getClient().verifyConnection()) as VerifyResult['j']
    return { ok: true, status: 200, j }
  } catch (e) {
    if (e instanceof MidasAPIError && e.statusCode) return { ok: false, status: e.statusCode, j: (e.responseBody as any) ?? {} }
    throw e
  }
}
