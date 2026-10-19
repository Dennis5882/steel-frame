/* 작업 진행·취소·중복 실행·전송 개수 확인 오프라인 회귀 — 가짜 Gen(fetch 대체), 키·네트워크 불필요.
   실행: node --import tsx scripts/verify-job.ts */
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }

type Db = Record<string, Record<string, unknown>>
let db: Db = {}
let calls: string[] = []
let dropNode = false
let onCall: ((n: number, path: string) => void) | null = null
let analDelay = 0
let fault = ''
const { genSectionRecord } = await import('../src/domain/sections')

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
;(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname.replace(/^\/gen/, '')
  const method = init?.method ?? 'GET'
  calls.push(`${method} ${path}`)
  onCall?.(calls.length, path)
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (path === '/doc/saveas') {
    if (fault === 'save-http') return new Response(JSON.stringify({ error: { message: 'save failed' } }), { status: 400 })
    if (fault === 'save-message') return json({ message: 'Save not allowed' })
    if (fault === 'save-unknown') return json({})
    return json({ message: 'MIDAS GEN NX command complete' })
  }
  if (path === '/doc/new') { db = {}; return json({}) }
  if (path === '/doc/anal') { if (analDelay) await new Promise((r) => setTimeout(r, analDelay)); return json({ message: 'ok' }) }
  if (path === '/post/TABLE' && body.Argument?.TABLE_TYPE === 'SECTIONALL') {
    const records=Object.entries(db.SECT ?? {}).map(([id,s]:[string,any])=>{
      const name=s.SECT_BEFORE.SECT_I.SECT_NAME,code=name.startsWith('RH')||name.startsWith('CC')?'TW':'CN'
      const r=genSectionRecord(name,code)??genSectionRecord(name,'TW')!
      return [id,String(r.A+(fault==='section-source'?1:0)),String(r.Ix),String(r.Iy),String(r.J)]
    })
    return json({SectionSource:{DIST:'MM',HEAD:['ID','Area','Iyy','Izz','Ixx'],DATA:records}})
  }
  if (path.startsWith('/doc/') || path.startsWith('/post/')) return json({})
  const name = path.replace('/db/', '')
  if (method === 'PUT') {
    const a = { ...body.Assign }
    if (dropNode && name === 'NODE') delete a[Object.keys(a)[0]]
    db[name] = { ...db[name], ...a }
    return json({ [name]: a })
  }
  if (method === 'GET') {
    if (fault === 'unknown-get') return json({})
    const data = structuredClone(db[name] ?? {})
    const first = Object.keys(data)[0], rec = data[first] as any
    if (fault === 'target-id' && name === 'NODE') { data[999999] = data[first]; delete data[first] }
    if (fault === 'body-force' && name === 'BODF') rec.FV[2] = 0
    if (fault === 'beam-value' && name === 'BMLD') rec.ITEMS[0].P[0] += 10
    if (fault === 'beam-item' && name === 'BMLD') rec.ITEMS.pop()
    if (fault === 'node-direction' && name === 'CNLD') rec.ITEMS[0].FX += 1
    if (fault === 'node-case' && name === 'CNLD') rec.ITEMS[0].LCNAME = 'wrong-case'
    if (fault === 'duplicate-load' && name === 'BMLD') rec.ITEMS[1].ID = rec.ITEMS[0].ID
    if (fault === 'defaults-reorder' && name === 'BMLD') for (const r of Object.values(data) as any[]) { r.ITEMS.reverse(); for (const item of r.ITEMS) item.USE_ADDITIONAL = false }
    return json({ [name]: data })
  }
  return json({})
}

const { S } = await import('../src/state/store')
const { setConfirmHandler } = await import('../src/components/ConfirmDialog')
setConfirmHandler(() => true) // 화면 없음 — 모델 교체 확인 자동 승인
const { msgText } = await import('../src/state/ui')
const { DEFAULT_SPEC, CN_DEFAULT_SPEC } = await import('../src/domain/types')
const { buildFactory } = await import('../src/actions/build')
const { runAnalysis } = await import('../src/actions/analysis')
const { cancelJob } = await import('../src/actions/job')
const { t } = await import('../src/i18n')

S.mapiKey = 'offline-test'
S.code = 'TW'
let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'OK ' : 'NG '} ${msg}`); if (!cond) fails++ }
const lastBot = () => { const m = [...S.msgs].reverse().find((x) => x.role === 'bot' && x.kind === 'html'); return m ? msgText(m) : '' }
const reset = () => { calls = []; dropNode = false; onCall = null; analDelay = 0; fault = '' }
const spec = () => structuredClone(DEFAULT_SPEC)

/* 1. 정상 전송 — 개수 확인 통과, 작업 정리 */
reset()
await buildFactory(spec())
ok(!!S.built && S.job === null && !S.busy, `build ok (${calls.length} calls, built ${!!S.built}, job ${S.job})`)
ok(calls.filter((c) => c.startsWith('GET')).length === 11, 'verification: 11 GETs including load tables')
ok(S.log.some((l) => l.html === t('log_verify_ok', 11)), 'log: data verified')

/* Backup failure must preserve the existing app/Gen model and prevent doc/new. */
for (const f of ['save-http', 'save-message', 'save-unknown']) {
  const before = S.built, rp = S.restorePoint
  reset(); fault = f
  await buildFactory(spec())
  ok(S.built === before && !calls.includes('POST /doc/new') && !calls.some((c) => c.startsWith('PUT')), `${f}: model replacement prevented`)
  ok(S.restorePoint === rp, `${f}: restore point unchanged (Gen document untouched)`)
  ok(!S.busy && S.job === null, `${f}: job cleaned up`)
}
reset(); await buildFactory(spec())
/* 저장 실패 → 해석 안 함 + 이전 결과 보존 (해석하지 않았으니 결과는 여전히 현재 모델의 것) */
const prevDesign = {} as NonNullable<typeof S.design>
S.analyzed = true; S.design = prevDesign; S.connections = []
reset(); fault = 'save-message'
await runAnalysis()
ok(!calls.includes('POST /doc/anal') && S.analyzed && S.design === prevDesign && !!S.connections, 'failed model save blocks analysis and keeps prior results')
S.analyzed = false; S.design = null; S.connections = null

/* Same record count must not hide changed IDs, missing load items or values. */
for (const f of ['unknown-get', 'target-id', 'body-force', 'beam-value', 'beam-item', 'node-direction', 'node-case', 'duplicate-load', 'section-source']) {
  reset(); fault = f
  await buildFactory(spec())
  ok(S.built === null && !S.analyzed && !S.design && !S.connections, `${f}: unverified model rejected`)
}
reset(); fault = 'defaults-reorder'
await buildFactory(spec())
ok(!!S.built, 'Gen default fields and reordered load items accepted by item ID')
reset(); await buildFactory(structuredClone(CN_DEFAULT_SPEC))
ok(S.built?.spec.code === 'CN' && !calls.includes('PUT /db/DSTL'), 'CN: strict model/load verification succeeds without legacy DSTL')
reset(); fault = 'beam-value'; await buildFactory(structuredClone(CN_DEFAULT_SPEC))
ok(S.built === null, 'CN: changed load value rejected')

/* 2. Gen 이 절점 하나를 버림 → 실패, 이전 모델 정보 비움 */
S.restorePoint = null
reset(); dropNode = true
await buildFactory(spec())
ok(S.built === null && lastBot().includes('NODE') && lastBot().includes('/'), `count mismatch fails: ${lastBot().replace(/<[^>]+>/g, '')}`)
ok(/sms_backup_.*\.mgbx$/.test(S.restorePoint ?? ''), `count mismatch after doc/new → restore point kept for the failure card (${S.restorePoint})`)

/* 3. 전송 도중 취소 → 다음 호출 전에 멈춤, 모델 중간 상태 안내 */
S.restorePoint = null
reset()
onCall = (n) => { if (n === 5) cancelJob() }
await buildFactory(spec())
ok(calls.length === 5, `cancel stops before next call (calls ${calls.length})`)
ok(S.built === null && lastBot() === t('job_cancelled_model'), 'cancel mid-send → rebuild message')
ok(S.job === null && !S.busy, 'job cleared after cancel')
ok(/sms_backup_/.test(S.restorePoint ?? ''), 'cancel after doc/new → restore point recorded')

/* 4. 해석 중 취소 → 해석 호출은 끝까지, 이후 호출 없음, 모델 유지 */
reset()
await buildFactory(spec())
reset(); analDelay = 200
const p = runAnalysis()
await new Promise((r) => setTimeout(r, 50))
ok(S.job?.stage === 'st_anal' && calls.at(-1) === 'POST /doc/anal', `progress shows analysis stage (${S.job?.stage} ${S.job?.step}/${S.job?.total})`)
/* 5. 진행 중 중복 실행 → 거부 */
const n0 = calls.length
await runAnalysis()
ok(calls.length === n0 && lastBot() === t('busy'), 'duplicate run rejected while busy')
cancelJob()
await p
ok(!!S.built && lastBot() === t('job_cancelled') && !calls.some((c) => c.includes('TABLE')), 'cancel during analysis: waits, then stops; model kept')

console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
