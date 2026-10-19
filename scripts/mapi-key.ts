/* 라이브 스크립트 MAPI-Key — stdin 첫 줄 → 환경변수 MAPI_KEY → 저장소 .env 의 MAPI_KEY (gitignore, 사용자 결정 2026-10-16).
   키를 출력·인자·커밋에 넣지 않는다. */
import { createInterface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export async function readMapiKey(label = ''): Promise<string> {
  let key = ''
  if (!process.stdin.isTTY) {
    const lines = createInterface({ input: process.stdin, terminal: false })
    for await (const line of lines) { key = line.trim(); lines.close(); break }
  }
  key ||= process.env.MAPI_KEY?.trim() ?? ''
  const env = resolve(import.meta.dirname, '..', '.env')
  if (!key && existsSync(env)) key = readFileSync(env, 'utf8').match(/^MAPI_KEY=(.+)$/m)?.[1].trim() ?? ''
  if (!key) throw new Error('MAPI-Key required (stdin, MAPI_KEY env or .env)')
  console.log(`MAPI-Key loaded (not echoed).${label ? ` ${label}` : ''}`)
  return key
}
