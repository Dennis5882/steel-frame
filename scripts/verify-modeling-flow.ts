/** Seven-stage flow, independent feature controls, read-only summaries and unique editor targets. */
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as any).React=await import('react') // tsx uses classic JSX for this standalone script.
;(globalThis as any).document={documentElement:{lang:'ko',dataset:{}}}
const { MODEL_STEPS, ADDITIONS_STEP, LOADS_STEP, REVIEW_STEP, additionPartForPath, additionPartActive, scopeIssueStep }=await import('../src/components/modelingFlow')
const { ModelWizard }=await import('../src/components/ModelWizard')
const { StructureEditor, StructureSummary }=await import('../src/components/StructureEditor')
const { initializeAdditions }=await import('../src/components/AdditionEditor')
const {craneInputIssues}=await import('../src/domain/craneInput')
const { fieldStep }=await import('../src/components/planFields')
const { defaultSpecFor }=await import('../src/domain/types')
const { defaultLink,defaultRoofOpening,defaultFloorOpening }=await import('../src/domain/phase6')
const { NO_FEATURES,checkScope }=await import('../src/domain/scope')
const { setLang,t }=await import('../src/i18n')
assert.equal(MODEL_STEPS.length,7);assert.equal(REVIEW_STEP,6)
for(const path of ['additions.crane','additions.platform','additions.wallOpening','additions.roofOpening','additions.floorOpening','additions.link','additions.equipment','additions.factors'])assert.equal(fieldStep({path}),ADDITIONS_STEP)
for(const path of ['roofDead','wallDead','wind.V10','china.w0','korea.region'])assert.equal(fieldStep({path}),LOADS_STEP)
assert.equal(scopeIssueStep('multiSpan'),1);assert.equal(scopeIssueStep('additionInput'),ADDITIONS_STEP)
for(const path of ['wallOpening','roofOpening','floorOpening'])assert.equal(additionPartForPath(path),'opening')
for(const lang of ['ko','en','zh-TW','zh-CN'] as const) {
  setLang(lang)
  assert.ok(t('sc_additionInput').includes(t('mw_additions')),'Incomplete inputs point to Additional structures, not site loads')
  assert.ok(t('g_model_note').includes(t('mw_additions')),'Help describes the current seven-stage process')
  for(const code of ['TW','CN','KR'] as const) {
    const spec={...structuredClone(defaultSpecFor(code)),features:{...NO_FEATURES}}
    spec.additions=initializeAdditions(spec)
    assert.equal(checkScope(spec).blocked,false)
    const props={spec,onFeaturesChange:()=>{},onChange:()=>{},disabled:false,idPrefix:'flow-test'}
    const initial=renderToStaticMarkup(createElement(StructureEditor,props))
    assert.equal((initial.match(/class="structure-card /g)??[]).length,5)
    assert.ok(!initial.includes('name="multiSpan"'))
    const missing=initializeAdditions({...spec,features:{...spec.features,crane:true}},spec.additions)
    const crane={...spec,features:{...spec.features,crane:true},additions:missing}
    assert.equal(additionPartActive(crane,'crane'),true)
    assert.equal(additionPartActive(crane,'platform'),false)
    assert.equal(additionPartActive(crane,'link'),false)
    assert.ok(checkScope(crane).blocked,'Unconfirmed enabled structures still block generation')
    const runway=structuredClone(crane)
    runway.bays=10;runway.bayList=undefined
    runway.additions.crane!.runway={section:spec.sections.rafter,deflectionDivisor:600,source:'',confirmed:false}
    const issues=craneInputIssues(runway)
    assert.ok(!issues.some(e=>e.field==='bays'),'Crane setup must not shrink a ten-bay building')
    for(const field of ['maxWheel','confirmed'])assert.ok(issues.some(e=>e.field===field),`Actionable missing field ${field}`)
    for(const field of ['source','runway.source','runway.confirmed'])assert.ok(!issues.some(e=>e.field===field),`${field} is optional / covered by the single crane confirmation`)
    // Undecided maker: allowed, but reported as an assumption (expert review)
    const assumed=structuredClone(runway);assumed.additions.crane!.maxWheel=80;assumed.additions.crane!.confirmed=true
    assert.ok(!craneInputIssues(assumed).length,'Confirmed crane with undecided maker has no blocking input issue')
    assert.ok(checkScope(assumed).issues.some(i=>i.key==='craneAssumed'&&i.level==='warn'),'Undecided maker raises an assumption warning')
    assumed.additions.crane!.manufacturer='Test Crane Co.'
    assert.ok(!checkScope(assumed).issues.some(i=>i.key==='craneAssumed'),'A named maker clears the assumption warning')
    assert.ok(!craneInputIssues(runway,false).some(e=>e.kind==='source'||e.kind==='confirm'),'Geometry preview does not require source confirmation')
    const invalidRunway=renderToStaticMarkup(createElement(StructureEditor,{...props,spec:runway,attempted:true}))
    assert.ok(invalidRunway.includes(t('crane_travel_summary',1,10,String(10*runway.baySpacing))))
    assert.ok(!invalidRunway.includes(t('add_invalid_crane')),'Specific crane errors replace the ambiguous generic warning')
    const withLink={...spec,additions:{...spec.additions,link:defaultLink(spec)}}
    assert.equal(additionPartActive(withLink,'link'),true)
    assert.equal(withLink.frame,spec.frame,'Building interfaces never change frame topology')
    const multi={...spec,frame:'multi' as const,spanList:[12,12],features:{...spec.features,multiSpan:true}}
    assert.equal(additionPartActive(multi,'link'),false)
    const active={...spec,features:{...spec.features,mezzanine:true,crane:true,opening:true}}
    active.additions=initializeAdditions(active)
    active.additions={...active.additions,link:defaultLink(active),roofOpening:defaultRoofOpening(active),floorOpening:defaultFloorOpening(active)}
    const before=JSON.stringify(active)
    const html=renderToStaticMarkup(createElement(StructureEditor,{...props,spec:active,attempted:true}))
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map((m)=>m[1])
    assert.equal(new Set(ids).size,ids.length,`${lang}/${code}: unique field IDs across cards`)
    const summary=renderToStaticMarkup(createElement(StructureSummary,{spec:active}))
    assert.ok(!summary.includes('<input')&&!summary.includes('<select'),'Review never duplicates editable forms')
    assert.equal(JSON.stringify(active),before,'Rendering must not change the draft or confirmations')
    const review=renderToStaticMarkup(createElement(ModelWizard,{spec,step:REVIEW_STEP,visited:REVIEW_STEP,disabled:false,blocked:false,invalid:false,attempted:false,onStep:()=>{},onBuild:()=>{},onCancel:()=>{}}))
    assert.ok(review.includes('aria-valuemax="7"')&&review.includes('aria-valuenow="7"'))
    assert.ok(review.includes(t('mw_build')))
  }
}
/* 단면도: 입력 중인 불완전한 이름은 그리지 않고, 치수 계산 냉간성형은 Zx(탄성값)를 표시하지 않는다 */
{
  const { SectionSketch } = await import('../src/components/SectionSketch')
  for (const partial of ['RH 400x200', 'P 114.3', 'H 600x', 'CC 150x65'])
    assert.equal(renderToStaticMarkup(createElement(SectionSketch, { name: partial, code: 'TW', material: 'SN400B' })), '', `partial ${partial} renders nothing`)
  const h = renderToStaticMarkup(createElement(SectionSketch, { name: 'RH 400x200x8x13', code: 'TW', material: 'SN400B' }))
  assert.ok(h.includes('<svg') && h.includes('Zx') && !h.includes('NaN'), 'full H section renders outline and plastic Zx')
  const cc = renderToStaticMarkup(createElement(SectionSketch, { name: 'CC 150x65x20/3.2', code: 'CN', material: 'Q235B' }))
  assert.ok(cc && !cc.includes('NaN'), 'lipped C renders without NaN')
  const lc = renderToStaticMarkup(createElement(SectionSketch, { name: 'LC-150x65x20x2.3', code: 'TW', material: 'SN400B' }))
  assert.ok(lc && lc.includes('Sx') && !lc.includes('>Zx<'), 'dimension-only cold-formed shows Sx, not a plastic-looking Zx')
}
/* 접힌 고급 설정 제목은 그룹과 일치 — KR 풍하중(Kzt·KD·ζ)에 '지진 계수 상세'가 붙지 않게 */
{
  const { advancedTitleKey } = await import('../src/components/planFields')
  assert.equal(advancedTitleKey('sec_wind', LOADS_STEP), 'mw_wind_coefficients')
  assert.equal(advancedTitleKey('sec_seismic', LOADS_STEP), 'mw_coefficients')
  assert.equal(advancedTitleKey('sec_kr_snow', LOADS_STEP), 'mw_snow_coefficients')
  assert.equal(advancedTitleKey('sec_conn', LOADS_STEP), 'sec_conn')
  const { SECTIONS_STEP, BAYS_STEP } = await import('../src/components/modelingFlow')
  assert.equal(advancedTitleKey('sec_sections', SECTIONS_STEP), 'mw_secondary')
  assert.equal(advancedTitleKey('sec_geometry', BAYS_STEP), 'mw_secondary')
  assert.equal(advancedTitleKey('sec_cn_snow', LOADS_STEP), 'mw_snow_coefficients')
  assert.equal(advancedTitleKey('sec_dead', LOADS_STEP), 'mw_more_settings')
}
console.log('Modeling flow: 7 stages, 4 languages × 3 codes, distinct frame/interfaces, optional parts, error routes, unique targets and read-only summaries passed.')
