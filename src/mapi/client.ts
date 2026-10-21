/* MAPI — midas-nx SDK(MidasClient) 래퍼. 브라우저가 로컬 MIDAS Gen 에 직접 호출한다.
   path 가 '/' 로 시작하면 그대로, 아니면 /db/{path}. 호출·실패는 활동 로그에 남긴다. */
import { MidasAPIError, MidasClient, MidasConnectionError, type JsonObject } from 'midas-nx'
import { DEFAULT_TIMEOUT_MS, callTimeout } from './timeouts'
import { S } from '../state/store'
import { log } from '../state/ui'
import { jobCall } from '../actions/job'

let cached: { key: string; base: string; client: MidasClient } | null = null

export function getClient(): MidasClient {
  const base = S.baseUrl.trim().replace(/\/$/, '')
  const key = S.mapiKey.trim()
  if (!cached || cached.key !== key || cached.base !== base) {
    cached = { key, base, client: new MidasClient({ mapiKey: key, baseUrl: base, product: 'gen', timeout: DEFAULT_TIMEOUT_MS }  /* 호출별 한도는 timeouts.ts */) }
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
    return (await getClient().request(method, ep, body as JsonObject | undefined, callTimeout(ep))) as T
  } catch (e) {
    const m = apiErrorMessage(e)
    log(`${method} ${ep} — ${m}`, 'err')
    /* 응답 없이 끊긴 호출은 표시를 남긴다 — 호출하는 쪽이 같은 요청을 다시 보내지 않게 (timeouts.ts isConnectionError) */
    throw Object.assign(new Error(m), { connection: e instanceof MidasConnectionError })
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
