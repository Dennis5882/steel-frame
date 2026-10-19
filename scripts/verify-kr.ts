/* 한국 KDS 오프라인 회귀 (Gen·키 불필요) — node --import tsx scripts/verify-kr.ts
   ① 원문 표·식 고정점(재료 표 3.3-1, 지붕활하중 3.6.1, Fa·Fv·S_DS·S_D1, 내진설계범주, Cs, K_zr·G_D, 외압계수, 적설)
   ② KDS 14 31 10 부재 강도 — 별도 손계산(파이썬 독립 구현, 2026-10-16) 값과 대조
   ③ 하중 평형: L_r·적설·불균형 적설 합 = 손계산, 지진 = Cs·W, 가상하중 = 0.002·W, 풍직각 = γ·W_D, 조합 수
   ④ 적용범위·입력 칸·Gen 페이로드(KS22(S)·KS21·KDS 41 30) ⑤ 합성 결과로 설계 검토 전체 경로 */
import './_dom-stub'
import assert from 'node:assert/strict'
import { fyKR, KR, KR_GEN_DESIGN_CODE, roofLiveKR } from '../src/codes/kr'
import { areaKa, csKR, flatRoofCpeKR, flatSnowKR, gustKR, kzrKR, leewardRoofCpeKR, periodKR, sdcKR, slopeCsKR, spectrumKR, windwardRoofCpeKR } from '../src/codes/krLateral'
import { krCapacity, krCheck, krKSway } from '../src/codes/krSteel'
import { distortionalKR, krCfCapacity, krCfCheck } from '../src/codes/krColdFormed'
import { ccDims } from '../src/codes/twColdFormed'
import { defaultSpecFor, KR_DEFAULT_SPEC, normalizeSpans, type FactorySpec } from '../src/domain/types'
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { buildGenPayloads } from '../src/domain/gen'
import { sectionProps } from '../src/domain/sections'
import { checkScope } from '../src/domain/scope'
import { KR_CATALOG } from '../src/domain/krCatalog'
import { runDesign } from '../src/domain/design'
import { runConnections } from '../src/domain/connections'
import { groupsFor, initVals, invalidFields, toSpec } from '../src/components/planFields'
import { krSynthetic } from './kr-synth'
import { cpeCCKR, cpiCCKR, zoneWidthKR } from '../src/codes/krWindCC'
import { CPI_KEYS, CPI_KR, REGIONS_KR, regionZoneKR, sMinKR } from '../src/codes/krLateral'
import { krCCLoads, ccVelocityKR } from '../src/domain/krSecondary'
import { anchorKR, boltKR, concreteBearingKR, filletKR, flangeBendKR, holeKR, panelKR, slipKR } from '../src/codes/krConnection'
import { portalGeometry } from '../src/domain/portal'

let n = 0
const near = (a: number, b: number, tol = 1e-6, msg = '') => { n++; assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b}`) }
const ok = (c: boolean, msg: string) => { n++; assert.ok(c, msg) }

/* ① 표·식 고정점 */
near(fyKR('SS275', 16), 275); near(fyKR('SS275', 17), 265); near(fyKR('SM355', 40), 345); near(fyKR('SM355', 41), 335); near(fyKR('SN275', 40), 275)
assert.throws(() => fyKR('SS275', 101)); assert.throws(() => fyKR('SS400', 10))
near(roofLiveKR(0.1, 9), 1.0); near(roofLiveKR(0.5, 40), 0.72, 1e-9, 'R1 0.8 × R2 0.9'); near(roofLiveKR(1, 100), 0.6, 1e-9, 'lower bound')
const sp = spectrumKR(0.22, 'S4')
near(sp.Fa, 1.36, 1e-9); near(sp.Fv, 1.96, 1e-9); near(sp.SDS, 0.22 * 2.5 * 1.36 * 2 / 3, 1e-12); near(sp.SD1, 0.22 * 1.96 * 2 / 3, 1e-12)
near(spectrumKR(0.1, 'S1').Fa, 1.12); near(spectrumKR(0.3, 'S5').Fv, 2.4)
ok(sdcKR(sp.SDS, sp.SD1, '2') === 'D', 'S4 zone I → SDC D'); ok(sdcKR(0.3, 0.1, '2') === 'B', 'B'); ok(sdcKR(0.3, 0.1, 'S') === 'C', 'special C')
near(periodKR('moment', 10), 0.0724 * 10 ** 0.8, 1e-12); near(periodKR('braced', 10), 0.0488 * 10 ** 0.75, 1e-12)
const cs = csKR(0.4, sp, 3, 1)
near(cs.c, sp.SDS / 3, 1e-12); near(csKR(4, sp, 3, 1).c, sp.SD1 / 12, 1e-12, '7.2-3 governs'); near(csKR(4, { SDS: 0.05, SD1: 0.02, TL: 5 }, 8, 1).c, 0.01, 1e-12, '7.2-5 floor')
near(kzrKR(8, 'C'), 1.0); near(kzrKR(30, 'B'), 0.45 * 30 ** 0.22, 1e-12)
near(gustKR(8.6, 36, 'C'), 2.080212, 1e-5, 'G_D hand calc (I_H 0.20362, γ_D 0.32673, B_D 0.68314)')
ok(JSON.stringify(windwardRoofCpeKR(20, 0.5)) === JSON.stringify([-0.4, 0.0]), 'windward table 20°, H/D 0.5')
near(leewardRoofCpeKR(25, 0.25, 5), -0.72, 1e-12, '−0.06(7+B/D)'); near(leewardRoofCpeKR(10, 1, 1), -0.7)
ok(flatRoofCpeKR(1, 8, 0.3)[0] === -0.9 && flatRoofCpeKR(30, 8, 0.3)[1] === 0.2, 'flat roof zones'); near(areaKa(25), 0.9); near(areaKa(55), 0.9 - 0.1 * 30 / 75, 1e-12)
near(flatSnowKR({ Sg: 0.5, Ce: 1, Ct: 1, Is: 1, thetaDeg: 5 }).Sf, 1.0, 1e-12, '4.3.5 min 1.0'); near(flatSnowKR({ Sg: 3, Ce: 1, Ct: 1, Is: 1, thetaDeg: 30 }).Sf, 2.1, 1e-12)
near(slopeCsKR(50, 1), 0.5); near(slopeCsKR(50, 1.2), 0.8)
near(krKSway(1, 10), 1.9, 0.15, 'alignment chart (fixed base, pinned-ish top)')

/* ② 부재 강도 — 독립 손계산 */
const pipe = krCapacity(sectionProps('P 139.8x4.5'), 275, { KLx: 3000, KLy: 3000, Lb: 3000 }, 1)
near(pipe.phiPnc, 380.610, 0.01, 'pipe φPn'); near(pipe.phiMnx, 20.396, 0.001, 'pipe φMp')
const H = sectionProps('H 600x200x11/17')
for (const [Lb, m] of [[1500, 682.868], [4000, 558.967], [12000, 163.635]] as const)
  near(krCapacity(H, 265, { KLx: 10000, KLy: 1500, Lb }, 1).phiMnx, m, 0.01, `H600 φMn Lb ${Lb}`)
const hc = krCapacity(H, 265, { KLx: 10000, KLy: 1500, Lb: 1500 }, 1)
near(hc.phiVn, 1049.4, 0.01, 'rolled H φv 1.0'); near(hc.phiPnc, 2683.68, 0.05, 'slender web effective width'); near(hc.aeRatio, 0.94866, 1e-4)
const r1 = krCheck(hc, { P: -0.3 * hc.phiPnc, Mx: 0.3 * hc.phiMnx, My: 0, V: 0 })
near(r1.ratio, 0.3 + 8 / 9 * 0.3, 1e-12); ok(r1.eq === 'KDS 4.4-1', '4.4-1')
near(krCheck(hc, { P: -0.1 * hc.phiPnc, Mx: 0.5 * hc.phiMnx, My: 0, V: 0 }).ratio, 0.55, 1e-12, '4.4-2')
ok(sectionProps('LH 150x75x3.2/4.5').rolled === false && sectionProps('H 150x150x7/10').rolled, 'LH welded / H rolled')
for (const [role, list] of Object.entries(KR_CATALOG)) for (const s of list) { const p = sectionProps(s); const cap = p.kind === 'CC' ? krCfCapacity(s, p, 275, { Lx: 3000, Ly: 1500, Lt: 1500, Lb: 1500, Lm: 1500 }, 1) : krCapacity(p, 275, { KLx: 3000, KLy: 1500, Lb: 1500 }, 1); ok(p.A > 0 && Number.isFinite(cap.phiPnc) && cap.phiPnc > 0, `${role} ${s}`) }

/* ③ 하중 */
const sum = (spec: FactorySpec) => {
  const m = buildPortal(spec), l = buildLoadPayloads(spec, m)
  const s: Record<string, number[]> = {}
  for (const [id, v] of Object.entries<any>(l.BMLD)) for (const it of v.ITEMS) {
    const e = m.elements[+id - 1], a = m.nodes[e.n1 - 1], b = m.nodes[e.n2 - 1]
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), t = s[it.LCNAME] ??= [0, 0, 0]
    t[{ GX: 0, GY: 1, GZ: 2 }[it.DIRECTION as 'GX']] += it.P[0] * L
  }
  for (const v of Object.values<any>(l.CNLD)) for (const it of v.ITEMS) { const t = s[it.LCNAME] ??= [0, 0, 0]; t[0] += it.FX; t[1] += it.FY }
  return { m, l, s }
}
const g = sum(defaultSpecFor('KR'))
ok(Object.keys(g.l.STLD).length === 23 && Object.keys(g.l['LCOM-GEN']).length === 54, `gable cases/combos ${Object.keys(g.l.STLD).length}/${Object.keys(g.l['LCOM-GEN']).length}`)
near(g.s.LR[2], -1.0 * 24 * 36, 1e-6, 'LR = 1.0 × 24 × 36'); near(g.s.SN[2], -1.0 * 24 * 36, 1e-6, 'snow min 1.0 × B × L')
const W = g.l.info.seismic.W
near(g.s.EX[0], sp.SDS / 3 * W, 1e-6, 'V = Cs·W'); near(g.s.EY[1], sp.SDS / 3 * W, 1e-6)
near(g.s.ETX[1], 0, 1e-9, 'torsion couple'); near(g.s.NXD[0], 0.002 * W, 1e-6, 'notional 0.002·W (dead + self weight)')
near(g.s.NXL[0], 0.002 * 864, 1e-6)
near(g.l.info.wind.qh, 0.5 * 1.225 * (28 * 0.95) ** 2 / 1000, 1e-12, 'q_H')
near(g.l.info.wind.across.WLX, Math.max(0.35 * 24 / 36, 0.2) * g.l.info.wind.across.WDx, 1e-9, 'W_LC = γ·W_D')
ok(g.l.info.kr!.sdc === 'D' && g.l.info.kr!.orth30, 'SDC D → 100% + 30%')
ok(Object.values<any>(g.l['LCOM-GEN']).filter((c) => /1\.7-[57]/.test(c.NAME)).length === 8, 'symmetric: 2 seismic variants per direction × 2 directions × 2 combos')
const steep = sum({ ...defaultSpecFor('KR'), roofSlope: 0.5 }) // 26.6° → 불균형
ok(['SN1', 'SN2'].every((c) => c in steep.s), 'unbalanced snow cases for θ > 15°')
const Ss = steep.l.info.snow!
near(steep.s.SN1[2], -(1.5 * Ss / 1.0) * 12 * 36, 1e-6, 'SN1 = 1.5S_s/Ce on leeward half')
const multi = sum({ ...defaultSpecFor('KR'), frame: 'multi', spanList: [24, 24], span: 48 })
near(multi.s.SNU[2], -36 * (2 * 12 * 0.5 + 2 * 12 * (0.5 + 2) / 2), 1e-6, 'multi unbalanced: eave halves 0.5S_f, valley halves 0.5 → 2S_f/Ce')
const mono = sum({ ...defaultSpecFor('KR'), frame: 'mono' })
ok(['WX5', 'WX8'].every((c) => c in mono.s), 'mono wind from both sides')
const asym = sum({ ...defaultSpecFor('KR'), bayList: [6, 6, 7.5, 6, 6, 6] })
ok(['WY5', 'WY8'].every((c) => c in asym.s), 'asymmetric bays → Y wind from both gables')

/* ④ 적용범위·입력·Gen */
const sc = checkScope(defaultSpecFor('KR'))
ok(!sc.blocked && !sc.issues.some((i) => i.level === 'block'), 'KR sample in scope (phase-2 warning removed — all phase-2 checks implemented)')
ok(checkScope({ ...defaultSpecFor('KR'), korea: { ...KR_DEFAULT_SPEC.korea!, V0: 10 } }).issues.some((i) => i.key === 'kr' && i.level === 'block'), 'V0 out of range blocked')
ok(checkScope({ ...defaultSpecFor('KR'), frame: 'multi', spanList: [24, 24], span: 48 }).issues.some((i) => i.key === 'multiKR'), 'multiKR warn')
const fields = groupsFor('KR').flatMap((x) => x.fields).map((f) => f.path)
ok(fields.includes('korea.V0') && fields.includes('korea.site') && fields.includes('korea.systemX') && fields.includes('fc') && fields.includes('anchorFu') && !fields.includes('seismic.SDS') && !fields.includes('china.anchorFt'), 'KR field groups (incl. seismic system, connection inputs)')
const vals = initVals(defaultSpecFor('KR'))
ok(invalidFields(defaultSpecFor('KR'), vals, false).length === 0, 'KR defaults valid')
ok(invalidFields(defaultSpecFor('KR'), { ...vals, 'korea.KD': '0.5' }, false).some((f) => f.path === 'korea.KD'), 'K_D below 0.85 invalid')
ok(toSpec(defaultSpecFor('KR'), { ...vals, 'korea.Ct': '1.2', 'korea.site': 'S2' }, false).korea!.Ct === 1.2, 'toSpec numeric select')
const gp = buildGenPayloads(defaultSpecFor('KR'), g.m) as any
ok(gp.MATL[1].PARAM[0].STANDARD === 'KS22(S)' && gp.MATL[1].PARAM[0].DB === 'SS275' && gp.MATL[2], 'KS22(S) materials, secondary MATL 2')
const sect = Object.values<any>(gp.SECT)
ok(sect.every((x) => x.SECT_BEFORE.SECT_I.DB_NAME === 'KS21') && sect.some((x) => x.SECT_BEFORE.SECT_I.SECT_NAME.startsWith('LC-') && x.SECT_BEFORE.SHAPE === 'CC'), 'KS21 sections, LC- → SHAPE CC (live 2026-10-16)')
ok(KR.gen.shapeOf('LH 150x75x3.2/4.5') === 'H' && KR.gen.shapeOf('P 139.8x4.5') === 'P', 'LH → SHAPE H, P → P')
ok(gp.MATL[2].PARAM[0].DB === 'SSC275', 'secondary MATL 2 = SSC275 (cold-formed)')
ok(Object.values<any>(g.l['LCOM-GEN']).every((c) => c.NAME.length <= 20), 'combination names ≤ 20 chars (Gen limit)')
for (const v of [{}, { frame: 'mono' as const }, { frame: 'multi' as const, spanList: [24, 30] }]) { const s = normalizeSpans({ ...defaultSpecFor('KR'), ...v }), l = buildLoadPayloads(s, buildPortal(s)) as any; ok(Object.values<any>(l.CNLD).every((r) => new Set(r.ITEMS.map((i: any) => i.LCNAME)).size === r.ITEMS.length), `one CNLD item per case per node (${s.frame ?? 'gable'})`) }
ok(Object.keys(g.l.BMLD).every((id) => gp.ELEM[id].TYPE !== 'TRUSS'), 'no beam loads on TRUSS elements (Gen rejects — live 2026-10-16)')
ok(KR.gen.designCode === undefined && KR_GEN_DESIGN_CODE === 'KDS 41 30 : 2022' && !('DSTL' in gp), 'no db/DSTL for KR (DESIGN/STEEL/DSTL only in live cross-check)')

/* ⑤ 합성 결과로 설계 검토 경로 — 모든 조합에 같은 비례 부재력(기둥 압축 + 휨), 변위는 작은 값 */
const spec = defaultSpecFor('KR'), info = g.l.info
const { results: res } = krSynthetic(spec)
const d = runDesign(spec, g.m, info, res)
ok(d.members.length === g.m.elements.length && d.members.every((m) => Number.isFinite(m.ratio) && m.ratio > 0), 'every member checked')
ok(d.service.length === 6 && d.service.find((s) => s.key === 'seisDriftX')!.limit === 0.02, 'service checks incl. KDS drift limit')
const col = d.byRole.column!
ok(col.B >= 1 && /KDS|KL/.test(col.eq), `column eq ${col.eq}`)
near(d.service.find((s) => s.key === 'seisDriftX')!.value, 3 * Math.abs(0.004 + 0.004) / 8, 1e-9, 'δ = Cd·(E+ET)/I_E / h') // dx(EX) + dx(ETX)
near(d.service.find((s) => s.key === 'windDriftX')!.value, 0.65 * Math.abs(0.004 + 0.004) / 8, 1e-9, '0.65·(W + W_L)')

/* ⑥ 외장재설계용 풍하중 (KDS 41 12 00 5.4.2·5.8) — 그래프 고정점 + 샘플 손계산 */
for (const k of CPI_KEYS) ok(cpiCCKR(k)[0] === 2 * CPI_KR[k][0] && cpiCCKR(k)[1] === 2 * CPI_KR[k][1], `table 5.8-9 = 2 × table 5.7-4 (${k})`)
near(cpeCCKR('gable', 3, 1, 5).neg, -6.0); near(cpeCCKR('gable', 3, 10, 5).neg, -2.25); near(cpeCCKR('gable', 2, 0.5, 5).neg, -3.9)
near(cpeCCKR('gable', 1, 50, 20).neg, -1.6); near(cpeCCKR('gable', 3, 1, 35).pos, 1.95); near(cpeCCKR('gable', 1, 1, 5).pos, 0, 0, 'θ ≤ 10° roof: no positive graph')
near(cpeCCKR('mono', 3, 1, 5).neg, -5.2); near(cpeCCKR('mono', 3, 10, 20).neg, -4.0); near(cpeCCKR('multi', 2, 1, 20).neg, -4.4); near(cpeCCKR('multi', 1, 1, 5).neg, -2.1, 1e-12, 'multi θ ≤ 10° = table 5.8-2② ①')
near(cpeCCKR('gable', 4, 2, 20).pos, 2.0, 1e-12, 'wall + flat to 2 m²'); near(cpeCCKR('gable', 5, 50, 20).neg, -1.6); near(cpeCCKR('gable', 4, 1, 5).neg, -2.2 * 0.9, 1e-12, 'θ ≤ 10° wall −10%')
assert.throws(() => cpeCCKR('mono', 1, 5, 35), /5\.8/); n++
near(zoneWidthKR(8.6, 24), 2.4); near(zoneWidthKR(3, 60), 2.4, 1e-12, '0.04 × 60 governs'); near(zoneWidthKR(2, 10), 1.0, 1e-12, '1 m floor')
{
  const sp0 = defaultSpecFor('KR'), G0 = portalGeometry(sp0), q = ccVelocityKR(sp0, info), cc = krCCLoads(sp0, g.m, info)
  near(q, info.wind.qh, 1e-12, 'exposure C sample: C&C q_H = MWFRS q_H')
  const lg = Math.log10
  const Ap = 6 * G0.sRoof, Ag = 6 * G0.gWall
  const pur = [...cc.entries()].filter(([id]) => g.m.elements[id - 1].role === 'purlin'), gir = [...cc.entries()].filter(([id]) => g.m.elements[id - 1].role === 'girt')
  const z3 = pur.find(([, c]) => c.zone === 3)![1], z1 = pur.find(([, c]) => c.zone === 1)
  near(z3.A, Ap, 1e-9, 'A_C = bay × purlin spacing')
  near(z3.pNeg, q * (-6 + 3.75 * lg(Ap)), 1e-9, 'purlin corner p− = q_H·Cpe③ (Cpi+ 0, wallsLeaky)')
  near(z3.pPos, 0.675, 1e-12, 'purlin p+ = q·0.8 < 675 N/m² → floor')
  const g4 = gir.find(([, c]) => c.zone === 4)![1]
  near(g4.pPos, q * (0.9 * (2.0 - 0.6 * lg(Ag / 2) / lg(25)) + 0.8), 1e-9, 'girt p+ = q(0.9·Cpe④⑤ − Cpi−)')
  near(g4.pNeg, q * 0.9 * (-2.2 + 0.6 * lg(Ag) / lg(50)), 1e-9, 'girt p− = q·0.9·Cpe④')
  const [id1, c1] = z1!, e1 = g.m.elements[id1 - 1], wD = (sp0.roofDead * G0.sRoof + 77 * sectionProps(e1.section,'KR').A * 1e-6) * Math.cos(G0.theta)
  near(c1.demands.find((x) => x.combo.endsWith('1.7-6'))!.f.Mx, Math.abs(0.9 * wD + c1.pNeg * G0.sRoof) * 36 / 8, 1e-9, '1.7-6 Mx = |0.9D + W−|·L²/8')
  ok(pur.every(([, c]) => c.demands.length === 3) && gir.every(([, c]) => c.demands.length === 2), 'purlin 1.7-3/4/6, girt 1.7-4/6')
  ok(d.cc?.length === 5 && d.cc.reduce((t, c) => t + c.count, 0) === pur.length + gir.length, 'design C&C summary: 3 roof + 2 wall zones, every purlin/girt')
  /* 설계 반영 — 외장재 요구 강도비 ≤ 부재 강도비 */
  const m1 = d.members.find((m) => m.id === id1)!, sp1 = sectionProps(e1.section,'KR'), Fy1 = fyKR(sp0.secondaryMaterial ?? sp0.material, Math.max(sp1.tf, sp1.tw))
  const L1 = m1.lengths, cf1 = krCfCapacity(e1.section, sp1, Fy1, { Lx: L1.KLx, Ly: L1.KLy, Lt: L1.Lb, Lb: L1.Lb, Lm: L1.Lb }, 1)
  const ccR = Math.max(...c1.demands.map((x) => krCfCheck(cf1, x.f, x.braced).ratio))
  ok(m1.ratio >= ccR - 1e-12, `purlin ratio ${m1.ratio.toFixed(3)} ≥ C&C ${ccR.toFixed(3)}`)
  /* 하한 — 낮은 풍속에서 모든 |p| ≥ 0.675 */
  const low = { ...sp0, korea: { ...sp0.korea!, V0: 20 } }, ml = buildPortal(low)
  ok([...krCCLoads(low, ml, buildLoadPayloads(low, ml).info).values()].every((c) => c.pPos >= 0.675 && c.pNeg <= -0.675), '|W_C/A_C| ≥ 675 N/m² (5.4(2))')
  /* 큰 개구부(탁월 개구부 2) 에서 외장재 하중이 지배 */
  const open = { ...sp0, korea: { ...sp0.korea!, cpi: 'dominant2' as const, V0: 40 } }, mo = buildPortal(open), io = buildLoadPayloads(open, mo).info
  const dOpen = runDesign(open, mo, io, krSynthetic(open).results)
  ok(/^C&C/.test(dOpen.byRole.purlin!.combo) || /^C&C/.test(dOpen.byRole.girt!.combo), `C&C governs with dominant opening (purlin ${dOpen.byRole.purlin!.combo}, girt ${dOpen.byRole.girt!.combo})`)
  /* 적용범위 — 표 5.8-1(H ≥ 20 m)·편지붕 30° 초과는 막음 */
  ok(checkScope({ ...sp0, frame: 'mono', roofSlope: 0.7 }).blocked, 'mono > 30° blocked (table 5.8-3)')
  ok(checkScope({ ...sp0, eaveHeight: 18, span: 60, roofSlope: 0.3 }).blocked, 'H ≥ 20 m blocked (table 5.8-1 not implemented)')
}

/* ⑦ 접합 강도 (KDS 14 31 25) — 손계산 고정점 */
{
  const Ab24 = Math.PI * 24 ** 2 / 4, Ab20 = Math.PI * 20 ** 2 / 4
  near(boltKR(24).phiRt, 0.75 * 750 * Ab24 / 1e3, 1e-9, 'F10T M24 φFnt·Ab (4.1-6)'); near(boltKR(20).phiRv, 0.75 * 400 * Ab20 / 1e3, 1e-9, 'F10T M20 φFnv·Ab')
  near(boltKR(24, 0.19 * 0.75 * 400 * Ab24 / 1e3).phiRt, boltKR(24).phiRt, 1e-9, 'fv ≤ 20% → interaction ignored (4.1.3.4(3))')
  { const v = 60, fv = v * 1e3 / Ab24; near(boltKR(24, v).phiRt, 0.75 * Math.min(750, 1.3 * 750 - 750 / (0.75 * 400) * fv) * Ab24 / 1e3, 1e-9, "F'nt = 1.3Fnt − Fnt/(φFnv)·fv (4.1-8)") }
  near(slipKR(20), 0.5 * 165, 1e-12, 'slip μ0.5·T0 (4.1-12)'); near(slipKR(22, 50), 0.5 * 200 * (1 - 50 / 200), 1e-12, 'ks = 1 − Tu/T0 (4.1-13)')
  near(anchorKR(24, 400).phiRt, 0.75 * 300 * Ab24 / 1e3, 1e-9, 'anchor 4.6: Fnt 300 (table 4.1-9)')
  near(concreteBearingKR(27, 1, 9), 0.65 * 0.85 * 27 * 2, 1e-12, 'bearing √(A2/A1) ≤ 2 (4.1-26)')
  near(filletKR(6, 566, 420), 0.75 * 0.6 * 420 * 0.7 * 6 * (566 - 12) / 1e3, 1e-9, 'fillet: throat 0.7s, length − 2s (4.1.2.2.1)')
  near(flangeBendKR(17, 265, true), 0.9 * 6.25 * 17 ** 2 * 265 * 0.5 / 1e3, 1e-9, 'flange bending 50% at member end (4.1.10.1(3))')
  near(panelKR(265, 600, 11, 0.5 * 265 * 10000 / 1e3, 265 * 10000 / 1e3), 0.9 * 0.6 * 265 * 600 * 11 * 0.9 / 1e3, 1e-9, 'panel Pr > 0.4Pc → ×(1.4 − Pr/Pc) (4.1-37)')
  ok(holeKR(22) === 24 && holeKR(24) === 27, 'standard holes table 4.1-1')
  const cs = runConnections(spec, g.m, info, res)
  ok(['base', 'knee', 'apex', 'brace'].every((t) => cs.some((c) => c.type === t)) && cs.find((c) => c.type === 'base')!.notes.includes('krFoundation'), 'KR connections: base/knee/apex/brace, foundation anchorage flagged')
}

/* ⑧ 지진력저항시스템 (KDS 41 17 00 표 6.2-1 · 14 31 60) */
{
  const gen = g.l.info
  ok(gen.kr!.sys.X.R === 3 && gen.kr!.sys.Y.Cd === 3 && !Object.values(gen.comboKind ?? {}).includes('amplified'), 'default: general provisions R 3, no amplified combos')
  const sd = { ...spec, korea: { ...spec.korea!, systemX: 'OMF' as const, systemY: 'OCBF' as const } }, md = buildPortal(sd), ld = buildLoadPayloads(sd, md), id = ld.info
  ok(id.kr!.sys.X.R === 3.5 && id.kr!.sys.X.Om === 3 && id.kr!.sys.Y.R === 3.25 && id.kr!.sys.Y.Om === 2 && id.kr!.sys.Y.Cd === 3.25, 'OMF 3.5/3/3, OCBF 3.25/2/3.25')
  const csX = csKR(id.seismic.X.T, id.kr!.spectrum, 3.5, id.kr!.IE).c
  near(id.seismic.X.V, csX * id.seismic.W, 1e-9, 'V_X with R 3.5')
  const amp = Object.values<any>(ld['LCOM-GEN']).filter((c) => id.comboKind![c.NAME] === 'amplified')
  ok(amp.length > 0 && amp.length === 2 * Object.values<any>(ld['LCOM-GEN']).filter((c) => /^1\.7-5 /.test(c.NAME)).length, `amplified combos: A5 + A7 per seismic variant (${amp.length})`)
  const a5 = amp.find((c) => c.NAME.startsWith('A5 +EX') && c.vCOMB.some((v: any) => v.LCNAME === 'EY'))!
  near(a5.vCOMB.find((v: any) => v.LCNAME === 'D').FACTOR, 1.2 + 0.2 * id.kr!.spectrum.SDS, 1e-12, '(1.2 + 0.2S_DS)D (8.1-1)')
  near(a5.vCOMB.find((v: any) => v.LCNAME === 'EX').FACTOR, 3, 1e-12, 'Ω0,X·EX'); near(Math.abs(a5.vCOMB.find((v: any) => v.LCNAME === 'EY').FACTOR), 0.3 * 2, 1e-12, '0.3·Ω0,Y·EY (6.3 per-direction Ω0)')
  ok(amp.every((c) => c.NAME.length <= 20), 'amplified combo names ≤ 20 chars')
  const rs = krSynthetic(sd).results, dd = runDesign(sd, md, id, rs)
  ok(dd.members.every((m) => id.comboKind![m.combo] !== 'amplified' || m.eq === 'KDS 14 31 60 4.1.3'), 'amplified combos only in column 4.1.3 axial check')
  const knee = runConnections(sd, md, id, rs).find((c) => c.type === 'knee')!
  ok(/1\.1·Ry·Mp/.test(String(knee.dims.Mu)), 'OMF knee designed for 1.1RyMp (14 31 60 4.5.1)')
  const thin = { ...sd, sections: { ...sd.sections, brace: 'P 114.3x3.2' } }, mt = buildPortal(thin), it = buildLoadPayloads(thin, mt).info
  const br = runDesign(thin, mt, it, krSynthetic(thin).results).byRole.brace!
  near(br.ratio, (114.3 / 3.2) / (0.044 * 210000 / 275), 1e-9, 'OCBF pipe D/t ≤ 0.044E/Fy (P114.3x3.2 → NG)'); ok(br.eq === 'KDS 14 31 60 4.7 D/t', 'D/t governs')
}

/* ⑨ 냉간성형 립 C (KDS 41 30 30) — 표 4.13-1 플랜지 성질을 선요소 직접 적분으로 대조, 조합식·적용 한계 */
{
  const g = ccDims('LC-200x75x20x3.2'), t = g.t, b = g.B - t, dd = g.C - t / 2
  /* 플랜지(x 0→b, y 0) + 립(x b, y 0→+d — 표 4.13-1 부호 규약) 선요소. xof·yof = 도심 → 플랜지 전단중심(립 모서리), hxf = 도심 → 웨브 접합 */
  const Af = (b + dd) * t, xc = (b * t * b / 2 + dd * t * b) / Af, yc = (dd * t * (dd / 2)) / Af
  const Ix = b * t ** 3 / 12 + b * t * yc ** 2 + t * dd ** 3 / 12 + dd * t * (dd / 2 - yc) ** 2
  const Iy = t * b ** 3 / 12 + b * t * (b / 2 - xc) ** 2 + dd * t * (b - xc) ** 2
  const Ixy = b * t * (b / 2 - xc) * (0 - yc) + dd * t * (b - xc) * (dd / 2 - yc)
  near(b - xc, b * b / (2 * (b + dd)), 1e-9, 'xof = b²/(2(b+d))'); near(-xc, -(b * b + 2 * dd * b) / (2 * (b + dd)), 1e-9, 'hxf = −(b² + 2db)/(2(b+d))')
  near(0 - yc, -(dd * dd) / (2 * (b + dd)), 1e-9, 'yof = −d²/(2(b+d))')
  near(Ix, t * (t * t * b * b + 4 * b * dd ** 3 + t * t * b * dd + dd ** 4) / (12 * (b + dd)), 1e-6 * Ix, 'Ixf (table 4.13-1)')
  near(Iy, t * (b ** 4 + 4 * dd * b ** 3) / (12 * (b + dd)), 1e-6 * Iy, 'Iyf (table 4.13-1, thin-wall)')
  near(Ixy, t * b * b * dd * dd / (4 * (b + dd)), 1e-6 * Math.abs(Ixy), 'Ixyf (table 4.13-1)')
  const d1 = distortionalKR(g, 'flexure', 1e5), d2 = distortionalKR(g, 'flexure', 0.5 * d1.Lcrd)
  ok(d1.L === d1.Lcrd && d2.Fcrd > d1.Fcrd && d1.Fcrd > 0, 'L = min(Lcrd, Lm); restraint closer than Lcrd raises Fcrd')
  const sp = sectionProps('LC-200x75x20x3.2'), cf = krCfCapacity('LC-200x75x20x3.2', sp, 275, { Lx: 6000, Ly: 2000, Lt: 2000, Lb: 2000, Lm: 2000 }, 1)
  near(cf.phiPnt, 0.9 * sp.A * 275 / 1e3, 1e-9, 'φt 0.90·Ag·Fy (4.2-1)')
  ok(cf.phiMnxBraced <= 0.9 * sp.Sx * 275 / 1e6 + 1e-9 && cf.phiMnxLTB <= cf.phiMnxBraced, 'φb 0.90 · Mn ≤ My, LTB ≤ braced')
  const f = { P: -10, Mx: 5, My: 0.2, V: 8 }, r = krCfCheck(cf, f, false)
  near(r.ratio, Math.max(10 / cf.phiPnc + 5 / (cf.phiMnxLTB * (1 - 10 / cf.PEx)) + 0.2 / (cf.phiMny * (1 - 10 / cf.PEy)), Math.hypot(5 / cf.phiMnlo, 8 / cf.phiVn)), 1e-12, '4.6-4 linear with B1 · 4.6-5')
  const rt = krCfCheck(cf, { P: 20, Mx: 5, My: 0, V: 0 }, true)
  near(rt.ratio, Math.max(5 / cf.phiMnxt + 20 / cf.phiPnt, 5 / cf.phiMnxBraced - 20 / cf.phiPnt, 5 / cf.phiMnlo), 1e-12, '4.6-1 / 4.6-2 tension + bending')
  ok(krCfCapacity('LC-300x60x10x1', sectionProps('LC-300x60x10x1'), 275, { Lx: 6000, Ly: 2000, Lt: 2000, Lb: 2000, Lm: 2000 }, 1).notes.includes('KDS 41 30 30 table 1.6-1 limits'), 'h/t ≥ 200 → table 1.6-1 note')
  const pr = d.byRole.purlin!
  ok(sectionProps(pr.section).kind === 'CC' && /^CF/.test(pr.cap.mxMode) && (/^KDS 4\.6/.test(pr.eq) || pr.eq === 'KL/r'), `default purlin LC checked by KDS 41 30 30 (${pr.section} ${pr.eq})`)
}

/* ⑩ KDS 17 10 00 (2024) — 지진구역 표 4.2-1·Z 표 4.2-2·S = Z × I (4.2-2), 지반증폭 표 4.2-8 */
{
  const gw = REGIONS_KR.filter((r) => r.key.startsWith('강원 '))
  ok(gw.length === 18 && gw.filter((r) => r.zone === '1').length === 7, 'Gangwon: 18 cities/counties, south 7 = zone I, north 11 = zone II')
  ok(REGIONS_KR.length === 15 + 18 + 1 && regionZoneKR('제주') === '2' && regionZoneKR('서울') === '1' && regionZoneKR('강원 춘천') === '2' && regionZoneKR('강원 강릉') === '1', 'table 4.2-1 zones')
  near(sMinKR('1'), 0.8 * 0.11 * 2, 1e-12, 'S ≥ 0.8·Z·2.0 (41 17 00 3.2)')
  const base = defaultSpecFor('KR')
  ok(checkScope({ ...base, korea: { ...base.korea!, region: '강원 춘천', zone: '1' } }).blocked, 'region/zone mismatch blocked')
  ok(!checkScope({ ...base, korea: { ...base.korea!, region: '강원 춘천', zone: '2', S: 0.14 } }).blocked, 'Chuncheon zone II, S 0.14 ok')
  ok(checkScope({ ...base, korea: { ...base.korea!, S: 0.15 } }).blocked, 'zone I S 0.15 < 0.176 blocked')
  /* KDS 17 10 00 표 4.2-8 (S ≤ 0.1 / 0.2 / 0.3) = 41 17 00 표 4.2-1·4.2-2 — S2~S5 */
  const t48: Record<string, [number[], number[]]> = { S2: [[1.4, 1.4, 1.3], [1.5, 1.4, 1.3]], S3: [[1.7, 1.5, 1.3], [1.7, 1.6, 1.5]], S4: [[1.6, 1.4, 1.2], [2.2, 2.0, 1.8]], S5: [[1.8, 1.3, 1.3], [3.0, 2.7, 2.4]] }
  for (const [site, [fa, fv]] of Object.entries(t48)) [0.1, 0.2, 0.3].forEach((S, i) => { const sp = spectrumKR(S, site as any); near(sp.Fa, fa[i], 1e-12, `${site} Fa S=${S}`); near(sp.Fv, fv[i], 1e-12, `${site} Fv S=${S}`) })
}
console.log(`KR passed: ${n} checks (KDS tables, KDS 14 31 10 hand calc, loads equilibrium, scope/input/Gen, synthetic design, cladding wind, connections, seismic systems, cold-formed, KDS 17 10 00 zones)`)
