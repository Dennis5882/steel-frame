/* 공장 스펙 입력 칸 정의·검증 (순수, JSX 없음) — PlanCard(기본 모델링 위저드·자유골조 편집) 공통.
   잘못된 칸이 하나라도 있으면 두 모드 모두 생성 불가 — 기존 값으로 조용히 대체해 전송하지 않는다. */
import { profileOf } from '../codes'
import type { FigureKey } from './FigureRef'
import { counties, townsOf } from '../codes/twSites'
import { CPI_KEYS, SITES_KR, REGIONS_KR } from '../codes/krLateral'
import { sectionProps } from '../domain/sections'
import { portalGeometry } from '../domain/portal'
import { LIMITS } from '../domain/scope'
import { baySpans, FRAME_TYPES, frameSpans, normalizeBays, normalizeSpans, type FactorySpec, type FrameType } from '../domain/types'
import { t, type I18nKey } from '../i18n'
import { ADDITIONS_STEP, BAYS_STEP, LOADS_STEP, SECTIONS_STEP } from './modelingFlow'

/** 스펙 경로 ('span', 'sections.column', 'seismic.SDS' …) */
export type Path = string
export interface Field {
  path: Path
  label: I18nKey
  unit?: string
  /** list = 숫자 목록 '6, 6, 7.5' (자유골조 베이별 간격) */
  kind: 'num' | 'int' | 'text' | 'select' | 'list'
  /** select 값을 숫자로 저장 */
  numeric?: boolean
  /** 허용 최솟값 (기본: 0 초과) */
  min?: number
  options?: (spec: FactorySpec) => { value: string; label: string }[]
  /** 스펙에 값이 없을 때 입력 칸 초기값 (선택 항목 추가 전 저장된 스펙 호환) */
  fallback?: string
  full?: boolean
  /** 입력 칸 옆 원문 그림(지도) + 칸 아래 원문 주 — FigureRef */
  figure?: FigureKey
}
export interface Group { title: I18nKey; fields: Field[] }

/** 접힌 고급 설정 제목 — 그룹 내용과 맞춘다 (KR 풍하중 고급 칸에 '지진 계수 상세'가 붙던 문제) */
export function advancedTitleKey(groupTitle: Group['title'], step: number): I18nKey {
  if (groupTitle === 'sec_conn') return 'sec_conn'
  if (step === BAYS_STEP || step === SECTIONS_STEP) return 'mw_secondary'
  if (groupTitle === 'sec_wind') return 'mw_wind_coefficients'
  if (groupTitle === 'sec_seismic') return 'mw_coefficients'
  if (groupTitle === 'sec_cn_snow' || groupTitle === 'sec_kr_snow') return 'mw_snow_coefficients'
  return 'mw_more_settings'
}

/** Wheel/arrow increments follow the quantity's unit, never the UI language or design code. */
export function numericStep(f: Field): number {
  if (f.kind === 'int' || f.unit === 'MPa' || f.unit === 'm/s') return 1
  if (f.path === 'china.damping' || f.path === 'korea.roofZeta') return 0.001
  if (f.unit === 'm') return 0.1
  return 0.01
}

export const GROUPS: Group[] = [
  { title: 'sec_geometry', fields: [
    { path: 'frame', label: 'f_frame', kind: 'select', options: () => FRAME_TYPES.map((v) => ({ value: v, label: t(`frame_${v}`) })) },
    { path: 'span', label: 'f_span', unit: 'm', kind: 'num' },
    { path: 'eaveHeight', label: 'f_eave', unit: 'm', kind: 'num' },
    { path: 'bays', label: 'f_bays', kind: 'int' },
    { path: 'baySpacing', label: 'f_baySpacing', unit: 'm', kind: 'num' },
    { path: 'roofSlope', label: 'f_slope', unit: 'rise/run', kind: 'num' },
    { path: 'baseFixity', label: 'f_base', kind: 'select', options: () => [
      { value: 'pinned', label: t('base_pinned') }, { value: 'fixed', label: t('base_fixed') }] },
    { path: 'purlinSpacing', label: 'f_purlinSp', unit: 'm', kind: 'num' },
    { path: 'girtSpacing', label: 'f_girtSp', unit: 'm', kind: 'num' },
    { path: 'postSpacing', label: 'f_postSp', unit: 'm', kind: 'num' },
    { path: 'sagRods', label: 'f_sagRods', kind: 'int', min: 0 },
    ...(['flyBraces', 'sagRods', 'braceCrossing'] as const).map((key): Field => ({ path: `restraints.${key}`, label: `restraint_${key}`, kind: 'select', fallback: 'assumed', options: () => ['assumed', 'confirmed', 'none'].map((v) => ({ value: v, label: t(`restraint_${v}` as I18nKey) })) })),
  ] },
  { title: 'sec_sections', fields: [
    { path: 'material', label: 'f_material', kind: 'select', options: (sp) =>
      Object.keys(profileOf(sp.code).materials).map((m) => ({ value: m, label: m })) },
    { path: 'sections.column', label: 'f_column', kind: 'text' },
    { path: 'sections.rafter', label: 'f_rafter', kind: 'text' },
    { path: 'sections.purlin', label: 'f_purlin', kind: 'text' },
    { path: 'sections.girt', label: 'f_girt', kind: 'text' },
    { path: 'sections.strut', label: 'f_strut', kind: 'text' },
    { path: 'sections.post', label: 'f_post', kind: 'text' },
    { path: 'sections.brace', label: 'f_brace', kind: 'text' },
  ] },
  { title: 'sec_dead', fields: [
    { path: 'roofDead', label: 'f_roofDead', unit: 'kN/m²', kind: 'num' },
    { path: 'wallDead', label: 'f_wallDead', unit: 'kN/m²', kind: 'num' },
  ] },
  { title: 'sec_conn', fields: [
    { path: 'fc', label: 'f_fc', unit: 'MPa', kind: 'num' },
    { path: 'anchorFu', label: 'f_anchorFu', unit: 'MPa', kind: 'num' },
  ] },
  { title: 'sec_seismic', fields: [
    { path: 'seismic.county', label: 'f_county', kind: 'select', options: () => counties().map((c) => ({ value: c, label: c })) },
    { path: 'seismic.town', label: 'f_town', kind: 'select', options: (sp) => townsOf(sp.seismic.county).map((c) => ({ value: c, label: c })) },
    { path: 'seismic.soil', label: 'f_soil', kind: 'select', numeric: true, options: () => ([1, 2, 3] as const).map((v) => ({ value: String(v), label: t(`soil_${v}`) })) },
    { path: 'seismic.SDS', label: 'f_SDS', unit: 'g', kind: 'num' },
    { path: 'seismic.SD1', label: 'f_SD1', unit: 'g', kind: 'num' },
    { path: 'seismic.SMS', label: 'f_SMS', unit: 'g', kind: 'num' },
    { path: 'seismic.SM1', label: 'f_SM1', unit: 'g', kind: 'num' },
    { path: 'seismic.I', label: 'f_I', kind: 'num' },
    { path: 'seismic.Rx', label: 'f_Rx', kind: 'num' },
    { path: 'seismic.Ry', label: 'f_Ry', kind: 'num' },
  ] },
  { title: 'sec_wind', fields: [
    { path: 'wind.V10', label: 'f_V10', unit: 'm/s', kind: 'num' },
    { path: 'wind.I', label: 'f_Iw', kind: 'num' },
    { path: 'wind.exposure', label: 'f_exposure', kind: 'select', options: () => ['A', 'B', 'C'].map((v) => ({ value: v, label: v })) },
    { path: 'wind.enclosure', label: 'f_enclosure', kind: 'select', options: () => [
      { value: 'enclosed', label: t('encl_enclosed') }, { value: 'partial', label: t('encl_partial') }] },
  ] },
]
export const CN_GROUPS: Group[] = [
  { title: 'sec_wind', fields: [
    { path: 'china.w0', label: 'f_cn_w0', unit: 'kN/m²', kind: 'num', min: .3 },
    { path: 'china.terrain', label: 'f_exposure', kind: 'select', options: () => ['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: v })) },
    { path: 'china.topography', label: 'f_cn_topo', kind: 'num', min: .75 },
  ] },
  { title: 'sec_seismic', fields: [
    { path: 'china.alphaMax', label: 'f_cn_alpha', kind: 'select', numeric: true, options: () => [.04, .08, .12, .16, .24, .32].map((n) => ({ value: String(n), label: String(n) })) },
    { path: 'china.Tg', label: 'f_cn_Tg', unit: 's', kind: 'num', min: .1 },
    { path: 'china.Tx', label: 'f_cn_Tx', unit: 's', kind: 'num' },
    { path: 'china.Ty', label: 'f_cn_Ty', unit: 's', kind: 'num' },
    { path: 'china.damping', label: 'f_cn_damping', kind: 'num', min: .045 },
  ] },
  { title: 'sec_cn_snow', fields: [
    { path: 'china.snow', label: 'f_cn_snow', unit: 'kN/m²', kind: 'num', min: 0 },
    { path: 'china.snowMu', label: 'f_cn_snowMu', kind: 'num', min: .9 },
    { path: 'china.gamma0', label: 'f_cn_gamma0', kind: 'num', min: 1 },
  ] },
  { title: 'sec_conn', fields: [
    { path: 'china.concreteBearing', label: 'f_cn_concrete', unit: 'MPa', kind: 'num' },
    { path: 'china.anchorFt', label: 'f_cn_anchor', unit: 'MPa', kind: 'select', numeric: true, options: () => [140, 180].map((n) => ({ value: String(n), label: `${n}` })) },
  ] },
]
/* 한국 KDS — 풍(41 12 00 5장)·지진(41 17 00, 표 6.2-1 계통)·적설(41 12 00 4장)·접합(14 31 25 — 콘크리트 fck·앵커 Fu) */
export const KR_GROUPS: Group[] = [
  { title: 'sec_wind', fields: [
    { path: 'korea.V0', label: 'f_kr_V0', unit: 'm/s', kind: 'num', min: 20, full: true, figure: 'krWind' },
    { path: 'korea.exposure', label: 'f_exposure', kind: 'select', options: () => ['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: v })) },
    { path: 'korea.cpi', label: 'f_kr_cpi', kind: 'select', options: () => CPI_KEYS.map((v) => ({ value: v, label: t(`cpi_${v}`) })) },
    { path: 'korea.Kzt', label: 'f_kr_Kzt', kind: 'num', min: 1 },
    { path: 'korea.KD', label: 'f_kr_KD', kind: 'num', min: 0.85 },
    { path: 'korea.roofZeta', label: 'f_kr_zeta', kind: 'num' },
  ] },
  { title: 'sec_seismic', fields: [
    { path: 'korea.importance', label: 'f_kr_imp', kind: 'select', options: () => (['S', '1', '2', '3'] as const).map((v) => ({ value: v, label: t(`imp_${v}`) })) },
    { path: 'korea.region', label: 'f_kr_region', kind: 'select', fallback: 'manual', options: () => [{ value: 'manual', label: t('region_manual') }, ...REGIONS_KR.map((r) => ({ value: r.key, label: `${r.key} (${t(r.zone === '1' ? 'zone_1' : 'zone_2')})` }))] },
    { path: 'korea.zone', label: 'f_kr_zone', kind: 'select', options: () => [{ value: '1', label: t('zone_1') }, { value: '2', label: t('zone_2') }] },
    { path: 'korea.S', label: 'f_kr_S', unit: 'g', kind: 'num' },
    { path: 'korea.site', label: 'f_kr_site', kind: 'select', options: () => SITES_KR.map((v) => ({ value: v, label: t(`site_${v}`) })) },
    { path: 'korea.systemX', label: 'f_kr_sysX', kind: 'select', fallback: 'general', options: () => (['general', 'OMF'] as const).map((v) => ({ value: v, label: t(`sys_kr_${v}`) })) },
    { path: 'korea.systemY', label: 'f_kr_sysY', kind: 'select', fallback: 'general', options: () => (['general', 'OCBF'] as const).map((v) => ({ value: v, label: t(`sys_kr_${v}`) })) },
  ] },
  { title: 'sec_kr_snow', fields: [
    { path: 'korea.Sg', label: 'f_kr_Sg', unit: 'kN/m²', kind: 'num', min: 0.5, full: true, figure: 'krSnow' },
    { path: 'korea.Ce', label: 'f_kr_Ce', kind: 'select', numeric: true, options: () => [0.8, 0.9, 1.0, 1.1, 1.2].map((n) => ({ value: String(n), label: t('ce_opt', n) })) },
    { path: 'korea.Ct', label: 'f_kr_Ct', kind: 'select', numeric: true, options: () => [{ value: '1', label: t('ct_heated') }, { value: '1.2', label: t('ct_unheated') }] },
  ] },
  { title: 'sec_conn', fields: [
    { path: 'fc', label: 'f_fc', unit: 'MPa', kind: 'num' },
    { path: 'anchorFu', label: 'f_anchorFu', unit: 'MPa', kind: 'num' },
  ] },
]
const BAY_LIST: Field = { path: 'bayList', label: 'f_bayList', unit: 'm', kind: 'list', full: true }
/** 다경간: 스팬 한 칸 대신 경간별 폭 목록 (합계 = 전체 폭) */
const SPAN_LIST: Field = { path: 'spanList', label: 'f_spanList', unit: 'm', kind: 'list', full: true }
const multiGeometry = (g: Group): Group => g.title !== 'sec_geometry' ? g
  : { ...g, fields: g.fields.flatMap((f) => (f.path === 'span' ? [SPAN_LIST] : [f])) }
/** 개별 간격: 베이 수·공통 간격 대신 베이별 목록 (자유골조와 위저드 공통). */
const individualGeometry = (g: Group): Group => g.title !== 'sec_geometry' ? g
  : { ...g, fields: [BAY_LIST, ...g.fields.filter((f) => f.path !== 'bays' && f.path !== 'baySpacing')] }
export const groupsFor = (code: FactorySpec['code'], free = false, frame?: FrameType, individual = free) =>
  (code === 'CN' ? [...GROUPS.filter((g) => !['sec_wind', 'sec_seismic', 'sec_conn'].includes(g.title)), ...CN_GROUPS]
    : code === 'KR' ? [...GROUPS.filter((g) => !['sec_wind', 'sec_seismic', 'sec_conn'].includes(g.title)), ...KR_GROUPS] : GROUPS)
    .map((g) => individual ? individualGeometry(g) : g)
    .map((g) => frame === 'multi' ? multiGeometry(g) : g)
    .map((g) => code === 'CN' ? { ...g, fields: g.fields.filter((f) => f.path !== 'restraints.braceCrossing') } : g)
export const FIELDS = [...GROUPS, ...CN_GROUPS, ...KR_GROUPS].flatMap((g) => g.fields)
export const parseList = (raw: string) => raw.split(/[,，、\s]+/).filter(Boolean).map(Number)

export const getPath = (o: any, p: Path): unknown => p.split('.').reduce((a, k) => a?.[k], o)
export function setPath<T>(o: T, p: Path, v: unknown): T {
  const [k, ...rest] = p.split('.')
  return { ...(o as any), [k]: rest.length ? setPath((o as any)[k], rest.join('.'), v) : v }
}

/** 입력 문자열 → 스펙. 잘못된 칸은 기존 값을 유지하지만 — 그 상태로는 생성되지 않는다(invalidFields 가 실행을 막음).
   여기서의 대체는 미리보기·요약이 깨지지 않게 하는 용도뿐이다. */
export function toSpec(base: FactorySpec, vals: Record<Path, string>, free: boolean, individual = free): FactorySpec {
  let sp = individual ? base : { ...base, bayList: undefined }
  const frame = (vals.frame || base.frame) as FrameType | undefined
  for (const f of groupsFor(base.code, free, frame, individual).flatMap((g) => g.fields)) {
    const raw = vals[f.path]
    if (f.path.startsWith('restraints.') && raw === 'assumed' && getPath(base, f.path) === undefined) continue
    if (f.kind === 'list') {
      const l = parseList(raw)
      if (!listError(raw, f.path === 'bayList' && individual && !free)) sp = setPath(sp, f.path, l)
    } else if (f.kind === 'num' || f.kind === 'int') {
      const n = f.kind === 'int' ? Math.round(+raw) : +raw
      if (Number.isFinite(n) && (f.min !== undefined ? n >= f.min : n > 0)) sp = setPath(sp, f.path, n)
    } else if (raw.trim()) sp = setPath(sp, f.path, f.numeric ? +raw : raw.trim())
  }
  return normalizeSpans(normalizeBays(sp))
}

export const initVals = (sp: FactorySpec): Record<Path, string> => ({
  ...Object.fromEntries(FIELDS.map((f) => [f.path, String(getPath(sp, f.path) ?? f.fallback ?? '')])),
  bayList: baySpans(sp).join(', '),
  frame: sp.frame ?? 'gable',
  /* 다경간으로 바꾸면 처음엔 지금 스팬 두 개 */
  spanList: (sp.spanList ?? [sp.span, sp.span]).join(', '),
})

/** 베이 목록 '6, 6, 7.5' — 비었거나, 숫자가 아니거나, 0 이하인 항목이 있으면 오류 */
export const listError = (raw: string, cells = false) => {
  const l = cells ? raw.split(/[,，、]/).map(Number) : parseList(raw)
  return /(^|[,，、])\s*([,，、]|$)/.test(raw) || !l.length || l.some((v) => !Number.isFinite(v) || v <= 0)
}

export function invalidField(f: Field, raw: string, spec: FactorySpec, individualCells = false): boolean {
  if (!raw?.trim()) return true
  if (f.kind === 'list') return listError(raw, f.path === 'bayList' && individualCells)
  if (f.kind === 'select') return !f.options!(spec).some((o) => o.value === raw)
  if (f.kind === 'num' || f.kind === 'int') {
    const n = Number(raw)
    return !Number.isFinite(n) || (f.min === undefined ? n <= 0 : n < f.min) || (f.kind === 'int' && !Number.isInteger(n))
  }
  if (f.path.startsWith('sections.')) {
    try {
      const p = sectionProps(raw, spec.code)
      return ![p.A, p.Ix, p.Iy, p.d, p.bf, p.tw, p.tf, p.h].every((v) => Number.isFinite(v) && v > 0)
    } catch { return true }
  }
  return false
}

export const fieldStep = (f: Pick<Field,'path'>) => f.path.startsWith('additions.') ? ADDITIONS_STEP : f.path.startsWith('restraints.') ? 2 : ['frame', 'span', 'spanList', 'eaveHeight', 'roofSlope', 'baseFixity'].includes(f.path) ? 1
  : ['bayList', 'bays', 'baySpacing', 'purlinSpacing', 'girtSpacing', 'postSpacing', 'sagRods'].includes(f.path) ? 2
  : f.path.startsWith('sections.') || f.path === 'material' || ['fc', 'anchorFu', 'china.concreteBearing', 'china.anchorFt'].includes(f.path) ? 3 : LOADS_STEP

/** 잘못된 입력 칸 — 기본 모델링·자유골조 공통 (자유골조는 베이 수·간격 대신 베이 목록) */
export const invalidFields = (spec: FactorySpec, vals: Record<Path, string>, free: boolean, individual = free): Field[] =>
  groupsFor(spec.code, free, spec.frame, individual).flatMap((g) => g.fields).filter((f) => invalidField(f, vals[f.path], spec, individual && !free))

/** 칸 사이 충돌 — 각 칸은 올바르지만 함께 두면 모델이 성립하지 않는 경우. 위저드가 그 칸의 단계에서 바로 막는다.
   ① 치수 한계(적용범위 block 과 같은 값) ② 간격이 커서 처마~마루·기초~처마·박공 사이에 부재가 하나도 안 들어감
   (portalGeometry 의 개수 = round(길이 / 간격) — 내부 부재가 생기려면 길이 / 간격 ≥ 1.5).
   관련 칸 중 하나라도 잘못이면 그 칸 오류가 먼저 — 여기서는 판단하지 않는다. */
export interface Conflict { field: Field; text: string }
const MIN_DIV = 1.5
export function fieldConflicts(spec: FactorySpec, vals: Record<Path, string>, free: boolean, individual = free): Conflict[] {
  const fields = groupsFor(spec.code, free, spec.frame, individual).flatMap((g) => g.fields)
  const bad = new Set(fields.filter((f) => invalidField(f, vals[f.path], spec, individual && !free)).map((f) => f.path))
  const ok = (...p: Path[]) => p.every((x) => !bad.has(x))
  const out: Conflict[] = []
  const add = (path: Path, text: string) => { const field = fields.find((f) => f.path === path); if (field) out.push({ field, text }) }
  const floor2 = (x: number) => Math.floor(x * 100) / 100
  if (ok('span') && spec.span > LIMITS.span) add('span', t('sc_span', spec.span))
  /* 다경간: 스팬 한계는 경간마다 */
  const widths = frameSpans(spec), wMax = Math.max(...widths), wMin = Math.min(...widths)
  if (spec.frame === 'multi' && ok('spanList') && wMax > LIMITS.span) add('spanList', t('sc_span', wMax))
  if (ok('eaveHeight') && spec.eaveHeight > LIMITS.eave) add('eaveHeight', t('sc_eave', spec.eaveHeight))
  if (ok('roofSlope') && spec.roofSlope > LIMITS.slope) add('roofSlope', t('sc_slope', spec.roofSlope))
  if (out.length) return out
  const G = portalGeometry(spec)
  /* 편경사 높은 쪽 처마 = 처마 + 스팬 × 경사 */
  if (spec.frame === 'mono' && ok('span', 'eaveHeight', 'roofSlope') && G.ridgeZ > LIMITS.eave) { add('roofSlope', t('sc_eaveHigh', +G.ridgeZ.toFixed(2))); return out }
  const r2 = (x: number) => +x.toFixed(2)
  /* 다경간은 가장 좁은 경간의 지붕면 길이 기준 */
  const slopeLen = spec.frame === 'multi' ? Math.hypot(wMin / 2, (wMin / 2) * spec.roofSlope) : G.slopeLen
  if (ok('span', 'spanList', 'roofSlope', 'purlinSpacing') && slopeLen / spec.purlinSpacing < MIN_DIV)
    add('purlinSpacing', t('mw_cf_purlin', r2(slopeLen), floor2(slopeLen / MIN_DIV)))
  if (ok('eaveHeight', 'girtSpacing') && spec.eaveHeight / spec.girtSpacing < MIN_DIV)
    add('girtSpacing', t('mw_cf_girt', spec.eaveHeight, floor2(spec.eaveHeight / MIN_DIV)))
  const wPost = spec.frame === 'multi' ? wMin : spec.span
  if (ok('span', 'spanList', 'postSpacing') && wPost / Math.max(spec.postSpacing, 1) < MIN_DIV)
    add('postSpacing', t('mw_cf_post', wPost, floor2(wPost / MIN_DIV)))
  return out
}
