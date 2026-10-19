/* 다층 강골조 라이브 실행 — 기준 예제(docs/tutorial-cn-braced-frame.md)를 Gen NX 에 만들고 해석·층 표·부재 검토 후 목표값과 대조.
   Run: npx tsx scripts/live-frame.ts < /dev/null   (키: stdin → MAPI_KEY → .env)
   현재 문서를 C:/temp 에 백업 저장한 뒤 새 문서에서 진행. 결과: output/frame/live-<시각>.json
   주의(gen-api-cautions.md): Assign 본문 DELETE·STEELCODECHECK 호출 금지. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'
import { buildFrame } from '../src/frame/geometry'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { framePayloads, selfWeight } from '../src/frame/gen'
import { gravityTotals } from '../src/frame/loads'
import { fetchElementForces, n, reactionSums, rows, table, type Request } from '../src/frame/results'
import { designMembers, runFrameDesign } from '../src/frame/design'
import { sectionArea } from '../src/domain/sections'
import { parseEigen, storyReview, type StoryTables } from '../src/frame/story'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 15 * 60 * 1000 })
const req: Request = (m, p, b) => client.request(m, p, b as any) as Promise<any>
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
const ok = (r: any, what: string) => { if (r?.message !== 'MIDAS GEN NX command complete') throw new Error(`${what}: ${r?.message ?? JSON.stringify(r)}`) }
const log = (...a: unknown[]) => console.log(...a)
const evidence: Record<string, unknown> = { stamp }

const spec = TUTORIAL_SPEC, model = buildFrame(spec), P = framePayloads(spec, model)
log(`model: nodes ${model.nodes.length}, elements ${model.elements.length}, supports ${model.supports.length}, combos ${P.combos.length}`)
for (const w of P.wind) log(`wind ${w.dir}: T1 ${w.T1.toFixed(3)} s, base ${w.base.toFixed(2)} kN, βz ${w.stories.map((s) => s.betaz.toFixed(3)).join('/')}`)

try {
  ok(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_backup_${stamp}.mgbx` }), 'backup')
  ok(await req('POST', '/doc/new', {}), 'doc/new')
  const order = ['UNIT', 'MATL', 'SECT', 'NODE', 'ELEM', 'CONS', 'STLD', 'BODF', 'FBLD', 'FBLA', 'BMLD', 'CNLD', 'STOR'] as const
  for (const db of order) await req('PUT', `/db/${db}`, { Assign: (P as any)[db] })
  await req('POST', '/ope/STOR', { Argument: { SEIS_ECC: { INC_SEIS_ECC: true, SEIS_ECC_VALUE: 5 }, WIND_ECC: { INC_WIND_ECC: true, WIND_ECC_VALUE: 15 } } })
  for (const db of ['STYP', 'LTOM', 'EIGV', 'SPFC', 'SPLC', 'LCOM-GEN'] as const) await req('PUT', `/db/${db}`, { Assign: (P as any)[db] })
  const count = async (db: string) => Object.keys((await req('GET', `/db/${db}`))?.[db] ?? {}).length
  const counts = { NODE: await count('NODE'), ELEM: await count('ELEM'), CONS: await count('CONS'), FBLA: await count('FBLA'), LCOM: await count('LCOM-GEN') }
  log('sent / readback', counts)
  evidence.counts = counts

  ok(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_frame_${stamp}.mgbx` }), 'save model')
  const t0 = Date.now()
  ok(await req('POST', '/doc/anal', {}), 'analysis')
  log(`analysis ${((Date.now() - t0) / 1000).toFixed(1)} s`)

  /* 평형 */
  const reac = await reactionSums(req, ['DL(ST)', 'LL(ST)', 'WX(ST)', 'WY(ST)'])
  const g = gravityTotals(spec, model), sw = selfWeight(model, (s) => sectionArea(s, 'CN'))
  const eq = { DL: { gen: reac.DL?.FZ, app: g.dlExceptSelf + sw }, LL: { gen: reac.LL?.FZ, app: g.ll }, WX: { gen: -(reac.WX?.FX ?? 0), app: P.wind[0].base }, WY: { gen: -(reac.WY?.FY ?? 0), app: P.wind[1].base } }
  log('equilibrium', eq)
  evidence.equilibrium = eq

  /* 층 표 */
  const story: Record<string, unknown> = {}
  const tryTable = async (key: string, type: string, loads?: string[], extra?: object) => {
    try { const t = await table(req, type, { loads, extra }); story[key] = rows(t); return rows(t) } catch (e: any) { story[key] = `ERR ${e.message}`; log(`  ${type}: ${e.message}`); return null }
  }
  const mass = await tryTable('mass', 'STORY_MASS')
  const sx = await tryTable('shearX', 'STORY_SHEAR_FORCE_COEFFICIENT', ['RX(RS)'])
  const sy = await tryTable('shearY', 'STORY_SHEAR_FORCE_COEFFICIENT', ['RY(RS)'])
  const dx = await tryTable('driftX', 'STORY_DRIFT_X', ['RX(RS)'])
  const dy = await tryTable('driftY', 'STORY_DRIFT_Y', ['RY(RS)'])
  await tryTable('dispX', 'STORY_DISPLACEMENT_X', ['RX(RS)'])
  await tryTable('dispY', 'STORY_DISPLACEMENT_Y', ['RY(RS)'])
  const SD = { ADDITIONAL: { SET_CALCULATION_METHOD: { STORY_DRIFT_METHOD: 'Drift at the Center of Mass', STORY_STIFFNESS_METHOD: 'Story Shear / Story Drift' } } }
  const kx = await tryTable('stiffX', 'STIFFNESS_IRREGULARITY_X', ['RX(RS)'], SD)
  await tryTable('stiffY', 'STIFFNESS_IRREGULARITY_Y', ['RY(RS)'], SD)
  await tryTable('torsionX', 'TORSIONAL_IRREGULARITY_X', ['RX(RS)'])
  await tryTable('torsionY', 'TORSIONAL_IRREGULARITY_Y', ['RY(RS)'])
  /* 주기·참여질량 — EIGENVALUEMODE 는 간헐적으로 Unknown Error (gen-api-cautions.md 4) → 한 번 재시도 */
  let eigen: ReturnType<typeof parseEigen> = null
  for (let i = 0; i < 2 && !eigen; i++) {
    try { eigen = parseEigen((await req('POST', '/post/TABLE', { Argument: { TABLE_NAME: 'EV', TABLE_TYPE: 'EIGENVALUEMODE', UNIT: { FORCE: 'KN', DIST: 'M' } } }))?.EV) }
    catch (e: any) { log(`  EIGENVALUEMODE try ${i + 1}: ${e?.responseBody?.message ?? e.message}`) }
  }
  story.eigen = eigen
  if (eigen) log(`periods ${eigen.periods.slice(0, 4).map((t) => t.toFixed(4)).join(' / ')} s (target T1 1.044) · mass X ${eigen.massX.at(-1)}% Y ${eigen.massY.at(-1)}%`)
  evidence.story = story
  if (mass) log('story mass (t)', mass.map((r) => `${r.Story}:${(+r['X-DIR']).toFixed(2)}`).join(' '), '| target Roof 84.69 · 4F 231.55 · 3F 231.55 · 2F 232.64')
  if (sx) log('RX shear (kN)', sx.map((r) => `${r.Story}:${(+r['Shear Force/X']).toFixed(1)}/${(+r['Weight Sum/X']).toFixed(0)}/${(+r['Story Shear Force Coefficient/X']).toFixed(4)}`).join(' '), '| target 1F 515.23 / 7653 / 0.0673')
  if (sy) log('RY shear (kN)', sy.map((r) => `${r.Story}:${(+r['Shear Force/Y']).toFixed(1)}/${(+r['Story Shear Force Coefficient/Y']).toFixed(4)}`).join(' '), '| target 1F 279.98 / 0.0366')
  const driftCol = (r: Record<string, string>) => r['Maximum Drift of All Vertical Elements/Story Drift Ratio']
  if (dx) log('RX drift ratio', dx.map((r) => `${r.Story}:1/${Math.round(1 / n(driftCol(r)))}`).join(' '), '| target 4F 1/7177 · 3F 1/3749 · 2F 1/2782 · 1F 1/2357')
  if (dy) log('RY drift ratio', dy.map((r) => `${r.Story}:1/${Math.round(1 / n(driftCol(r)))}`).join(' '))
  if (kx) log('RX stiffness (kN/m)', kx.map((r) => `${r.Story}:${(+r['Story Stiffness']).toFixed(0)}`).join(' '), '| target 4F 237122 · 3F 418193 · 2F 481185 · 1F 354125 (N/mm)')

  /* 요소력 + 기둥 강축 방향 확인 (WX 에서 기둥 Moment-y vs Moment-z) */
  const ids = model.elements.map((e) => e.id)
  const colIds = model.elements.filter((e) => e.role === 'column').map((e) => e.id)
  const tW = await table(req, 'BEAMFORCE', { loads: ['WX(ST)'], keys: colIds })
  let my = 0, mz = 0
  for (const r of rows(tW)) { my += Math.abs(n(r['Moment-y'])); mz += Math.abs(n(r['Moment-z'])) }
  const colStrongAxis = my >= mz ? 'X' : 'Y'
  log(`column local axes under WX: Σ|Moment-y| ${my.toFixed(1)}, Σ|Moment-z| ${mz.toFixed(1)} → strong axis bends in ${colStrongAxis} frames`)
  evidence.colStrongAxis = colStrongAxis

  const t1 = Date.now()
  const forces = await fetchElementForces(req, ids, P.combos.map((c) => c.name), (d, t) => log(`  BEAMFORCE ${d}/${t} combos`))
  const loadNames = new Set<string>(); for (const m of forces.values()) for (const k of m.keys()) loadNames.add(k)
  log(`element forces: ${forces.size} elements, loads [${[...loadNames].slice(0, 6).join(', ')} …] (${loadNames.size}) in ${((Date.now() - t1) / 1000).toFixed(1)} s`)

  /* 오프라인 회귀용 요소력 보관 (scripts/fixtures/cn-frame.json.gz 로 복사해 고정) */
  const { gzipSync } = await import('node:zlib')
  mkdirSync('output/frame', { recursive: true })
  writeFileSync(`output/frame/forces-${stamp}.json.gz`, gzipSync(JSON.stringify({ stamp, colStrongAxis, story, equilibrium: evidence.equilibrium,
    forces: [...forces].map(([id, m]) => [id, [...m].map(([load, st]) => [load, st.map((p) => [p.N, p.Vx, p.Vy, p.Mx, p.My])])]) })))

  const review = storyReview(spec, model, story as StoryTables, colStrongAxis)
  for (const it of review) log(`story ${it.key}${it.dir ? ' ' + it.dir : ''} [${it.status}] ${it.clause}: ${it.rows.map((r) => `${r.story} ${it.key === 'drift' ? '1/' + Math.round(1 / r.value) : r.value.toFixed(3)}${r.status !== 'ok' ? '(' + r.status + ')' : ''}`).join(' · ')}`)
  evidence.review = review

  const members = designMembers(spec, model, colStrongAxis)
  const design = runFrameDesign(spec, members, forces, P.combos.map((c) => ({ name: c.name, seismic: c.seismic })))
  for (const role of ['beam', 'column', 'brace'] as const) {
    const m = design.byRole[role]!
    log(`${role}: max ratio ${m.ratio.toFixed(3)} (member ${m.id}, elems ${m.elements.join('+')}, story ${m.story}, ${m.worst.combo}, ${m.worst.governing}) μx ${m.muX.toFixed(3)} μy ${m.muY.toFixed(3)} detail ${m.detailRatio.toFixed(3)} class S${m.st.cls}`)
  }
  log('target: beam 0.912 · column ~0.69 · brace ~0.45 (Gen GB50017-17, 抗震二级)')
  evidence.design = design.members.map((m) => ({ id: m.id, role: m.role, story: m.story, elements: m.elements, L: m.L, muX: m.muX, muY: m.muY, ratio: m.ratio, combo: m.worst.combo, governing: m.worst.governing, detail: m.detailRatio, items: m.worst.items }))
  evidence.model = `C:/temp/sf_frame_${stamp}.mgbx`
} finally {
  mkdirSync('output/frame', { recursive: true })
  writeFileSync(`output/frame/live-${stamp}.json`, JSON.stringify(evidence, null, 2))
  log(`evidence: output/frame/live-${stamp}.json`)
}
