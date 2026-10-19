/* Gate step 0 — connection check only (no model change). */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'
const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 60000 })
console.log(JSON.stringify(await client.verifyConnection()))
for (const p of ['/db/UNIT', '/db/PJCF', '/db/STOR', '/db/NODE']) {
  try { const r: any = await client.request('GET', p); const s = JSON.stringify(r); console.log(p, s.length > 300 ? s.slice(0, 300) + ` …(${s.length})` : s) } catch (e: any) { console.log(p, 'ERR', e.message) }
}
