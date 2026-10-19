import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { MidasClient } from 'midas-nx'

const canonical = (x: any): string => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v)
const digest = (x: unknown) => createHash('sha256').update(canonical(x)).digest('hex')

export async function auditCatalog(client: MidasClient, folder: string) {
  ;(globalThis as any).document ??= { documentElement: { lang: 'ko', dataset: {} } }
  const { CATALOG } = await import('../src/domain/catalog')
  const { CN_CATALOG } = await import('../src/domain/cnCatalog')
  const { KR_CATALOG } = await import('../src/domain/krCatalog')
  const { profileOf } = await import('../src/codes')
  const { sectionProps } = await import('../src/domain/sections')
  const catalogs = { TW: CATALOG, CN: CN_CATALOG, KR: KR_CATALOG }
  const rows = Object.entries(catalogs).flatMap(([code, catalog]) => [...new Set(Object.values(catalog).flat())].map((name) => {
    const p = profileOf(code as 'TW' | 'CN' | 'KR')
    return { id: 0, code, name, db: p.gen.sectionDbOf?.(name) ?? p.gen.sectionDb, shape: p.gen.shapeOf(name),
      roles: Object.keys(catalog).filter((r) => catalog[r as keyof typeof catalog].includes(name)) }
  })).map((r, i) => ({ ...r, id: i + 1 }))
  const backups = ['UNIT', 'MATL', 'SECT', 'NODE', 'ELEM', 'CONS', 'FRLS', 'STLD', 'LCOM-GEN', 'BODF', 'BMLD', 'CNLD']
  const original: Record<string, any> = {}
  for (const db of backups) original[db] = await client.request('GET', `/db/${db}`)
  writeFileSync(`${folder}/original-model.json`, JSON.stringify(original))
  const token = new Date().toISOString().replace(/[-:.TZ]/g, '')
  const backup = `C:/temp/sms_catalog_backup_${token}.mgbx`
  const scratch = `C:/temp/sms_catalog_scratch_${token}.mgbx`
  const state: any = { backup, scratch, originalHashes: Object.fromEntries(backups.map((k) => [k, digest(original[k])])), restored: false }
  const save = () => writeFileSync(`${folder}/recovery.json`, JSON.stringify(state, null, 2))
  const command = async (path: string, arg: unknown) => {
    const res: any = await client.request('POST', path, { Argument: arg } as any)
    if (res?.message !== 'MIDAS GEN NX command complete') throw new Error(`${path}: command completion not confirmed`)
    console.log(`${path}: complete`)
  }
  await command('/doc/saveas', backup)
  state.backupSaved = true; save()
  let changed = false
  let report: any
  try {
    changed = true
    await command('/doc/new', {})
    await client.request('PUT', '/db/UNIT', { Assign: { '1': { FORCE: 'KN', DIST: 'MM', HEAT: 'KJ', TEMPER: 'C' } } })
    const payload = (r: typeof rows[number]) => ({ SECTTYPE: 'DBUSER', SECT_NAME: `${r.code}_${r.id}`, SECT_BEFORE: {
      OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0, HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0,
      VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0, USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: r.shape !== 'P',
      SHAPE: r.shape, DATATYPE: 1, SECT_I: { DB_NAME: r.db, SECT_NAME: r.name },
    } })
    const failures: Record<number, string> = {}
    for (let i = 0; i < rows.length; i += 40) {
      const batch = rows.slice(i, i + 40)
      try {
        await client.request('PUT', '/db/SECT', { Assign: Object.fromEntries(batch.map((r) => [r.id, payload(r)])) })
      } catch {
        // A batch may be partially applied. Reapply each record independently, preserving exact IDs.
        for (const r of batch) {
          try { await client.request('PUT', '/db/SECT', { Assign: { [r.id]: payload(r) } }) }
          catch (e) { failures[r.id] = e instanceof Error ? e.message : 'Registration failed' }
        }
      }
      console.log(`Registered batch ${Math.min(i + 40, rows.length)}/${rows.length}`)
    }
    const sections: any = await client.request('GET', '/db/SECT')
    const properties: any = await client.request('GET', '/ope/SECTPROP')
    const units: any = await client.request('GET', '/db/UNIT')
    if (units.UNIT?.['1']?.DIST !== 'MM') throw new Error('Property unit was not MM')
    writeFileSync(`${folder}/registered-sections.json`, JSON.stringify(sections))
    writeFileSync(`${folder}/section-properties-mm.json`, JSON.stringify(properties))
    const entries = rows.map((r) => {
      const stored = sections.SECT?.[r.id], table = properties.SECTPROP?.[r.id]
      const exact = stored?.SECT_BEFORE?.SECT_I?.DB_NAME === r.db && stored?.SECT_BEFORE?.SECT_I?.SECT_NAME === r.name && stored?.SECT_BEFORE?.SHAPE === r.shape
      const values: Record<string, number> = Object.fromEntries((table?.DATA ?? []).map((row: any[]) => [row[0], Number(row[1])]))
      const gen = { A: values.Area, Ix: values.Iyy, Iy: values.Izz, J: values.Ixx, d: values.Czp + values.Czm, bf: values.Cyp + values.Cym }
      const registered = exact && [gen.A, gen.Ix, gen.Iy].every((n) => Number.isFinite(n) && n > 0)
      let app: ReturnType<typeof sectionProps> | undefined
      try { app = sectionProps(r.name) } catch { /* Unsupported parser remains excluded. */ }
      const differences = app && registered ? Object.fromEntries(Object.entries(gen).map(([k, v]) => [k, { app: app![k as keyof typeof gen], gen: v, relative: (app![k as keyof typeof gen] - v) / v }])) : undefined
      const metrics = differences ? Object.values(differences).filter((x) => Number.isFinite(x.relative)) : []
      const maxDifference = metrics.length === 6 ? Math.max(...metrics.map((x) => Math.abs(x.relative))) : null
      return { ...r, registered, parserSupported: !!app, propertyStatus: !registered ? 'unavailable' : maxDifference === null ? 'incomplete' : maxDifference <= 0.005 ? 'close' : 'difference',
        maxDifference, metrics: differences, approximation: app?.kind === 'H' ? 'Sharp-corner formulas; fillets omitted; J uses thin-plate approximation.' : app?.kind === 'CC' ? 'Centerline thin-wall approximation; corner radii omitted.' : null,
        error: failures[r.id] ?? (!exact ? 'Readback does not match requested DB/name/shape' : !registered ? 'Positive section properties missing' : null) }
    })
    report = { version: 1, auditedAt: new Date().toISOString(), scope: 'Existing application catalog, not the full installed Gen database',
      units: { A: 'mm2', Ix: 'mm4', Iy: 'mm4', J: 'mm4', d: 'mm', bf: 'mm' },
      axes: 'App Ix=Gen Iyy (strong bending); app Iy=Gen Izz (weak bending); app J=Gen Ixx (torsion).',
      closeTolerance: 0.005, warning: 'Registration and geometric comparison do not certify code applicability or design adequacy. Warping, shear properties and material-dependent limits require separate checks.',
      counts: Object.fromEntries(Object.keys(catalogs).map((code) => { const e = entries.filter((r) => r.code === code); return [code, { total: e.length, registered: e.filter((r) => r.registered).length, close: e.filter((r) => r.propertyStatus === 'close').length, difference: e.filter((r) => r.propertyStatus === 'difference').length }] })), entries }
    writeFileSync(`${folder}/comparison.json`, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report.counts))
  } finally {
    if (changed) {
      await command('/doc/saveas', scratch)
      await command('/doc/open', backup)
      state.restoredHashes = {}
      for (const db of backups) state.restoredHashes[db] = digest(await client.request('GET', `/db/${db}`))
      state.restored = backups.every((k) => state.originalHashes[k] === state.restoredHashes[k])
      save()
      if (!state.restored) throw new Error(`Model restore mismatch. See ${folder}/recovery.json`)
      console.log('Original model restored; all 12 database hashes match.')
    }
  }
  if (report && state.restored) writeFileSync(`${folder}/complete.json`, JSON.stringify({ ...report.counts, restored: true }, null, 2))
  return report
}
