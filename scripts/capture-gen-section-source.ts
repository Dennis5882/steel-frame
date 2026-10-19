/** Recheck the saved 808-section scratch in MM and CM (M rounds small properties to zero). */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'

const source = process.argv[2] ?? 'output/catalog-audit/2026-10-17T04-44-02-124Z'
const previous = JSON.parse(readFileSync(`${source}/recovery.json`, 'utf8'))
assert.ok(previous.restored)
const folder = `output/gen-section-source-${new Date().toISOString().replace(/[:.]/g, '-')}`
mkdirSync(folder, { recursive: true })
const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 30000 })
const canonical = (x: unknown) => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v)
const hash = (x: unknown) => createHash('sha256').update(canonical(x)).digest('hex')
const dbs = Object.keys(previous.originalHashes)
const snapshot = async () => {
  const values: Record<string, string> = {}
  for (const db of dbs) values[db] = hash(await client.request('GET', `/db/${db}`))
  return values
}
const before = await snapshot()
const token = Date.now()
const backup = `C:/temp/sms_section_source_backup_${token}.mgbx`
const scratch = `C:/temp/sms_section_source_scratch_${token}.mgbx`
const state: any = { source, backup, scratch, before, restored: false }
const save = () => writeFileSync(`${folder}/recovery.json`, JSON.stringify(state, null, 2))
const command = async (path: string, arg: string) => {
  const r: any = await client.request('POST', path, { Argument: arg })
  assert.equal(r.message, 'MIDAS GEN NX command complete', path)
}
await command('/doc/saveas', backup); save()
assert.deepEqual(await snapshot(), before, 'Current document changed during backup; stop before opening scratch')
try {
  await command('/doc/open', previous.scratch)
  await client.request('PUT', '/db/UNIT', { Assign: { 1: { FORCE: 'KN', DIST: 'MM', HEAT: 'KJ', TEMPER: 'C' } } })
  const sections: any = await client.request('GET', '/db/SECT')
  assert.equal(Object.keys(sections.SECT).length, 808)
  writeFileSync(`${folder}/sections.json`, JSON.stringify(sections))
  writeFileSync(`${folder}/properties-mm.json`, JSON.stringify(await client.request('GET', '/ope/SECTPROP')))
  writeFileSync(`${folder}/table-mm.json`, JSON.stringify(await client.request('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'GenSource', TABLE_TYPE: 'SECTIONALL' } })))
  await command('/doc/export', resolve(`${folder}/document-mm.json`).replaceAll('\\', '/'))
  await client.request('PUT', '/db/UNIT', { Assign: { 1: { FORCE: 'KN', DIST: 'CM', HEAT: 'KJ', TEMPER: 'C' } } })
  writeFileSync(`${folder}/properties-cm.json`, JSON.stringify(await client.request('GET', '/ope/SECTPROP')))
  console.log('Captured 808 sections in MM and CM plus table and JSON export.')
} finally {
  try { await command('/doc/saveas', scratch) }
  finally {
    await command('/doc/open', backup)
    state.after = await snapshot(); state.restored = JSON.stringify(state.after) === JSON.stringify(before); save()
    assert.ok(state.restored, `Restore mismatch: ${folder}/recovery.json`)
    console.log('Original document restored; 12 database hashes match.')
  }
}
console.log(folder)
