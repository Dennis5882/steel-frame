import assert from 'node:assert/strict'
;(globalThis as any).document = { documentElement: { lang: 'ko', dataset: {} } }
const { S } = await import('../src/state/store')
const { unavailable, taskStatus, isStale } = await import('../src/state/taskFlow')
const { selectTask, addMsg, recordArtifact } = await import('../src/state/ui')
const { beginJob, endJob, failMsg, Cancelled } = await import('../src/actions/job')
const { clearChat } = await import('../src/agent/session')
const { downloadDrawings, downloadQuantities, downloadReportPdf, openReport } = await import('../src/actions/outputs')
const { defaultSpecFor } = await import('../src/domain/types')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
let n = 0
const eq = (a: unknown, b: unknown) => { assert.deepEqual(a, b); n++ }
const ready = () => { S.busy = false; S.confirm = null; S.job = null; S.lastFail = null; S.genChanged = 0; S.draftInvalid = false; S.mapiKey = ''; S.activity = [] }
for (const code of ['TW', 'CN'] as const) {
  ready()
  const spec = defaultSpecFor(code), model = buildPortal(spec), load = buildLoadPayloads(spec, model)
  const b = { spec, model, info: load.info, cases: Object.keys(load.STLD), combos: Object.keys(load['LCOM-GEN']).length, comboNames: [] }
  S.built = null; S.design = null; S.connections = null; S.analyzed = false
  eq(unavailable(S, 'analysis'), 'flow_need_model')
  S.built = b; S.draftSpec = spec
  eq(unavailable(S, 'analysis'), 'flow_need_connection')
  S.mapiKey = 'test-only'; eq(unavailable(S, 'analysis'), null)
  eq(unavailable(S, 'design'), 'need_anal')
  // Outputs need only the model: partial report, member-only drawings and quantities.
  S.analyzed = false; eq(unavailable(S, 'outputs'), null)
  S.analyzed = true; eq(unavailable(S, 'design'), null)
  eq(unavailable(S, 'outputs'), null)
  eq(unavailable(S, 'optimize'), 'flow_need_design')
  S.design = { members: [] } as unknown as NonNullable<typeof S.design>; S.connections = []
  eq(unavailable(S, 'outputs'), null)
  S.mapiKey = ''; eq(unavailable(S, 'outputs'), null) // Local outputs do not require an API key.
  S.draftSpec = { ...spec, span: spec.span + 1 }
  eq(isStale(S), true)
  selectTask('design'); eq(S.preview, null)
  eq(unavailable(S, 'outputs'), 'wf_stale_edited') // Stale state survives leaving the model preview.
  S.draftSpec = spec; S.draftInvalid = true
  eq(unavailable(S, 'analysis'), 'flow_invalid_draft')
  eq(unavailable(S, 'outputs'), 'flow_invalid_draft')
  // Every output entry point must stop before touching browser download APIs.
  let downloads = 0
  ;(globalThis as any).document.createElement = () => { downloads++; throw new Error('unexpected output') }
  downloadDrawings(); downloadQuantities(); openReport(); await downloadReportPdf()
  eq(downloads, 0)
  S.draftInvalid = false
  S.design = { members: [{ issues: [{ key: 'effectiveLength', level: 'blocked', detail: 'B2 > 1.5' }] }] } as unknown as NonNullable<typeof S.design>
  eq(unavailable(S, 'outputs'), 'flow_invalid_design')
  eq(taskStatus(S, 'design'), 'failed')
  downloadDrawings(); downloadQuantities(); openReport(); await downloadReportPdf()
  eq(downloads, 0)
  S.design = { members: [] } as unknown as NonNullable<typeof S.design>
  S.draftInvalid = false; S.genChanged = 1
  eq(unavailable(S, 'outputs'), 'wf_stale_gen')
  // Gen-checking jobs stay runnable: their first step re-compares Gen, so reverting in Gen clears the block.
  S.mapiKey = 'test-only'
  for (const task of ['analysis', 'design', 'optimize'] as const) eq(unavailable(S, task), null)
  S.mapiKey = ''
  eq(taskStatus(S, 'outputs'), 'stale')
  S.genChanged = 0
  eq(taskStatus(S, 'outputs'), 'ready')
  recordArtifact('test.pdf'); eq(taskStatus(S, 'outputs'), 'done')
  S.resultRevision++; eq(taskStatus(S, 'outputs'), 'ready')
  S.busy = true; eq(unavailable(S, 'outputs'), 'busy'); S.busy = false
  S.confirm = { title: '', body: '', ok: '', resolve() {} }
  eq(unavailable(S, 'outputs'), 'busy'); S.confirm = null
}
ready(); S.msgs = []
addMsg('bot', 'critical', 'error'); addMsg('bot', 'later information')
eq(S.activity.filter((a) => a.level === 'error' && !a.acknowledged).length, 1)
clearChat(); eq(S.activity.length, 2); eq(S.activity[0].acknowledged, true)
eq(beginJob('anal'), true)
const jobId = S.job!.activityId
eq(beginJob('design'), false)
addMsg('bot', failMsg(new Error('offline'), (m) => m))
endJob()
eq(S.activity.find((a) => a.id === jobId)?.status, 'failed')
eq(S.activity.some((a) => a.parent === jobId && a.level === 'error'), true)
eq(beginJob('anal'), true)
const cancelId = S.job!.activityId
addMsg('bot', failMsg(new Cancelled(), (m) => m)); endJob()
eq(S.activity.find((a) => a.id === cancelId)?.status, 'cancelled')
console.log(`Task flow: ${n} checks passed (TW/CN prerequisites, stale output guards, revisions, persistent issues, failure/cancel history)`)
