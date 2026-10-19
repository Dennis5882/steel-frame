/** Second independent API representation, using the saved scratch document. */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'

const folder = process.argv[2]
if (!folder) throw new Error('Supply a completed audit directory')
const recovery = JSON.parse(readFileSync(`${folder}/recovery.json`, 'utf8'))
if (!recovery.restored) throw new Error('Initial audit has not restored its model')
const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 25000 })
const canonical = (x: any): string => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v)
const hash = (x: any) => createHash('sha256').update(canonical(x)).digest('hex')
const before: Record<string, string> = {}
for (const db of Object.keys(recovery.originalHashes)) before[db] = hash(await client.request('GET', `/db/${db}`))
const token = new Date().toISOString().replace(/[-:.TZ]/g, '')
const backup = `C:/temp/sms_catalog_confirm_backup_${token}.mgbx`
const saved = `C:/temp/sms_catalog_confirm_scratch_${token}.mgbx`
const state: any = { backup, saved, before, restored: false }
const checkpoint = () => writeFileSync(`${folder}/confirmation-recovery.json`, JSON.stringify(state, null, 2))
const command = async (path: string, arg: string) => {
  const j: any = await client.request('POST', path, { Argument: arg })
  if (j.message !== 'MIDAS GEN NX command complete') throw new Error(`${path}: command not confirmed`)
  console.log(`${path}: complete`)
}
await command('/doc/saveas', backup); checkpoint()
try {
  await command('/doc/open', recovery.scratch)
  const table = await client.request('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'CatalogAudit', TABLE_TYPE: 'SECTIONALL' } })
  writeFileSync(`${folder}/section-table.json`, JSON.stringify(table, null, 2))
  const repeated = await client.request('GET', '/ope/SECTPROP')
  writeFileSync(`${folder}/section-properties-repeat.json`, JSON.stringify(repeated))
  console.log(`Independent table keys: ${Object.keys(table as object).join(', ')}`)
} finally {
  await command('/doc/saveas', saved)
  await command('/doc/open', backup)
  state.after = {}
  for (const db of Object.keys(before)) state.after[db] = hash(await client.request('GET', `/db/${db}`))
  state.restored = Object.keys(before).every((db) => before[db] === state.after[db]); checkpoint()
  if (!state.restored) throw new Error('Confirmation model restoration mismatch')
  console.log('Confirmation complete; all 12 original database hashes match.')
}
