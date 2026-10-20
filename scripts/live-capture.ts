/* Gen NX 화면 캡처 탐색 (상세 계산서 준비) — 지금 Gen 에 열린 '해석된' 골조 모델로 시점·활성·표시·결과 그래픽 캡처를 시험한다.
   Run: npx tsx scripts/live-capture.ts < /dev/null   (키: stdin → MAPI_KEY → .env). 모델은 바꾸지 않는다(화면 조작만).
   결과: C:/temp/sf_cap_<시각>_*.png + output/frame/capture-<시각>.json (호출별 응답 요약 — 이미지 데이터가 응답에 오는지 포함) */
import { mkdirSync, writeFileSync } from 'node:fs'
import { MidasClient } from 'midas-nx'
import { readMapiKey } from './mapi-key'

const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 5 * 60 * 1000 })
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
const out: Record<string, unknown>[] = []
const summarize = (r: unknown) => {
  const s = JSON.stringify(r) ?? 'undefined'
  return s.length > 300 ? `${s.slice(0, 300)}… (${s.length} chars)` : s
}
async function call(name: string, path: string, body: object) {
  try {
    const r = await client.request('POST', path, body as any)
    out.push({ name, path, ok: true, resp: summarize(r) }); console.log(`OK   ${name}: ${summarize(r)}`)
    return r
  } catch (e: any) {
    const msg = e?.responseBody ? JSON.stringify(e.responseBody) : String(e?.message ?? e)
    out.push({ name, path, ok: false, resp: msg.slice(0, 300) }); console.log(`FAIL ${name}: ${msg.slice(0, 300)}`)
    return null
  }
}
const P = (tag: string) => `C:/temp/sf_cap_${stamp}_${tag}.png`
const W = { WIDTH: 1200, HEIGHT: 900, ZOOM_LEVEL: 100 }

/* 1) 모델 — ISO·평면·정면·측면, 단면 형상(은선) */
await call('iso', '/view/CAPTURE', { Argument: { EXPORT_PATH: P('iso'), SET_MODE: 'pre', ANGLE: { HORIZONTAL: 30, VERTICAL: 15 }, ACTIVE: { ACTIVE_MODE: 'All' }, ...W } })
await call('iso-solid', '/view/CAPTURE', { Argument: { EXPORT_PATH: P('iso_solid'), SET_MODE: 'pre', SET_HIDDEN: true, ANGLE: { HORIZONTAL: 30, VERTICAL: 15 }, ...W } })
await call('top', '/view/CAPTURE', { Argument: { EXPORT_PATH: P('top'), SET_MODE: 'pre', SET_HIDDEN: false, ANGLE: { HORIZONTAL: 0, VERTICAL: 90 }, ...W } })
await call('front', '/view/CAPTURE', { Argument: { EXPORT_PATH: P('front'), SET_MODE: 'pre', ANGLE: { HORIZONTAL: 0, VERTICAL: 0 }, ...W } })
await call('side', '/view/CAPTURE', { Argument: { EXPORT_PATH: P('side'), SET_MODE: 'pre', ANGLE: { HORIZONTAL: 90, VERTICAL: 0 }, ...W } })
await call('story-2F', '/view/CAPTURE', { Argument: { EXPORT_PATH: P('story_2F'), SET_MODE: 'pre', ANGLE: { HORIZONTAL: 0, VERTICAL: 90 }, ACTIVE: { ACTIVE_MODE: 'Identity', IDENTITY_TYPE: 'STORY', IDENTITY_LIST: ['2F'], STORY_ACTIVE: 'FLOOR' }, ...W } })
await call('display-sections', '/view/CAPTURE', { Argument: { EXPORT_PATH: P('sections'), SET_MODE: 'pre', ACTIVE: { ACTIVE_MODE: 'All' }, ANGLE: { HORIZONTAL: 30, VERTICAL: 15 },
  DISPLAY: { PROPERTY: { PROPERTY_NAME: true } }, ...W } })

/* 2) 결과 그래픽 — 모드 이름 후보 */
const lc = (name: string, type = 'ST') => ({ TYPE: type, NAME: name })
const tries: [string, object][] = [
  ['reaction', { CURRENT_MODE: 'reactionforces/moments', LOAD_CASE_COMB: lc('DL'), COMPONENTS: { COMP: 'FZ' }, TYPE_OF_DISPLAY: { VALUES: { OPT_CHECK: true, DECIMAL_PT: 1 } } }],
  ['beamdiagram-My', { CURRENT_MODE: 'beamdiagrams', LOAD_CASE_COMB: lc('DL'), COMPONENTS: { COMP: 'My' }, TYPE_OF_DISPLAY: { CONTOUR: { OPT_CHECK: true }, VALUES: { OPT_CHECK: true, DECIMAL_PT: 1 } } }],
  ['beamdiagram-Fx', { CURRENT_MODE: 'beamdiagrams', LOAD_CASE_COMB: lc('DL'), COMPONENTS: { COMP: 'Fx' }, TYPE_OF_DISPLAY: { CONTOUR: { OPT_CHECK: true } } }],
  ['disp-contour-a', { CURRENT_MODE: 'displacementcontour', LOAD_CASE_COMB: lc('DL'), COMPONENTS: { COMP: 'DXYZ' }, TYPE_OF_DISPLAY: { CONTOUR: { OPT_CHECK: true } } }],
  ['disp-contour-b', { CURRENT_MODE: 'Displacement Contour', LOAD_CASE_COMB: lc('DL'), COMPONENTS: { COMP: 'DXYZ' }, TYPE_OF_DISPLAY: { CONTOUR: { OPT_CHECK: true } } }],
  ['deformed', { CURRENT_MODE: 'deformedshape', LOAD_CASE_COMB: lc('DL'), COMPONENTS: { COMP: 'DXYZ' } }],
  ['beamstress', { CURRENT_MODE: 'beamstresses', LOAD_CASE_COMB: lc('DL'), COMPONENTS: { COMP: 'Combined' }, TYPE_OF_DISPLAY: { CONTOUR: { OPT_CHECK: true } } }],
  ['mode1-a', { CURRENT_MODE: 'vibrationmodeshapes', LOAD_CASE_COMB: { TYPE: 'EIGEN', NAME: 'Mode1' }, COMPONENTS: { COMP: 'Md-XYZ' } }],
  ['mode1-b', { CURRENT_MODE: 'VibrationModeShapes', MODE_SHAPE: { MODE: 1 } }],
  ['combo-My', { CURRENT_MODE: 'beamdiagrams', LOAD_CASE_COMB: lc('sLCB14', 'CB'), COMPONENTS: { COMP: 'My' }, TYPE_OF_DISPLAY: { CONTOUR: { OPT_CHECK: true } } }],
]
for (const [name, rg] of tries) {
  const r = await call(`rg ${name}`, '/view/RESULTGRAPHIC', { Argument: rg })
  if (r) await call(`cap ${name}`, '/view/CAPTURE', { Argument: { EXPORT_PATH: P(name), SET_MODE: 'post', ANGLE: { HORIZONTAL: 30, VERTICAL: 15 }, ...W, RESULT_GRAPHIC: rg } })
}
/* 끝: ISO 전체 보기 + 전처리 모드로 되돌림 */
await call('restore', '/view/CAPTURE', { Argument: { EXPORT_PATH: P('end'), SET_MODE: 'pre', ACTIVE: { ACTIVE_MODE: 'All' }, ANGLE: { HORIZONTAL: 30, VERTICAL: 15 }, WIDTH: 400, HEIGHT: 300, ZOOM_LEVEL: 100 } })
mkdirSync('output/frame', { recursive: true })
writeFileSync(`output/frame/capture-${stamp}.json`, JSON.stringify(out, null, 2))
console.log(`capture log: output/frame/capture-${stamp}.json, images C:/temp/sf_cap_${stamp}_*.png`)
