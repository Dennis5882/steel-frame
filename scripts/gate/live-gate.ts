/* 단계 0 게이트 (docs/steel-app-plan.md 2.2절) — 예제 4층 강 가새골조를 API로 입력·해석하고 항목별 수용 여부를 기록한다.
   Run: npx tsx scripts/gate/live-gate.ts < /dev/null   (키: stdin → MAPI_KEY → .env)
   현재 문서를 C:/temp 에 저장한 뒤 새 문서에서 시험한다. 시험 모델은 C:/temp/sf_gate_*.mgbx 로 남는다.
   결과: output/gate/evidence.json (gitignore) */
import { mkdirSync, writeFileSync } from 'node:fs'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 15 * 60 * 1000 })
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
const ev: { step: string; ok: boolean; detail?: unknown }[] = []
const req = (m: 'GET' | 'PUT' | 'POST' | 'DELETE', p: string, b?: unknown) => client.request(m, p, b as any) as Promise<any>
const errMsg = (e: any) => e?.responseBody?.error?.message ?? e?.responseBody?.message ?? JSON.stringify(e?.responseBody ?? '') ?? e?.message
async function step<T>(name: string, fn: () => Promise<T>, show?: (r: T) => unknown): Promise<T | undefined> {
  try {
    const r = await fn()
    const detail = show ? show(r) : r
    ev.push({ step: name, ok: true, detail })
    console.log(`OK   ${name}`, JSON.stringify(detail)?.slice(0, 400))
    return r
  } catch (e: any) {
    ev.push({ step: name, ok: false, detail: errMsg(e) || e?.message })
    console.log(`FAIL ${name}`, errMsg(e) || e?.message)
    return undefined
  }
}
const cmdOk = (r: any) => { if (r?.message !== 'MIDAS GEN NX command complete') throw new Error(String(r?.message ?? JSON.stringify(r))); return r }

/* ── 예제 형상: X 6000×4, Y 4000×4, 층고 4.5 + 3.3×3 ── */
const XS = [0, 6, 12, 18, 24], YS = [0, 4, 8, 12, 16], ZS = [0, 4.5, 7.8, 11.1, 14.4]
const nid = (i: number, j: number, k: number) => 1 + i + j * XS.length + k * XS.length * YS.length
const NODE: Record<number, any> = {}
for (let k = 0; k < ZS.length; k++) for (let j = 0; j < YS.length; j++) for (let i = 0; i < XS.length; i++) NODE[nid(i, j, k)] = { X: XS[i], Y: YS[j], Z: ZS[k] }
const ELEM: Record<number, any> = {}
let eid = 1
const col: number[] = [], beam: number[] = [], brace: number[] = [], perim: number[] = [], roofPerim: number[] = []
for (let k = 0; k < ZS.length - 1; k++) for (let j = 0; j < YS.length; j++) for (let i = 0; i < XS.length; i++) {
  ELEM[eid] = { TYPE: 'BEAM', MATL: 1, SECT: 1, NODE: [nid(i, j, k), nid(i, j, k + 1)], ANGLE: 0 }; col.push(eid++)
}
for (let k = 1; k < ZS.length; k++) {
  for (let j = 0; j < YS.length; j++) for (let i = 0; i < XS.length - 1; i++) {
    ELEM[eid] = { TYPE: 'BEAM', MATL: 1, SECT: 2, NODE: [nid(i, j, k), nid(i + 1, j, k)], ANGLE: 0 }
    if (j === 0 || j === YS.length - 1) (k === ZS.length - 1 ? roofPerim : perim).push(eid)
    beam.push(eid++)
  }
  for (let i = 0; i < XS.length; i++) for (let j = 0; j < YS.length - 1; j++) {
    ELEM[eid] = { TYPE: 'BEAM', MATL: 1, SECT: 2, NODE: [nid(i, j, k), nid(i, j + 1, k)], ANGLE: 0 }
    if (i === 0 || i === XS.length - 1) (k === ZS.length - 1 ? roofPerim : perim).push(eid)
    beam.push(eid++)
  }
}
/* 가새: 외곽 X 방향 가운데 두 베이(Y=0·16), Y 방향 가운데 두 베이(X=0·24), 전 층 X형 */
for (let k = 0; k < ZS.length - 1; k++) {
  for (const j of [0, YS.length - 1]) for (const i of [1, 2]) for (const [a, b] of [[nid(i, j, k), nid(i + 1, j, k + 1)], [nid(i + 1, j, k), nid(i, j, k + 1)]]) {
    ELEM[eid] = { TYPE: 'TRUSS', MATL: 1, SECT: 3, NODE: [a, b], ANGLE: 0 }; brace.push(eid++)
  }
  for (const i of [0, XS.length - 1]) for (const j of [1, 2]) for (const [a, b] of [[nid(i, j, k), nid(i, j + 1, k + 1)], [nid(i, j + 1, k), nid(i, j, k + 1)]]) {
    ELEM[eid] = { TYPE: 'TRUSS', MATL: 1, SECT: 3, NODE: [a, b], ANGLE: 0 }; brace.push(eid++)
  }
}
const sect = (name: string, truss: boolean) => ({
  SECTTYPE: 'DBUSER', SECT_NAME: name.replace(/ /g, ''),
  SECT_BEFORE: { OFFSET_PT: 'CC', OFFSET_CENTER: 0, USER_OFFSET_REF: 0, HORZ_OFFSET_OPT: 0, USERDEF_OFFSET_YI: 0, VERT_OFFSET_OPT: 0, USERDEF_OFFSET_ZI: 0,
    USE_SHEAR_DEFORM: true, USE_WARPING_EFFECT: !truss, SHAPE: 'H', DATATYPE: 1, SECT_I: { DB_NAME: 'GB-YB05', SECT_NAME: name } },
})
const CONS: Record<number, any> = {}
for (let j = 0; j < YS.length; j++) for (let i = 0; i < XS.length; i++) CONS[nid(i, j, 0)] = { ITEMS: [{ ID: nid(i, j, 0), CONSTRAINT: '1111111' }] }

console.log(`model: nodes ${Object.keys(NODE).length}, elems ${eid - 1} (col ${col.length}, beam ${beam.length}, brace ${brace.length})`)

try {
  await step('verify', () => client.verifyConnection(), (r: any) => ({ status: r.status, program: r.program }))
  await step('backup current doc', async () => cmdOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_backup_${stamp}.mgbx` })))
  await step('doc/new', async () => cmdOk(await req('POST', '/doc/new', {})))
  await step('UNIT kN·m', () => req('PUT', '/db/UNIT', { Assign: { 1: { FORCE: 'KN', DIST: 'M', HEAT: 'KJ', TEMPER: 'C' } } }))

  /* 1. 재료 Q355 — 규격 GB50017-17(S) (설치 DLL 문자열 확인) */
  const q355 = await step('1 MATL Q355 GB50017-17(S)', () => req('PUT', '/db/MATL', { Assign: { 1: { TYPE: 'STEEL', NAME: 'Q355', DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 1, STANDARD: 'GB50017-17(S)', CODE: '', DB: 'Q355', bELAST: false }] } } }))
  /* GB50017-17(S) 는 이 빌드에서 DB 재료 전부 Unknown Error (live-gate2·3) → 사용자 정의 Q355 (E 206 GPa, γ 78.5) */
  if (!q355) await step('1b MATL user-defined Q355', () => req('PUT', '/db/MATL', { Assign: { 1: { TYPE: 'STEEL', NAME: 'Q355', DAMP_RAT: 0.02, PARAM: [{ P_TYPE: 2, ELAST: 2.06e8, POISN: 0.3, THERMAL: 1.2e-5, DEN: 78.5, MASS: 78.5 / 9.806 }] } } }))
  await step('1 MATL readback', () => req('GET', '/db/MATL'), (r) => r?.MATL?.[1]?.PARAM?.[0] ?? r)
  await step('SECT HW250/HW200/HW150 (GB-YB05)', () => req('PUT', '/db/SECT', { Assign: { 1: sect('HW 250x250x9/14', false), 2: sect('HW 200x200x8/12', false), 3: sect('HW 150x150x7/10', true) } }), () => 'ok')
  await step('NODE', () => req('PUT', '/db/NODE', { Assign: NODE }), () => Object.keys(NODE).length)
  await step('ELEM', () => req('PUT', '/db/ELEM', { Assign: ELEM }), () => eid - 1)
  await step('CONS fixed', () => req('PUT', '/db/CONS', { Assign: CONS }), () => Object.keys(CONS).length)
  await step('NODE/ELEM count readback', async () => ({ nodes: Object.keys((await req('GET', '/db/NODE')).NODE ?? {}).length, elems: Object.keys((await req('GET', '/db/ELEM')).ELEM ?? {}).length }), (r) => r)

  /* 하중 케이스 */
  await step('STLD DL/LL', () => req('PUT', '/db/STLD', { Assign: { 1: { NAME: 'DL', TYPE: 'D', DESC: 'Dead' }, 2: { NAME: 'LL', TYPE: 'L', DESC: 'Live' } } }), () => 'ok')
  await step('BODF self weight', () => req('PUT', '/db/BODF', { Assign: { 1: { LCNAME: 'DL', GROUP_NAME: '', FV: [0, 0, -1] } } }), () => 'ok')

  /* 2. 층 데이터 */
  const story = (name: string, z: number) => ({ STORY_NAME: name, STORY_LEVEL: z, bFLOOR_DIAPHRAGM: z > 0, WIND_FLOOR_WIDTH_X: 24, WIND_FLOOR_WIDTH_Y: 16, WIND_CENTER_X: 12, WIND_CENTER_Y: 8,
    WIND_ECCENT_X: 0, WIND_ECCENT_Y: 0, SEIS_ACC_ECCENT_X: 0.05 * 24, SEIS_ACC_ECCENT_Y: 0.05 * 16, SEIS_INHERENT_ECCENT_X: 0, SEIS_INHERENT_ECCENT_Y: 0, SEIS_TORSIONAL_AMP_FACTOR_X: 1, SEIS_TORSIONAL_AMP_FACTOR_Y: 1 })
  await step('2 STOR (story diaphragm)', () => req('PUT', '/db/STOR', { Assign: { 1: story('1F', 0), 2: story('2F', 4.5), 3: story('3F', 7.8), 4: story('4F', 11.1), 5: story('RF', 14.4) } }), () => 'ok')

  /* 3. 바닥하중 FBLD(유형) + FBLA(층별 영역) — 강재 보에 양방향 분배 */
  await step('3 FBLD floor/roof types', () => req('PUT', '/db/FBLD', { Assign: {
    1: { NAME: 'FLOOR', DESC: '', ITEM: [{ LCNAME: 'DL', FLOOR_LOAD: -5, OPT_SUB_BEAM_WEIGHT: true }, { LCNAME: 'LL', FLOOR_LOAD: -2, OPT_SUB_BEAM_WEIGHT: true }] },
    2: { NAME: 'ROOF', DESC: '', ITEM: [{ LCNAME: 'DL', FLOOR_LOAD: -2, OPT_SUB_BEAM_WEIGHT: true }, { LCNAME: 'LL', FLOOR_LOAD: -0.5, OPT_SUB_BEAM_WEIGHT: true }] },
  } }), () => 'ok')
  const fbla: Record<number, any> = {}
  for (let k = 1; k < ZS.length; k++) fbla[k] = { FLOOR_LOAD_TYPE_NAME: k === ZS.length - 1 ? 'ROOF' : 'FLOOR', FLOOR_DIST_TYPE: 2, DIR: 'GZ',
    NODES: [nid(0, 0, k), nid(XS.length - 1, 0, k), nid(XS.length - 1, YS.length - 1, k), nid(0, YS.length - 1, k)], GROUP_NAME: '' }
  await step('3 FBLA per storey (two-way)', () => req('PUT', '/db/FBLA', { Assign: fbla }), () => Object.keys(fbla).length)
  /* 보 선하중: 외곽 보 바닥 5·지붕 1 kN/m */
  const BMLD: Record<number, any> = {}
  for (const id of perim) BMLD[id] = { ITEMS: [{ ID: 1, LCNAME: 'DL', GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: 'GZ', USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [-5, -5, 0, 0] }] }
  for (const id of roofPerim) BMLD[id] = { ITEMS: [{ ID: 1, LCNAME: 'DL', GROUP_NAME: '', CMD: 'BEAM', TYPE: 'UNILOAD', DIRECTION: 'GZ', USE_PROJECTION: false, USE_ECCEN: false, D: [0, 1, 0, 0], P: [-1, -1, 0, 0] }] }
  await step('BMLD perimeter line loads', () => req('PUT', '/db/BMLD', { Assign: BMLD }), () => Object.keys(BMLD).length)

  /* 4. 질량: 자중 → 질량, 하중 → 질량(DL 1.0 + LL 0.5) */
  await step('4 STYP self weight → mass', () => req('PUT', '/db/STYP', { Assign: { 1: { bSELFWEIGHT: true } } }), () => 'ok')
  await step('4 STYP readback', () => req('GET', '/db/STYP'), (r) => r)
  await step('4 LTOM DL1.0+LL0.5', () => req('PUT', '/db/LTOM', { Assign: { 1: { DIR: 'XY', bNODAL: true, bBEAM: true, bFLOOR: true, bPRES: false, GRAV: 9.806, vLC: [{ LCNAME: 'DL', FACTOR: 1 }, { LCNAME: 'LL', FACTOR: 0.5 }] } } }), () => 'ok')

  /* 5. 고유치 + GB50011 스펙트럼(네이티브 CH2010) + RS 케이스 */
  await step('5 EIGV Lanczos 12', () => req('PUT', '/db/EIGV', { Assign: { 1: { TYPE: 'LANCZOS', iFREQ: 12, iITER: 20, iDIM: 1, TOL: 1e-10, bMINMAX: false, FRMIN: 0, FRMAX: 0, bSTRUM: false } } }), () => 'ok')
  await step('5 SPFC CH2010 7度0.10g II 1组 ζ0.04', () => req('PUT', '/db/SPFC', { Assign: { 1: { NAME: 'CN-RS', iTYPE: 1, iMETHOD: 0, SCALE: 1, GRAV: 9.806, DRATIO: 0.04,
    STR: { SPEC_CODE: 'CH2010', SFI: '0.10g', SC_: 'II', EQ_: 'FREQUENT' }, OPT: { NSC: 0, nLForce: 0 }, VAL: { aTG: [0.35, 0, 0], DP: 0.04, MaxEQ: 0.08, PERIOD: 6 }, CALC_OPT: true } } }), () => 'ok')
  await step('5 SPFC readback (generated curve)', () => req('GET', '/db/SPFC'), (r: any) => { const f = r?.SPFC?.[1]; return { n: f?.aFUNC?.length, first: f?.aFUNC?.slice(0, 3), STR: f?.STR } })
  const splc = (name: string, angle: number) => ({ NAME: name, DIR: 'XY', ANGLE: angle, SCALE: 1, PMFT: 1, bDAMP: false, INTERP: 'LOG', DESC: '', COMTYPE: 'CQC', bADDSIGN: true, iSIGNTYPE: 0, bMODE: false, aFUNCNAME: ['CN-RS'],
    bACCECC: true, bACCECC_AUTO: true, ACCECC_PERCENT: 5, bACCECC_CONSIDER_GL: false, bACCECC_MINIMUM_TORSION: false, aACCECC_ECCEN_LIST: [] })
  await step('5 SPLC RX 0° / RY 90° CQC + acc. ecc.', () => req('PUT', '/db/SPLC', { Assign: { 1: splc('RX', 0), 2: splc('RY', 90) } }), () => 'ok')

  /* 7. 조합 — 앱에서 만들어 LCOM-GEN (RS 포함) */
  await step('7 LCOM-GEN incl. RS', () => req('PUT', '/db/LCOM-GEN', { Assign: {
    1: { NAME: 'G1 1.3D+1.5L', ACTIVE: 'ACTIVE', iTYPE: 0, DESC: '', vCOMB: [{ ANAL: 'ST', LCNAME: 'DL', FACTOR: 1.3 }, { ANAL: 'ST', LCNAME: 'LL', FACTOR: 1.5 }] },
    2: { NAME: 'E1 1.3GE+1.4RX', ACTIVE: 'ACTIVE', iTYPE: 0, DESC: '', vCOMB: [{ ANAL: 'ST', LCNAME: 'DL', FACTOR: 1.3 }, { ANAL: 'ST', LCNAME: 'LL', FACTOR: 0.65 }, { ANAL: 'RS', LCNAME: 'RX', FACTOR: 1.4 }] },
    3: { NAME: 'E2 1.3GE+1.4RY', ACTIVE: 'ACTIVE', iTYPE: 0, DESC: '', vCOMB: [{ ANAL: 'ST', LCNAME: 'DL', FACTOR: 1.3 }, { ANAL: 'ST', LCNAME: 'LL', FACTOR: 0.65 }, { ANAL: 'RS', LCNAME: 'RY', FACTOR: 1.4 }] },
  } }), () => 'ok')

  /* 8. 설계 코드 GB50017-17 지정 */
  await step('8 DSTL GB50017-17', () => req('PUT', '/db/DSTL', { Assign: { 1: { DGNCODE: 'GB50017-17' } } }), () => 'ok')
  await step('8 DSTL readback', () => req('GET', '/db/DSTL'), (r) => r)

  /* 층 계산(우발편심·레벨) — 해석 전 */
  await step('2 ope/STOR', () => req('POST', '/ope/STOR', { Argument: { SEIS_ECC: { INC_SEIS_ECC: true, SEIS_ECC_VALUE: 5 }, WIND_ECC: { INC_WIND_ECC: true, WIND_ECC_VALUE: 15 } } }), (r) => r)

  await step('save model', async () => cmdOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_gate_${stamp}.mgbx` })))
  const t0 = Date.now()
  const anal = await step('doc/anal', async () => cmdOk(await req('POST', '/doc/anal', {})), (r: any) => ({ message: r.message, sec: (Date.now() - t0) / 1000 }))

  if (anal) {
    const table = (key: string, type: string, lcs?: string[], extra: object = {}) => step(`6 table ${type}${lcs ? ' ' + lcs.join(',') : ''}`,
      () => req('POST', '/post/TABLE', { Argument: { TABLE_NAME: key, TABLE_TYPE: type, UNIT: { FORCE: 'KN', DIST: 'M' }, STYLES: { FORMAT: 'Fixed', PLACE: 5 }, ...(lcs ? { LOAD_CASE_NAMES: lcs } : {}), ...extra } }),
      (r: any) => { const t = r?.[key]; return t ? { head: t.HEAD, rows: t.DATA?.length, sample: t.DATA?.slice(0, 6) } : (r?.message ?? Object.keys(r ?? {})) })
    await table('RE', 'REACTIONG', ['DL(ST)', 'LL(ST)'])
    await table('EV', 'EIGENVALUEMODE')
    await table('DX', 'STORY_DRIFT_X', ['RX(RS)'])
    await table('DY', 'STORY_DRIFT_Y', ['RY(RS)'])
    await table('UX', 'STORY_DISPLACEMENT_X', ['RX(RS)'])
    await table('TX', 'TORSIONAL_IRREGULARITY_X', ['RX(RS)'])
    await table('KX', 'STIFFNESS_IRREGULARITY_X', ['RX(RS)'], { ADDITIONAL: { SET_CALCULATION_METHOD: { STORY_DRIFT_METHOD: 'Drift at the Center of Mass', STORY_STIFFNESS_METHOD: 'Story Shear / Story Drift' } } })
    await table('SX', 'STORY_SHEAR_FORCE_COEFFICIENT', ['RX(RS)'])
    await table('OX', 'OVERTURNING_MOMENT', ['RX(RS)'])
    await table('MS', 'STORY_MASS')
    await table('SW', 'STORYWEIGHT')
    await table('BF', 'BEAMFORCE', ['E1 1.3GE+1.4RX(CB)'], { NODE_ELEMS: { KEYS: [col[0]] } })
    await table('TF', 'TRUSSFORCE', ['RX(RS)'], { NODE_ELEMS: { KEYS: [brace[0]] } })

    /* 5. 고유치 표 원인 분리 — 가새(TRUSS)를 URL 번호로 하나씩 지우고 재해석 (본문 Assign DELETE 는 DB 전체 삭제) */
    const els = (await req('GET', '/db/ELEM')).ELEM as Record<string, any>
    const truss = brace.map((id) => [String(id), els[id]] as const)
    await step('5 DELETE braces by /db/ELEM/{id}', async () => { for (const id of brace) await req('DELETE', `/db/ELEM/${id}`); return Object.keys((await req('GET', '/db/ELEM')).ELEM ?? {}).length }, (n) => ({ remaining: n }))
    await step('save (no brace)', async () => cmdOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_gate_nobrace_${stamp}.mgbx` })))
    await step('doc/anal (no brace)', async () => cmdOk(await req('POST', '/doc/anal', {})))
    await table('EV0', 'EIGENVALUEMODE')
    await step('5 PUT braces back', () => req('PUT', '/db/ELEM', { Assign: Object.fromEntries(truss) }), () => truss.length)
    await step('save model again', async () => cmdOk(await req('POST', '/doc/saveas', { Argument: `C:/temp/sf_gate_${stamp}_final.mgbx` })))
    await step('doc/anal (braced)', async () => cmdOk(await req('POST', '/doc/anal', {})))
  }

  /* 6. 결과표 종류 목록 — 층 관련 이름 찾기 */
  await step('6 ope/UTBLTYPES (story tables)', () => req('POST', '/ope/UTBLTYPES', {}), (r: any) => {
    const s = JSON.stringify(r); const names = [...new Set(s.match(/"[A-Z][A-Z0-9_]*"/g) ?? [])].map((x) => x.slice(1, -1))
    return { total: names.length, story: names.filter((n) => /STOR|DRIFT|IRREG|SHEAR_FORCE|OVERTURN|MASS|WEIGHT|STABIL|STIFF|CAPACITY|STRENGTH/.test(n)) }
  })

  /* 8. 강재 설계 API — GB50017-17 은 API 경로가 없을 것으로 예상(DLL 에는 KDS-41-30-2022 만) */
  await step('8 /DESIGN/STEEL/GB50017-17/CODE-ANAL', () => req('POST', '/DESIGN/STEEL/GB50017-17/CODE-ANAL', { Argument: {} }))
  await step('8 post/STEELCODECHECK', () => req('POST', '/post/STEELCODECHECK', { Argument: {} }), (r) => JSON.stringify(r).slice(0, 300))
} finally {
  mkdirSync('output/gate', { recursive: true })
  writeFileSync(`output/gate/evidence-${stamp}.json`, JSON.stringify({ stamp, model: `C:/temp/sf_gate_${stamp}.mgbx`, backup: `C:/temp/sf_backup_${stamp}.mgbx`, ev }, null, 2))
  console.log(`evidence: output/gate/evidence-${stamp}.json`)
}
