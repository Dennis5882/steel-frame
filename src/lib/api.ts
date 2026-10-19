/* 자체 백엔드(Vercel Functions, /api/*) 호출. MIDAS Gen MAPI 호출은 src/mapi/client.ts(브라우저 직접). */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}
