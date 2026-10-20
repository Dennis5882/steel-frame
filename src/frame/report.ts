/* 다층 강골조 계산서 — 현재 상태(스펙·모델·해석·층 검토·부재 검토·최적화)로 인쇄용 단일 HTML 을 만든다.
   같은 HTML 을 report/pdf.ts(PDF)·report/docx.ts(Word)가 변환한다 — 그 변환기가 읽는 태그만 쓴다
   (h1~h3, p, ul, table, figure>svg+figcaption, section.dwg). 화면 언어(t)를 따르고 기호·조항 번호는 원문 표기. */
import { RATIO_BANDS, isoSvg, ratioColor, ROLE_COLOR } from '../drawing/iso'
import { getLang, htmlLang, t, type I18nKey } from '../i18n'
import { APP_VERSION } from '../version'
import type { ComboCheck, CheckItem } from '../codes/cnFrameSteel'
import { hSection, memberFails, type FrameDesign, type MemberDesign } from './design'
import { buildFrameDrawingSvgs, FRAME_MARK, frameSchedule, gridX, gridY } from './drawings'
import { ALPHA_MAX, LAMBDA_MIN, SFI, gravityTotals, tgOf } from './loads'
import { braceBays, spansOf } from './plan'
import { equilibriumError, type FrameAnalysis } from './run'
import { overturning, type StoryItem, type StoryStatus } from './story'
import type { FramePayloads } from './gen'
import type { FrameOptSummary } from './optimize'
import type { FrameModel, FrameRole, FrameSpec } from './types'

export interface FrameReportInput {
  built: { spec: FrameSpec; model: FrameModel; P: FramePayloads; file?: string }
  analysis: FrameAnalysis | null
  review: StoryItem[] | null
  design: FrameDesign | null
  opt?: FrameOptSummary | null
  /** 날짜 문자열 (테스트 고정용) */
  date?: string
}

const ROLES: FrameRole[] = ['column', 'beam', 'brace']
const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
const f = (x: number | null | undefined, d = 2) => (x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : '—')
const row = (cells: unknown[], th = false) => `<tr>${cells.map((c) => (th ? `<th>${esc(c)}</th>` : `<td>${c}</td>`)).join('')}</tr>`
const table = (head: unknown[], rows: unknown[][], cls = '') => `<table${cls ? ` class="${cls}"` : ''}>${row(head, true)}${rows.map((r) => row(r)).join('')}</table>`
const ratio = (r: number) => `<b class="${r > 1 ? 'ng' : 'ok'}">${f(r, 3)}</b>`
const fig = (svg: string, cap: string) => `<figure>${svg}<figcaption>${esc(cap)}</figcaption></figure>`
const L = (k: I18nKey, ...a: unknown[]) => esc((t as (k: I18nKey, ...a: unknown[]) => string)(k, ...a))

/* 검토 등급 — 화면(FramePanels memberGradeOf·StoryChip)과 같은 규칙 */
const STORY_GR: Record<StoryStatus, string> = { ok: 'pass', warn: 'prelim', ng: 'fail', na: 'expert' }
const storyChip = (s: StoryStatus) => `<span class="gr gr-${STORY_GR[s]}">${L(`fr_st_${s}` as I18nKey)}</span>`
const memberChip = (m: MemberDesign) => memberFails(m) ? `<span class="gr gr-fail">${L('gr_fail')}</span>` : `<span class="gr gr-expert">${L('fr_gr_expert')}</span>`

const CHECK: Record<string, I18nKey> = {
  strength: 'fr_gov_strength', shear: 'fr_gov_shear', ltb: 'fr_gov_ltb', stabilityX: 'fr_gov_stabx', stabilityY: 'fr_gov_staby',
  braceComp: 'fr_gov_bracecomp', braceTens: 'fr_gov_braceten', web: 'fr_gov_web', slender: 'rp_ck_slender', flange: 'rp_ck_flange',
}
const checkName = (k: string) => (CHECK[k] ? L(CHECK[k]) : esc(k))
const storyValue = (it: StoryItem, v: number) => (it.key === 'drift' ? `1/${Math.round(1 / v)}` : f(v, 3))

/** 등각 3D — 부재 종류 색 또는 응력비 색 (공장 iso 를 그대로: 보 = 'rafter' 색) */
function frameIso(model: FrameModel, design: FrameDesign | null): string {
  const z0 = model.levels[0]
  const iso = { nodes: model.nodes.map((n) => ({ ...n, z: n.z - z0 })), elements: model.elements.map((e) => ({ ...e, role: e.role === 'beam' ? 'rafter' : e.role })) } as unknown as Parameters<typeof isoSvg>[0]
  if (!design) return isoSvg(iso, { legend: ROLES.filter((r) => model.elements.some((e) => e.role === r)).map((r) => [ROLE_COLOR[r === 'beam' ? 'rafter' : r], t(`fr_role_${r}`)]) })
  const byMember = new Map(design.members.map((m) => [m.id, Math.max(m.ratio, m.detailRatio)]))
  const memberOf = new Map(model.elements.map((e) => [e.id, e.member]))
  const legend = RATIO_BANDS.map(([hi, c], i): [string, string] => [c, hi === Infinity ? `> ${RATIO_BANDS[i - 1][0].toFixed(1)}` : `${i ? RATIO_BANDS[i - 1][0].toFixed(1) : '0'} – ${hi.toFixed(1)}`])
  return isoSvg(iso, { legend, color: (id) => ratioColor(byMember.get(memberOf.get(id)!) ?? 0) })
}

export function buildFrameReport(input: FrameReportInput): string {
  const { built: { spec, model, P }, analysis: A, review: R, design: D, opt } = input
  const date = input.date ?? new Intl.DateTimeFormat('sv-SE').format(new Date())
  const parts: string[] = []
  let sec = 0
  const h2 = (k: I18nKey) => parts.push(`<h2>${++sec}. ${L(k)}</h2>`)
  const h3 = (s: string) => parts.push(`<h3>${s}</h3>`)
  const Lx = spec.xs.at(-1)! - spec.xs[0], Ly = spec.ys.at(-1)! - spec.ys[0]
  const Htot = model.levels.at(-1)! - model.levels[0]
  const count = (r: FrameRole) => model.elements.filter((e) => e.role === r).length
  const g = gravityTotals(spec, model)
  const ng = D ? D.members.filter(memberFails).length : 0

  /* 요약 */
  const summary: string[] = [L('rp_sum_model', model.nodes.length, model.elements.length, model.supports.length, P.combos.length)]
  if (A) summary.push(L('rp_sum_anal', f(A.story.eigen?.periods[0], 3)))
  else summary.push(L('rp_sum_no_anal'))
  if (R) { const bad = R.filter((i) => i.status === 'ng').length, warn = R.filter((i) => i.status === 'warn').length; summary.push(L('rp_sum_story', R.length, bad, warn)) }
  if (D) summary.push(L('rp_sum_member', D.members.length, ng, ...ROLES.map((r) => f(D.byRole[r]?.ratio, 3))))
  else summary.push(L('rp_sum_no_design'))
  parts.push(`<div class="status"><ul>${summary.map((s) => `<li>${s}</li>`).join('')}</ul></div>`)

  /* 1. 개요 */
  h2('rp_s_overview')
  const braced = (a: 'X' | 'Y') => (spec.design.braced[a] ? t('fr_nosway') : t('fr_sway'))
  parts.push(table([t('rp_item'), t('rp_value')], [
    [L('rp_codes'), L('fr_code_label')],
    [L('rp_mandatory'), 'GB 55001-2021 · GB 55002-2021 · GB 55006-2021 · GB 50009-2012'],
    [L('rp_system'), `${L('fr_sway_x', braced('X'))} · ${L('fr_sway_y', braced('Y'))}`],
    [L('rp_plan'), `${f(Lx, 1)} × ${f(Ly, 1)} m · ${spec.xs.length - 1} × ${spec.ys.length - 1} ${L('fr_spans_unit')} · ${L('fr_area_story')} ${f(model.floorArea, 1)} m²`],
    [L('fs_stories'), `${spec.heights.length} · ${spec.heights.map((h) => f(h, 2)).join(' / ')} m · H = ${f(Htot, 2)} m`],
    [L('fr_grade'), esc(spec.material)],
    [L('rp_counts'), L('rp_counts_v', model.nodes.length, model.elements.length, model.supports.length, count('column'), count('beam'), count('brace'))],
    [L('rp_software'), `MIDAS Gen NX (MAPI)${input.built.file ? ` · ${esc(input.built.file)}` : ''}`],
  ]))
  parts.push(`<p class="note">${L('fr_code_note')}</p>`)
  parts.push(fig(frameIso(model, null), t('rp_fig_iso')))

  /* 2. 모델 */
  h2('rp_s_model')
  h3(L('fr_grid'))
  const spanRow = (axis: 'X' | 'Y') => {
    const c = axis === 'X' ? spec.xs : spec.ys, lab = axis === 'X' ? gridX : gridY
    return [axis, spansOf(c).map((s, i) => `${lab(i)}–${lab(i + 1)} ${f(s, 3)}`).join(' · '), f(c.at(-1)! - c[0], 3)]
  }
  parts.push(table([t('rp_dir'), t('rp_spans'), t('rp_total_m')], [spanRow('X'), spanRow('Y')]))
  const removed = (spec.removed?.length ?? 0) + (spec.cuts?.length ?? 0)
  if (removed) parts.push(`<p class="note">${L('rp_plan_shape', spec.removed.length, spec.cuts?.length ?? 0)}</p>`)
  h3(L('fr_levels'))
  parts.push(table([t('fr_story_name'), t('rp_elev'), t('fr_story_h'), t('rp_diaphragm')],
    model.levels.map((z, k) => [esc(spec.storyNames[k]), f(z, 3), k < spec.heights.length ? f(spec.heights[k], 3) : '—', k === 0 ? L('rp_support_level') : L('rp_rigid')]).reverse()))
  h3(L('fr_sections'))
  parts.push(table([t('fr_role'), t('rp_mark'), t('fr_section'), 'A (cm²)', 'Ix (cm⁴)', 'Iy (cm⁴)', 'ix / iy (mm)', t('fr_count')],
    ROLES.filter((r) => count(r) > 0).map((r) => {
      const s = hSection(spec.sections[r])
      return [L(`fr_role_${r}`), FRAME_MARK[r], esc(s.name), f(s.A / 100, 2), f(s.Ix / 1e4, 0), f(s.Iy / 1e4, 0), `${f(s.ix, 1)} / ${f(s.iy, 1)}`, count(r)]
    })))
  h3(L('fr_brace_bays'))
  const bays = braceBays(spec)
  if (!bays.length) parts.push(`<p>${L('fr_no_braces')}</p>`)
  else {
    const byLine = new Map<string, string[]>()
    for (const b of bays) {
      const key = b.axis === 'X' ? `${t('rp_grid')} ${gridY(b.j)} (X)` : `${t('rp_grid')} ${gridX(b.i)} (Y)`
      const bay = b.axis === 'X' ? `${gridX(b.i)}–${gridX(b.i + 1)}` : `${gridY(b.j)}–${gridY(b.j + 1)}`
      ;(byLine.get(key) ?? byLine.set(key, []).get(key)!).push(bay)
    }
    parts.push(table([t('rp_frame_line'), t('rp_bays')], [...byLine].map(([k, v]) => [esc(k), esc(v.join(', '))])))
    parts.push(`<p class="note">${L('rp_brace_note', count('brace'))}</p>`)
  }
  const sched = frameSchedule(model)
  h3(L('rp_quantity'))
  parts.push(table([t('rp_mark'), t('fr_role'), t('fr_section'), t('rp_members'), t('rp_length'), t('rp_weight')],
    [...sched.map((s) => [s.mark, L(`fr_role_${s.role}`), esc(s.section), s.count, f(s.length, 1), f(s.tons, 2)]),
      ['', `<b>${L('rp_total')}</b>`, '', sched.reduce((a, s) => a + s.count, 0), f(sched.reduce((a, s) => a + s.length, 0), 1), `<b>${f(sched.reduce((a, s) => a + s.tons, 0), 2)}</b>`]]))
  parts.push(`<p class="note">${L('rp_quantity_note')}</p>`)

  /* 3. 하중 */
  h2('rp_s_loads')
  h3(L('fr_floor_loads'))
  const Ld = spec.loads
  parts.push(table([t('rp_item'), t('rp_floor'), t('fr_roof')], [
    [L('rp_dead'), `${f(Ld.floorDead)} kN/m²`, `${f(Ld.roofDead)} kN/m²`],
    [L('rp_live'), `${f(Ld.floorLive)} kN/m²`, `${f(Ld.roofLive)} kN/m²`],
    [L('fr_edge_loads'), `${f(Ld.edgeFloor)} kN/m`, `${f(Ld.edgeRoof)} kN/m`],
    ...(Ld.roofSnow > 0 ? [[L('fr_snow'), '—', `s₀ ${f(Ld.roofSnow)} · μr ${f(Ld.snowMu)} → sk ${f(Ld.roofSnow * Ld.snowMu, 3)} kN/m²`]] : []),
  ]))
  parts.push(table([t('rp_item'), t('rp_value')], [
    [L('fr_dl_total'), `${f(g.dlExceptSelf, 1)} kN`], [L('fr_ll_total'), `${f(g.ll, 1)} kN`],
    ...(g.snow > 0 ? [[L('fr_snow_total'), `${f(g.snow, 1)} kN`]] : []),
    ...(A?.equilibrium.DL ? [[L('rp_dl_with_self'), `${f(A.equilibrium.DL.app, 1)} kN`]] : []),
  ]))
  parts.push(`<p class="note">${L('fr_loads_note')}</p>`)
  h3(L('fr_wind'))
  const w = spec.wind
  parts.push(table([t('rp_item'), t('rp_value')], [
    [L('fr_w0'), `${f(w.w0)} kN/m²`], [L('fr_terrain'), w.terrain], [`${L('fr_mu_windward')} / ${L('fr_mu_leeward')}`, `${f(w.muWindward)} / ${f(w.muLeeward)}`],
    [L('rp_wind_damping'), f(w.damping, 3)], ...P.wind.map((x) => [`T₁ (${x.dir})`, `${f(x.T1, 3)} s · ${L('rp_base_force')} ${f(x.base, 1)} kN`]),
  ]))
  parts.push(table([t('fr_level'), 'z (m)', 'μz', 'βz (X)', 'βz (Y)', 'Fx (kN)', 'Fy (kN)'],
    P.wind[0].stories.map((st, i) => [esc(spec.storyNames[st.level]), f(st.z, 2), f(st.muz, 3), f(st.betaz, 3), f(P.wind[1].stories[i]?.betaz, 3), f(st.F, 2), f(P.wind[1].stories[i]?.F, 2)])))
  parts.push(`<p class="note">${L('rp_wind_note')}</p>`)
  h3(L('fr_seismic'))
  const s = spec.seismic
  parts.push(table([t('rp_item'), t('rp_value')], [
    [L('fr_intensity'), `${s.intensity.split('_')[0]}${L('fr_degree')} (${SFI[s.intensity]})`], [L('fr_group'), L('fr_group_n', s.group)], [L('fr_site'), s.site],
    ['αmax · Tg', `${ALPHA_MAX[s.intensity]} · ${tgOf(s)} s`], [L('fr_seis_damping'), f(s.damping, 3)], [L('fr_live_mass'), f(s.liveMassFactor, 2)],
    [L('fr_modes'), s.modes], [L('fr_acc_ecc'), s.accidentalEccentricity ? L('rp_yes') : L('rp_no')], [L('fr_seis_grade'), L('fr_grade_n', spec.design.seismicGrade)],
    [L('fr_net_area'), f(spec.design.netAreaRatio, 2)], ['λmin (5.2.5)', f(LAMBDA_MIN[s.intensity], 3)],
  ]))
  parts.push(`<p class="note">${L('rp_seismic_note')}</p>`)
  h3(`${L('fr_combos')} (${P.combos.length})`)
  parts.push(table([t('fr_combo'), t('rp_combo_desc'), t('rp_kind')], P.combos.map((c) => [c.name, esc(c.desc), c.seismic ? L('rp_kind_e') : c.wind ? L('rp_kind_w') : L('rp_kind_g')])))
  parts.push(`<p class="note">${L('rp_combo_note')}</p>`)

  /* 4. 해석 결과 */
  h2('rp_s_analysis')
  if (!A) parts.push(`<p>${L('rp_no_analysis')}</p>`)
  else {
    h3(L('fr_equilibrium'))
    parts.push(table([t('res_lc'), 'Gen (kN)', `${t('fr_app')} (kN)`, t('fr_diff')],
      Object.entries(A.equilibrium).map(([k, e]) => [k, f(e.gen, 2), f(e.app, 2), `<span class="${equilibriumError(e) < 1e-3 ? 'ok' : 'ng'}">${(equilibriumError(e) * 100).toFixed(4)} %</span>`])))
    const eig = A.story.eigen
    h3(L('fr_eigen'))
    parts.push(eig ? table([t('fr_mode'), 'T (s)', 'ΣX (%)', 'ΣY (%)'], eig.periods.map((p, i) => [i + 1, f(p, 4), f(eig.massX[i], 2), f(eig.massY[i], 2)])) : `<p>${L('fr_eigen_missing')}</p>`)
    const st = A.story
    if (st.mass?.length) {
      h3(L('rp_story_mass'))
      parts.push(table([t('fr_story'), t('rp_elev'), 'X (t)', 'Y (t)'], st.mass.map((r) => [esc(r.Story), f(+r.Level, 3), f(+r['X-DIR'], 2), f(+r['Y-DIR'], 2)])))
    }
    for (const dir of ['X', 'Y'] as const) {
      const sh = dir === 'X' ? st.shearX : st.shearY
      if (!sh?.length) continue
      h3(L('rp_story_shear', `R${dir}`))
      parts.push(table([t('fr_story'), `V${dir.toLowerCase()} (kN)`, `ΣG (kN)`, 'λ', 'λmin'],
        sh.map((r) => [esc(r.Story), f(+r[`Shear Force/${dir}`], 1), f(+r[`Weight Sum/${dir}`], 1), f(+r[`Story Shear Force Coefficient/${dir}`], 4), f(LAMBDA_MIN[s.intensity], 3)])))
    }
    const otm = overturning(spec, st)
    if (otm.length) {
      h3(L('rp_otm'))
      parts.push(table([t('fr_story'), 'Gen RX', `ΣV·h X`, 'Gen RY', `ΣV·h Y`], otm.map((o) => [esc(o.story), f(o.gen.X, 1), f(o.app.X, 1), f(o.gen.Y, 1), f(o.app.Y, 1)])))
      parts.push(`<p class="note">${L('rp_otm_note')}${otm.every((o) => o.gen.X === null && o.gen.Y === null) ? ` ${L('rp_otm_missing')}` : ''}</p>`)
    }
    const miss = Object.keys(A.missing)
    if (miss.length) parts.push(`<p class="note">${L('fl_tables_missing', miss.join(', '))}</p>`)
  }

  /* 5. 층 검토 */
  h2('rp_s_story')
  if (!R) parts.push(`<p>${L('rp_no_design')}</p>`)
  else {
    parts.push(table([t('fr_item'), t('fr_clause'), t('fr_status')], R.map((it) => [`${L(`fr_sr_${it.key}` as I18nKey)}${it.dir ? ` ${it.dir}` : ''}`, esc(it.clause), storyChip(it.status)])))
    for (const it of R) {
      if (!it.rows.length) continue
      h3(`${L(`fr_sr_${it.key}` as I18nKey)}${it.dir ? ` ${it.dir}` : ''} — ${esc(it.clause)}`)
      const lim = (v: number) => (!Number.isFinite(v) ? '—' : storyValue(it, v))
      parts.push(table([t('fr_story'), t('rp_value'), t('rp_limit'), t('fr_status'), t('rp_note')],
        it.rows.map((r) => [esc(r.story), storyValue(it, r.value), lim(r.limit), storyChip(r.status), r.note ? `<span class="note">${esc(r.note)}</span>` : ''])))
    }
    parts.push(`<p class="note">${L('rp_story_note')}</p>`)
  }

  /* 6. 부재 검토 */
  h2('rp_s_member')
  if (!D) parts.push(`<p>${L('rp_no_design')}</p>`)
  else {
    h3(L('fr_member_summary'))
    parts.push(table([t('fr_role'), t('fr_count'), t('fr_max_ratio'), t('fr_detail'), t('fr_governing'), t('fr_status')], ROLES.flatMap((r) => {
      const w = D.byRole[r]; if (!w) return []
      const ms = D.members.filter((m) => m.role === r), det = Math.max(...ms.map((m) => m.detailRatio))
      return [[L(`fr_role_${r}`), ms.length, `${ratio(w.ratio)} (#${w.id})`, ratio(det), `${checkName(w.worst.governing)} · ${w.worst.combo}`, memberChip(w)]]
    })))
    parts.push(`<p class="note">${L('fr_member_note')}</p>`)
    parts.push(fig(frameIso(model, D), t('rp_fig_ratio')))
    for (const r of ROLES) {
      const m = D.byRole[r]
      if (!m) continue
      const det = D.members.filter((x) => x.role === r).reduce((a, b) => (b.detailRatio > a.detailRatio ? b : a))
      h3(L('rp_gov_member', t(`fr_role_${r}`), m.id))
      parts.push(memberDetail(m, spec))
      if (det.id !== m.id && det.detailRatio > m.detailRatio) parts.push(`<p class="note">${L('rp_detail_worst', det.id, f(det.detailRatio, 3))}</p>`)
    }
    /* 층·종류별 최대 — 한눈에 */
    h3(L('rp_by_story'))
    const groups: unknown[][] = []
    for (const r of ROLES) for (let st = 1; st <= spec.heights.length; st++) {
      const ms = D.members.filter((m) => m.role === r && m.story === st)
      if (!ms.length) continue
      const w = ms.reduce((a, b) => (b.ratio > a.ratio ? b : a)), det = Math.max(...ms.map((m) => m.detailRatio)), bad = ms.filter(memberFails).length
      groups.push([L(`fr_role_${r}`), esc(spec.storyNames[st - 1]), ms.length, `${ratio(w.ratio)} (#${w.id})`, `${checkName(w.worst.governing)} · ${w.worst.combo}`, ratio(det), bad ? `<b class="ng">${bad}</b>` : '0'])
    }
    parts.push(table([t('fr_role'), t('fr_story'), t('fr_count'), t('fr_max_ratio'), t('fr_governing'), t('fr_detail'), t('rp_ng_members')], groups))
    /* 전체 부재 — 8열 이하(PDF·Word 에서 열 묶음으로 나뉘지 않게). μ·L 은 지배 부재 상세와 CSV 에 */
    h3(`${L('fr_members')} (${D.members.length})`)
    const list = [...D.members].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.story - b.story || a.id - b.id)
    parts.push(table(['#', t('fr_role'), t('fr_story'), t('fr_section'), t('fr_combo'), t('fr_governing'), t('fr_ratio'), t('fr_detail')],
      list.map((m) => [m.id, L(`fr_role_${m.role}`), esc(spec.storyNames[m.story - 1]), esc(m.section), m.worst.combo, checkName(m.worst.governing), ratio(m.ratio), ratio(m.detailRatio)]), 'wide'))
    parts.push(`<p class="note">${L('rp_members_note')}</p>`)
    if (opt) {
      h3(L('rp_opt'))
      parts.push(table([t('fr_role'), t('rp_before'), t('rp_after'), t('fr_max_ratio'), t('rp_weight')],
        [...opt.rows.map((o) => [L(`fr_role_${o.role}`), esc(o.before), o.after !== o.before ? `<b>${esc(o.after)}</b>` : esc(o.after), o.ratio === null ? '—' : ratio(o.ratio), `${f(o.tBefore)} → ${f(o.tAfter)}`]),
          [`<b>${L('rp_total')}</b>`, '', '', '', `<b>${f(opt.weightBefore)} → ${f(opt.weightAfter)}</b>`]]))
      parts.push(table([t('rp_iter'), `${t('fr_role_column')} / ${t('fr_role_beam')} / ${t('fr_role_brace')}`, t('rp_weight'), t('fr_max_ratio'), t('rp_ng_members'), t('rp_drift_ok')],
        opt.iters.map((it) => [it.it, esc(ROLES.map((r) => it.sections[r]).join(' / ')), f(it.weight, 2), ratio(it.maxRatio), it.ng, it.driftOk ? L('rp_yes') : `<b class="ng">${L('rp_no')}</b>`])))
      parts.push(`<p class="note">${L('rp_opt_note')}</p>`)
    }
  }

  /* 7. 가정·한계 */
  h2('rp_s_limits')
  parts.push(`<ul>${(['rp_lim_analysis', 'rp_lim_member', 'rp_lim_mu', 'rp_lim_gen', 'rp_lim_wind'] as I18nKey[]).map((k) => `<li>${L(k)}</li>`).join('')}</ul>`)
  parts.push(`<p><b>${L('rp_not_checked')}</b> ${L('fr_scope_note')}</p>`)
  parts.push(`<p class="note">${L('rp_disclaimer')}</p>`)

  /* 부록. 도면 */
  const sheets = buildFrameDrawingSvgs({ spec, model, title: t('rp_title'), date, version: APP_VERSION, colStrongAxis: A?.colStrongAxis })
  parts.push(`<section class="dwg"><h2>${++sec}. ${L('rp_s_drawings')}</h2><p class="note">${L('rp_dwg_note')}</p>`)
  for (const sh of sheets) parts.push(fig(sh.svg, sh.name))
  parts.push('</section>')

  const title = t('rp_title')
  const uiFonts = typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol) ? new URL('/fonts/ui-fonts.css', window.location.href).href : '/fonts/ui-fonts.css'
  return `<!doctype html><html lang="${htmlLang(getLang())}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="${esc(uiFonts)}">
<style>
  body{font-family:var(--font-ui,sans-serif);font-variant-numeric:tabular-nums;color:#111;margin:24px auto;max-width:1000px;padding:0 16px;font-size:12px;line-height:1.55;background:#fff}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #1f3a8a;color:#1f3a8a}
  h3{font-size:13px;margin:14px 0 6px} table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:11px}
  th,td{border:1px solid #c8ccd4;padding:3px 6px;text-align:left} th{background:#eef1f7}
  .status{border:1px solid #c8ccd4;border-radius:4px;padding:8px 12px;margin:10px 0;background:#f7f8fb}
  .gr{display:inline-block;padding:0 6px;border:1px solid currentColor;border-radius:8px;font-size:10.5px;font-weight:600;white-space:nowrap}
  table.wide{font-size:9.5px} table.wide th,table.wide td{padding:2px 3px}
  .gr-fail{color:#c43030}.gr-expert{color:#5a45c6}.gr-prelim{color:#b56d00}.gr-pass{color:#1d8653}
  .ok{color:#1d8653}.ng{color:#c43030}.note{color:#555;font-size:11px} .meta{color:#555} ul{margin:4px 0 0 18px}
  figure{margin:10px 0 14px;text-align:center;break-inside:avoid} figure svg{border:1px solid #e1e4ea;background:#fff} figcaption{font-size:11px;color:#444;margin-top:4px}
  @page{size:A4;margin:14mm 12mm}
  @media print{body{margin:0;max-width:none} h2{break-after:avoid} table{break-inside:auto} tr{break-inside:avoid} .dwg{break-before:page} .dwg figure{break-inside:avoid}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">${L('rp_meta', date, APP_VERSION)}</div>
${parts.join('\n')}
</body></html>`.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080)) // 아래첨자 숫자는 계산서 CJK 글꼴(Noto)에 없음 → T1·w0
}

/** 지배 부재 상세 — 고정 성질 + 지배 조합의 검토 항목 + 구조 규정 */
function memberDetail(m: MemberDesign, spec: FrameSpec): string {
  const st = m.st, w: ComboCheck = m.worst
  const props = table([t('rp_item'), t('rp_value')], [
    [L('fr_section'), `${esc(m.section)} · ${spec.material} · f = ${f(st.st.f, 0)} MPa · fy = ${f(st.st.fy, 0)} MPa · εk = ${f(st.eps, 3)}`],
    [L('rp_geom'), `L = ${f(m.L, 3)} m · μx / μy = ${f(m.muX, 3)} / ${f(m.muY, 3)}${m.K ? ` · K = ${m.K.x.map((v) => f(v, 2)).join(', ')} / ${m.K.y.map((v) => f(v, 2)).join(', ')}` : ''}`],
    [L('rp_slender'), `λx / λy = ${f(st.lambdaX, 1)} / ${f(st.lambdaY, 1)} · φx / φy = ${f(st.phiX, 3)} / ${f(st.phiY, 3)}${m.role === 'beam' ? ` · φb = ${f(st.phiB, 3)}` : ` · φb = ${f(st.phiBc, 3)}`}`],
    [L('rp_class'), `S${st.cls} · γx / γy = ${f(st.gx, 2)} / ${f(st.gy, 2)}`],
    [L('fr_combo'), `${esc(w.combo)}${w.seismic ? ` · ${L('rp_seismic_combo')}` : ''}`],
  ])
  const item = (i: CheckItem) => [checkName(i.key), esc(i.clause), f(i.demand, 3), f(i.capacity, 3), ratio(i.ratio) + (i.psi ? ` <span class="note">ψ = ${f(i.psi, 3)}</span>` : '')]
  const checks = table([t('fr_item'), t('fr_clause'), t('rp_demand'), t('rp_capacity'), t('fr_ratio')], [...w.items.map(item), ...st.detailing.filter((d) => d.key !== 'web' || !w.items.some((i) => i.key === 'web')).map(item)])
  return props + checks + `<p class="note">${L('rp_units_note')}</p>`
}
