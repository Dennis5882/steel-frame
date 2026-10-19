/* 한국 KDS 라이브 회귀 (명시적 실행). MAPI-Key 는 stdin → MAPI_KEY 환경변수 → .env(gitignore) 순 — 인자·커밋 금지.
   현재 Gen 문서를 자동 저장한 뒤 시험 모델을 만든다.
   실행: printf '<key>
' | node --import tsx scripts/live-kr.ts [--frame mono|multi] [--optimize] [--gen-check] [--gen-default] [--systems] [--assert-pass]
   --gen-check: PUT DESIGN/STEEL/DSTL 'KDS 41 30 : 2022' → POST .../CODE-ANAL(180 s 제한) → post/STEELCODECHECK,
   Gen KDS 강도비를 앱 검토와 역할별로 대조. 기본: 앱 유효길이(krLengths)를 LENG(K = 1)·DCTL·MBTP 로 맞춘 뒤 대조, --gen-default 면 Gen 기본 설계 옵션. */
import { readMapiKey } from './mapi-key'
import { blockedMembers } from '../src/domain/validity'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditKrLengths, compareKrMembers } from './kr-comparison'

let key = await readMapiKey()
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { KR_DEFAULT_SPEC } = await import('../src/domain/types')
const { sendModel } = await import('../src/actions/build')
const { analyzeCore } = await import('../src/actions/analysis')
const { fetchResults } = await import('../src/actions/results')
const { runDesign } = await import('../src/domain/design')
const { runConnections } = await import('../src/domain/connections')
const { runOptimize } = await import('../src/actions/optimize')
const { buildReport } = await import('../src/report/report')
const { buildDxf } = await import('../src/drawing/drawings')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
if (process.argv.includes('--trace')) {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname, start = Date.now()
    console.log(`[API] ${init?.method ?? 'GET'} ${path}`)
    const response = await realFetch(url, init)
    console.log(`[API] ${path} ${response.status} headers ${Date.now() - start}ms`)
    return response
  }
}
S.mapiKey = key; key = ''; S.code = 'KR'
try {
  if (process.argv.includes('--reuse')) {
    const spec = structuredClone(KR_DEFAULT_SPEC), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
    S.built = { spec, model, info: loads.info, cases: Object.values(loads.STLD).map((x: any) => x.NAME), combos: Object.keys(loads['LCOM-GEN']).length, comboNames: Object.values(loads['LCOM-GEN']).map((x: any) => x.NAME) }; S.analyzed = true
  } else {
    const fr = process.argv.indexOf('--frame') > 0 ? process.argv[process.argv.indexOf('--frame') + 1] : 'gable'
    const { normalizeSpans } = await import('../src/domain/types')
    const base = structuredClone(KR_DEFAULT_SPEC)
    /* --systems: X 보통모멘트골조·Y 보통중심가새골조 (KDS 14 31 60 상세, 증폭지진 조합 포함) */
    if (process.argv.includes('--systems')) base.korea = { ...base.korea!, systemX: 'OMF', systemY: 'OCBF' }
    await sendModel(normalizeSpans({ ...base, ...(fr === 'mono' ? { frame: 'mono' as const } : fr === 'multi' ? { frame: 'multi' as const, spanList: process.argv.includes('--spans') ? process.argv[process.argv.indexOf('--spans') + 1].split(',').map(Number) : [24, 24] } : {}) }))
    console.log(`KR model transmitted (${fr}): nodes ${S.built!.model.nodes.length}, cases ${S.built!.cases.length}, combos ${S.built!.combos}.`)
    await analyzeCore()
    console.log('KR analysis completed.')
    /* 반력 평형 (D 제외 — 자중 BODF) */
    const b = S.built!, node = new Map(b.model.nodes.map((x) => [x.id, x])), applied: Record<string, number[]> = {}
    for (const [id, rec] of Object.entries(b.sent!.BMLD)) {
      const e = b.model.elements[+id - 1], a = node.get(e.n1)!, c = node.get(e.n2)!, L = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z)
      for (const it of (rec as any).ITEMS) { const o = (applied[it.LCNAME] ??= [0, 0, 0]); o[['GX', 'GY', 'GZ'].indexOf(it.DIRECTION)] += it.P[0] * L }
    }
    for (const rec of Object.values(b.sent!.CNLD)) for (const it of (rec as any).ITEMS) { const o = (applied[it.LCNAME] ??= [0, 0, 0]); o[0] += it.FX; o[1] += it.FY; o[2] += it.FZ }
    let worst = 0
    for (const r of S.reactions ?? []) { const lc = r.lc.replace(/\(ST\)$/, ''); if (lc === 'D') continue; const a = applied[lc] ?? [0, 0, 0]; worst = Math.max(worst, Math.max(Math.abs(r.fx + a[0]), Math.abs(r.fy + a[1]), Math.abs(r.fz + a[2])) / Math.max(1, Math.hypot(...a))) }
    console.log(`KR equilibrium worst ${(worst * 100).toFixed(3)}% over ${(S.reactions ?? []).length - 1} cases`)
  }
  S.results = await fetchResults(S.built!)
  S.design = runDesign(S.built!.spec, S.built!.model, S.built!.info, S.results)
  S.connections = runConnections(S.built!.spec, S.built!.model, S.built!.info, S.results)
  console.log(JSON.stringify({ phase: 'baseline', members: S.design.members.length, max: S.design.maxRatio, ng: S.design.ng, roles: Object.fromEntries(Object.entries(S.design.byRole).map(([r, m]) => [r, { ratio: m!.ratio, equation: m!.eq }])), service: S.design.service, connections: S.connections.map((x) => ({ type: x.type, ratio: x.ratio })) }, null, 2))
  if (process.argv.includes('--optimize')) {
    console.log('KR optimization started.')
    await runOptimize()
    if (!S.opt) throw new Error('Optimization failed: ' + JSON.stringify(S.msgs.at(-1)))
    console.log(JSON.stringify({ phase: 'optimized', weightBefore: S.opt.weightBefore, weightAfter: S.opt.weightAfter, iterations: S.opt.iters, sections: S.built!.spec.sections, memberNG: S.design!.ng, max: S.design!.maxRatio, connections: S.connections!.map((x) => ({ type: x.type, ratio: x.ratio })) }, null, 2))
  }
  // Preserve the completed app analysis even if the independent Gen check times out.
  {
    const { encodeResults } = await import('./tw-golden')
    const { gzipSync } = await import('node:zlib')
    writeFileSync(join(tmpdir(), 'smart-midas-kr-live-checkpoint.json.gz'), gzipSync(JSON.stringify({ phase: 'before-gen-check', spec: S.built!.spec, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt, results: encodeResults(S.results!) })))
  }
  if (process.argv.includes('--gen-check')) {
    const { mapi } = await import('../src/mapi/client')
    const timed = async <T,>(p: Promise<T>, ms: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try { return await Promise.race([p, new Promise<never>((_, r) => { timer = setTimeout(() => r(new Error(`timeout ${ms} ms`)), ms) })]) }
      finally { clearTimeout(timer) }
    }
    try {
      await mapi('PUT', '/DESIGN/STEEL/DSTL', { Assign: { 1: { DGNCODE: 'KDS 41 30 : 2022' } } }, 'KDS steel code')
      /* Gen 강재 설계는 강재 설계용 조합이 따로 필요 — 없으면 CODE-ANAL 'failed:LoadCombination'(라이브 2026-10-16). 앱 조합을 STRENGTH 로 복사 */
      const steelCombos = Object.fromEntries(Object.entries<any>(S.built!.sent!['LCOM-GEN']).map(([k, c]) => [k, { NAME: c.NAME, ACTIVE: 'STRENGTH', iTYPE: 0, DESC: c.DESC, vCOMB: c.vCOMB }]))
      await mapi('POST', '/db/LCOM-STEEL', { Assign: steelCombos }, 'KDS steel design combinations')
      /* 앱과 같은 길이 가정으로 맞춤 (--gen-default 면 Gen 기본값 그대로): 유효길이를 LENG 에 직접(K = 1), 골조 X 횡이동·Y 비횡이동, 부재 유형 */
      if (!process.argv.includes('--gen-default')) {
        const { krLengths } = await import('../src/domain/krDesign')
        const lens = krLengths(S.built!.spec, S.built!.model)
        const D = '/DESIGN/STEEL/KDS-41-30-2022'
        const step = async (what: string, f: () => Promise<unknown>) => { try { await f(); console.log(`Gen ${what}: ok`) } catch (e) { if (process.argv.includes('--assert-pass')) throw e; console.log(`Gen ${what}: ${e instanceof Error ? e.message : e}`) } }
        await step('DCTL', () => mapi('PUT', `${D}/DCTL`, { Assign: { 1: { FRAMEX: 'Unbraced Sway', FRAMEY: 'Braced Non-sway', bAUTOKF: false, DT: '3D' } } }, 'KDS frame'))
        await step('DCO', () => mapi('PUT', `${D}/DCO`, { Assign: { 1: { LAT_BRACE: false, SEISMIC: false } } }, 'KDS options'))
        const type = (r: string) => (r === 'column' || r === 'post' || r === 'strut' ? 'COLUMN' : r === 'brace' ? 'BRACE' : 'BEAM')
        await step('MBTP', () => mapi('POST', `${D}/MBTP`, { Assign: Object.fromEntries(S.built!.model.elements.map((e) => [e.id, { TYPE: type(e.role) }])) }, 'KDS member type'))
        await step('KFAC', () => mapi('POST', `${D}/KFAC`, { Assign: Object.fromEntries(S.built!.model.elements.map((e) => [e.id, { Ky: 1, Kz: 1 }])) }, 'KDS K = 1'))
        await step('LENG', () => mapi('POST', `${D}/LENG`, { Assign: Object.fromEntries([...lens].map(([id, l]) => [id, { LY: l.KLx / 1000, LZ: l.KLy / 1000, LB: l.Lb / 1000 }])) }, 'KDS lengths'))
      }
      /* 설계 코드 지정 후 CODE-ANAL 이 'Please perform analysis.'(라이브 2026-10-16) → 같은 모델 재해석. analyzeCore 는 앱 결과를 비우므로 쓰지 않음 */
      /* 해석 전 항상 자동 저장 (C:/temp/sms_model_*.mgbx) — 저장 안 된 변경으로 doc/anal 하면 Gen 이 저장 위치를 묻는 창을 띄움 (사용자 요청 2026-10-16) */
      const { autoSave } = await import('../src/actions/save')
      console.log('Gen autosave:', await autoSave('model'))
      console.log('Gen reanalysis:', JSON.stringify(await mapi('POST', '/doc/anal', {}, 'reanalysis for KDS check')))
      console.log('Gen CODE-ANAL:', JSON.stringify(await timed(mapi('POST', '/DESIGN/STEEL/KDS-41-30-2022/CODE-ANAL', { Argument: {} }, 'KDS code check'), 180000)))
      const r: any = await timed(mapi('POST', '/post/STEELCODECHECK', { Argument: {} }, 'KDS check table'), 180000)
      const rows: any[] = r?.vELEM ?? r?.STEELCODECHECK?.vELEM ?? []
      const comparison = compareKrMembers(S.design!, rows)
      writeFileSync(join(tmpdir(), 'smart-midas-kr-live-gen-check.json'), JSON.stringify({ aligned: !process.argv.includes('--gen-default'), ...comparison }, null, 2))
      console.log(JSON.stringify({ phase: 'gen-element-comparison', matched: comparison.matched, missing: comparison.missing, unsupported: comparison.unsupported, maxDelta: comparison.maxAbsoluteDelta, flagged: comparison.differences.length }))
      if (process.argv.includes('--assert-pass') && (!comparison.matched || comparison.missing.length || comparison.unexpected.length)) throw new Error('Incomplete Gen element comparison')
      const genBy = new Map<number, number>(rows.map((x) => [Number(x.ELEM ?? x.ID), Number(x.RAT)]))
      const byRole: Record<string, { appStrength: number; genStrength: number; n: number; status: string }> = {}
      for (const m of S.design!.members) {
        const g = genBy.get(m.id); if (g === undefined || !Number.isFinite(g)) continue
        const o = byRole[m.role] ??= { appStrength: 0, genStrength: 0, n: 0, status: m.role === 'purlin' || m.role === 'girt' ? 'different-demand-envelope' : 'matched' }
        o.appStrength = Math.max(o.appStrength, m.strengthRatio ?? m.ratio); o.genStrength = Math.max(o.genStrength, g); o.n++
      }
      console.log(JSON.stringify({ phase: 'gen-cross-check', aligned: !process.argv.includes('--gen-default'), genRows: rows.length, keys: rows[0] ? Object.keys(rows[0]) : [], byRole }, null, 2))
      /* Gen 이 실제로 쓴 길이 확인 — 역할별 첫 요소 CODE-TABLE (Len·Lb·Ly·Lz·Ky·Kz·Cb·RatPc) */
      try {
        const ids = [...new Set([...comparison.differences.slice(0, 10).map((m) => m.id), ...new Set(S.built!.model.elements.map((e) => e.role))].map((v) => typeof v === 'number' ? v : S.built!.model.elements.find((e) => e.role === v)!.id))]
        const t: any = await mapi('POST', '/DESIGN/STEEL/KDS-41-30-2022/CODE-TABLE', { Argument: { TABLE_TYPE: 'MEMB', ELEMS: { KEYS: ids }, UNIT: { FORCE: 'KN', DIST: 'M' }, COMPONENTS: ['MEMB', 'SECT', 'CHK', 'LCB', 'Len', 'Lb', 'Ly', 'Lz', 'Ky', 'Kz', 'Cb', 'RatPc'] } }, 'KDS code table')
        const tab = t?.['Result Table'] ?? Object.values(t ?? {})[0]
        if (!tab?.DATA?.length) throw new Error('Gen CODE-TABLE returned no rows')
        const lengthAudit = process.argv.includes('--gen-default') ? null : auditKrLengths(S.design!, tab)
        writeFileSync(join(tmpdir(), 'smart-midas-kr-live-gen-check.json'), JSON.stringify({ aligned: !process.argv.includes('--gen-default'), ...comparison, genTable: tab, lengthAudit }, null, 2))
        console.log('Gen CODE-TABLE head:', JSON.stringify(tab?.HEAD)); for (const row of (tab?.DATA ?? []).slice(0, 12)) console.log('  ', JSON.stringify(row))
      } catch (e) { if (process.argv.includes('--assert-pass')) throw e; console.log('Gen CODE-TABLE:', e instanceof Error ? e.message : e) }
    } catch (e) { if (process.argv.includes('--assert-pass')) throw e; console.log('Gen cross-check unavailable:', e instanceof Error ? e.message : String(e)) }
  }
  const report = buildReport({ built: S.built!, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt })
  const dxf = buildDxf({ spec: S.built!.spec, model: S.built!.model, connections: S.connections, title: 'KOREA KDS PORTAL FACTORY' })
  if (/TWN-|GB 50017|LRFD 13|SDS \/ SD1 \/ SMS/.test(report)) throw new Error('TW/CN reference leaked into KR report')
  for (const m of S.design!.members) if (!Number.isFinite(m.ratio) || m.ratio < 0) throw new Error(`Invalid design ratio: ${m.id}`)
  const output = join(tmpdir(), 'smart-midas-kr-live')
  writeFileSync(output + '.html', report); writeFileSync(output + '.dxf', dxf)
  const { encodeResults } = await import('./tw-golden')
  const { gzipSync } = await import('node:zlib')
  writeFileSync(output + '-results.json.gz', gzipSync(JSON.stringify(encodeResults(S.results!))))
  writeFileSync(output + '-summary.json', JSON.stringify({ spec: S.built!.spec, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt }, null, 2))
  console.log(JSON.stringify({ phase: 'outputs', report: output + '.html', dxf: output + '.dxf', apiErrors: S.log.filter((x) => x.type === 'err').map((x) => x.html), status: 'completed' }))
  if (process.argv.includes('--assert-pass') && (S.design!.ng || blockedMembers(S.design) || S.connections!.some((c) => c.ratio > 1) || S.log.some((x) => x.type === 'err'))) throw new Error('KR live regression: NG or API error remains')
} finally { S.mapiKey = ''; process.stdin.pause() }
