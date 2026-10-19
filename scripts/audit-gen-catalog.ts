/** Explicit live catalog audit. Default is GET-only; --register uses a backed-up scratch document. */
import { MidasAPIError, MidasClient } from 'midas-nx'
import { mkdirSync, writeFileSync } from 'node:fs'
import { readMapiKey } from './mapi-key'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 25_000 })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const folder = `output/catalog-audit/${stamp}`
mkdirSync(folder, { recursive: true })
const evidence: Record<string, unknown> = { startedAt: new Date().toISOString(), mode: 'read-only' }
async function read(path: string) {
  try {
    const data = await client.request('GET', path)
    evidence[path] = { ok: true, data }
    console.log(JSON.stringify({ method: 'GET', path, ok: true, keys: Object.keys(data as object) }))
    return data as any
  } catch (e) {
    const error = e instanceof MidasAPIError ? { status: e.statusCode, message: e.message } : { message: e instanceof Error ? e.message : 'Request failed' }
    evidence[path] = { ok: false, ...error }
    console.log(JSON.stringify({ method: 'GET', path, ok: false, ...error }))
    return null
  } finally { writeFileSync(`${folder}/inspection.json`, JSON.stringify(evidence, null, 2)) }
}
const verified = await client.verifyConnection()
if (!(verified as any).keyVerified) throw new Error('API key was not verified')
console.log('Connection verified (account details omitted).')
for (const path of ['/db/UNIT', '/db/SECT', '/ope/SECTPROP', '/info/db/SECT', '/ope/PROJECTSTATUS']) await read(path)
console.log(`Inspection saved: ${folder}/inspection.json`)
if (process.argv.includes('--register')) {
  const { auditCatalog } = await import('./catalog-audit')
  await auditCatalog(client, folder)
}
