/* 대만(TW) 오프라인 회귀 — Gen·키 불필요.
   1) 손계산 대조: 원문 식을 여기서 SI 단위로 따로 계산해 앱 함수(tf·cm 내부 계산)와 비교 + 교과서·표 값 고정점
   2) 하중 평형: 지붕 활하중 합 = q·B·L, 지진 절점하중 합 = V, 케이스 15·조합 55
   3) 기준 모델 정답 세트: 라이브 Gen 결과(fixtures/tw-sample.json.gz)로 설계·접합 검토를 다시 돌려 부재 410개 강도비·사용성·접합 치수를 정답과 대조
      Gen 반력 합도 손계산(q·B·L, V)과 대조.
   실행: node --import tsx scripts/verify-tw.ts [--update]  (--update = 설계식을 의도적으로 바꿨을 때 정답만 갱신) */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { capacity, cbOf, check, b2Of, kSway } from '../src/codes/twSteel'
import { f10t, anchorRod, filletPerMm, concreteBearing } from '../src/codes/twConnection'
import { saD, fu, mod, seismicCoef, windQ, period, wallCpLeeward, roofCp } from '../src/codes/twLateral'
import { sectionProps } from '../src/domain/sections'
import { DEFAULT_SPEC } from '../src/domain/types'
import { buildPortal } from '../src/domain/portal'
import { buildLoadPayloads } from '../src/domain/loads'
import { FIXTURE, decodeResults, golden, type EncodedResults, type Golden } from './tw-golden'

let n = 0
const near = (a: number, b: number, rel: number, what: string) => {
  n++
  assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-12), `${what}: app ${a} vs hand ${b} (tol ${rel * 100}%)`)
}
const eq = <T>(a: T, b: T, what: string) => { n++; assert.deepEqual(a, b, what) }

/* ── 1. 손계산 대조 ───────────────────────────────── */
const E = 200000, Fy = 235 // SN400B (MPa)

/* 1-1 단면 성질 RH 400x200x8x13 (필렛 무시) */
const sp = sectionProps('RH 400x200x8x13')
const [d, bf, tw, tf] = [400, 200, 8, 13], hw = d - 2 * tf
near(sp.A, 2 * bf * tf + hw * tw, 1e-9, 'A = 2·bf·tf + h·tw = 8192 mm²')
near(sp.A, 8192, 1e-9, 'A table value')
near(sp.Ix, (bf * d ** 3 - (bf - tw) * hw ** 3) / 12, 1e-9, 'Ix')
near(sp.Ix, 229_648_683, 1e-6, 'Ix ≈ 2.2965e8 mm⁴')
near(sp.Zx, bf * tf * (d - tf) + (tw * hw ** 2) / 4, 1e-9, 'Zx = 1,285,952 mm³')
near(sp.Iy, (2 * tf * bf ** 3) / 12 + (hw * tw ** 3) / 12, 1e-9, 'Iy')

/* 1-2 φMp (7.2, Lb ≤ Lp, 조밀) = 0.9·Fy·Zx */
const short = capacity(sp, Fy, E, { KLx: 1000, KLy: 1000, Lb: 1000 }, 1, 0)
eq(short.compact, 'compact', 'RH400x200: compact (b/t 7.7 < 17/√Fy)')
eq(short.mxMode, 'Mp', 'Lb 1 m ≤ Lp → Mp')
near(short.phiMnx, (0.9 * Fy * sp.Zx) / 1e6, 1e-9, 'φMp = 0.9·Fy·Zx')
near(short.phiMnx, 271.98, 1e-4, 'φMp ≈ 271.98 kN·m')
/* Lp = 80·ry/√Fy (Fy tf/cm²) — 1 m 아래 위 경계 */
const FyT = Fy / 98.0665, ry = Math.sqrt(sp.Iy / sp.A)
const Lp = (80 * (ry / 10)) / Math.sqrt(FyT) * 10 // mm
near(Lp, 2378, 2e-3, 'Lp = 80ry/√Fy ≈ 2.38 m')
eq(capacity(sp, Fy, E, { KLx: 1000, KLy: 1000, Lb: Lp * 0.999 }, 1, 0).mxMode, 'Mp', 'Lb just below Lp → Mp')
eq(capacity(sp, Fy, E, { KLx: 1000, KLy: 1000, Lb: Lp * 1.01 }, 1, 0).mxMode, 'LTB-inelastic', 'Lb just above Lp → inelastic LTB')

/* 1-3 φVn (7.3, h/tw ≤ 50√(kv/Fy)) = 0.9·0.6·Fy·d·tw */
near(short.phiVn, (0.9 * 0.6 * Fy * d * tw) / 1000, 1e-9, 'φVn = 0.9·0.6·Fy·d·tw = 406.08 kN')

/* 1-4 φPn (6.2) KL = 6 m 양축 — λc = KL/(πr)·√(Fy/E), Fcr = exp(−0.419λc²)·Fy */
const col = capacity(sp, Fy, E, { KLx: 6000, KLy: 6000, Lb: 6000 }, 1, 0)
const lc = (6000 / ry / Math.PI) * Math.sqrt(Fy / E)
near(col.lambdaC, lc, 1e-9, 'λc')
near(lc, 1.4227, 1e-3, 'λc ≈ 1.423 (≤ 1.5 → 비탄성)')
near(col.phiPnc, (0.85 * sp.A * Math.exp(-0.419 * lc ** 2) * Fy) / 1000, 1e-9, 'φPn = 0.85·Ag·Fcr')
near(col.phiPnc, 700.4, 2e-3, 'φPn ≈ 700 kN')
/* 탄성 (λc > 1.5): KL = 8 m → Fcr = 0.877Fy/λc² */
const col8 = capacity(sp, Fy, E, { KLx: 8000, KLy: 8000, Lb: 8000 }, 1, 0), lc8 = (8000 / ry / Math.PI) * Math.sqrt(Fy / E)
near(col8.phiPnc, (0.85 * sp.A * (0.877 / lc8 ** 2) * Fy) / 1000, 1e-9, 'φPn elastic = 0.85·Ag·0.877Fy/λc²')
/* 인장 (5) φPn = 0.9·Fy·Ag */
near(col.phiPnt, (0.9 * Fy * sp.A) / 1000, 1e-9, 'φPnt = 0.9·Fy·Ag')

/* 1-5 상호작용 (8.2-1a/b) */
const ra = check(col, { P: -0.5 * col.phiPnc, Mx: 0.3 * col.phiMnx, My: 0, V: 0 })
near(ra.ratio, 0.5 + (8 / 9) * 0.3, 1e-9, '8.2-1a: Pu/φPn + 8/9·Mu/φMn = 0.7667'); eq(ra.eq, '8.2-1a', 'eq 8.2-1a')
const rb = check(col, { P: -0.1 * col.phiPnc, Mx: 0.5 * col.phiMnx, My: 0, V: 0 })
near(rb.ratio, 0.05 + 0.5, 1e-9, '8.2-1b: Pu/2φPn + Mu/φMn = 0.55'); eq(rb.eq, '8.2-1b', 'eq 8.2-1b')
near(check(col, { P: -0.3 * col.phiPnc, Mx: 0.2 * col.phiMnx, My: 0, V: 0 }, 1.25).ratio, 0.3 + (8 / 9) * 0.25, 1e-9, 'B 증폭 1.25 × Mu')

/* 1-6 Cb (해설 4분점 식) — 등분포 단순보 1.136, 한끝 0 직선 1.667, 균일 1.0 */
near(cbOf([0, 0.75, 1, 0.75, 0]), 12.5 / 11, 1e-9, 'Cb 등분포 = 1.136')
near(cbOf([0, 0.25, 0.5, 0.75, 1]), 12.5 / 7.5, 1e-9, 'Cb 삼각 = 1.667')
near(cbOf([1, 1, 1, 1, 1]), 1, 1e-9, 'Cb 균일 = 1.0')

/* 1-7 K (정렬도, 횡이동) — GA = GB = 1 → 1.32, GA = GB = 0 에 가까우면 1.0 */
near(kSway(1, 1), 1.316, 3e-3, 'K(GA=GB=1) ≈ 1.32 (alignment chart)')
near(kSway(10, 10), 3.0, 0.03, 'K(GA=GB=10) ≈ 3.0')

/* 1-8 B2 (8.2-5) = 1/(1 − ΣPu·Δ/(ΣH·L)) */
near(b2Of(1000, 0.01, 100, 5), 1 / (1 - 0.02), 1e-12, 'B2 = 1.0204')

/* 1-9 접합 (10장) — N·mm² 로 직접 */
const Ab22 = (Math.PI * 22 ** 2) / 4, Ab24 = (Math.PI * 24 ** 2) / 4
const tfcm2 = 98.0665 // 1 tf/cm² = 98.0665 MPa
near(f10t(22).phiRt, (0.75 * 7.5 * tfcm2 * Ab22) / 1000, 1e-9, 'F10T M22 φRt = 0.75·7.5 tf/cm²·Ab ≈ 209.7 kN')
near(f10t(22).phiRt, 209.7, 1e-3, 'F10T M22 φRt ≈ 209.7 kN')
near(f10t(22).phiRv, (0.75 * 4.0 * tfcm2 * Ab22) / 1000, 1e-9, 'F10T M22 φRv ≈ 111.8 kN')
/* 표10.3-3 조합: fv = 2 tf/cm² → Ft = 9.8 − 5 = 4.8 tf/cm² */
const v2 = (2 * tfcm2 * Ab22) / 1000
near(f10t(22, v2).phiRt, (0.75 * 4.8 * tfcm2 * Ab22) / 1000, 1e-9, '표10.3-3 Ft = 9.8 − 2.5fv')
near(anchorRod(24, 400).phiRt, (0.75 * 0.75 * 400 * Ab24) / 1000, 1e-6, 'anchor M24 φRt = 0.75·0.75Fu·Ab ≈ 101.8 kN')
near(anchorRod(24, 400).phiRv, (0.75 * 0.4 * 400 * Ab24) / 1000, 1e-6, 'anchor M24 φRv = 0.75·0.40Fu·Ab ≈ 54.3 kN')
near(filletPerMm(6, 490), (0.75 * 0.6 * 490 * 0.707 * 6) / 1000, 1e-12, 'fillet 6 mm = 0.935 kN/mm')
near(concreteBearing(27.5, 1, 4), 0.6 * 0.85 * 27.5 * 2, 1e-12, '지압 √(A2/A1) = 2 상한')
near(concreteBearing(27.5, 1, 9), 0.6 * 0.85 * 27.5 * 2, 1e-12, '지압 √(A2/A1) ≤ 2')

/* 1-10 지진 (2.2·2.9, 표2-5a) — SDS 0.6, SD1 0.35, R 3.2, T = 0.4 */
const T0 = 0.35 / 0.6, Ra = 1 + (3.2 - 1) / 1.5, r = Math.sqrt(2 * Ra - 1)
near(saD(0.4, 0.6, T0), 0.6, 1e-12, 'SaD 평탄부 = SDS')
near(saD(1.0, 0.6, T0), 0.35 / 1.0, 1e-12, 'SaD = SD1/T')
near(saD(0.05, 0.6, T0), 0.6 * (0.4 + 3 * 0.05 / T0), 1e-12, 'SaD 상승부')
near(fu(0.4, Ra, T0), r + ((Ra - r) * (0.4 - 0.6 * T0)) / (0.4 * T0), 1e-12, 'Fu (2-12) 보간')
near(fu(1.0, Ra, T0), Ra, 1e-12, 'Fu = Ra (T ≥ T0)')
near(mod(0.25), 0.25, 1e-12, '(SaD/Fu)m ≤ 0.3'); near(mod(0.5), 0.52 * 0.5 + 0.144, 1e-12, '(SaD/Fu)m 0.3~0.8'); near(mod(1), 0.7, 1e-12, '(SaD/Fu)m ≥ 0.8')
const sc = seismicCoef({ SDS: 0.6, SD1: 0.35, I: 1, R: 3.2, T: 0.4 })
near(sc.cV, mod(0.6 / fu(0.4, Ra, T0)) / 1.4, 1e-12, 'V/W = I/(1.4αy)·(SaD/Fu)m')
near(period('moment', 10), 0.085 * 10 ** 0.75, 1e-12, 'T = 0.085hn^¾')

/* 1-11 풍 (2.6) q = 0.06·K(z)·(I·V10)² kgf/m², K = 2.774(z/zg)^2α — 지況 C, z = 10 m, V10 = 37.5 */
const K10 = 2.774 * (10 / 300) ** 0.3
near(windQ(10, { V10: 37.5, I: 1, exposure: 'C' }), 0.06 * K10 * 37.5 ** 2 * 0.00980665, 1e-12, 'q(10) ≈ 0.827 kN/m²')
near(windQ(3, { V10: 37.5, I: 1, exposure: 'C' }), windQ(5, { V10: 37.5, I: 1, exposure: 'C' }), 1e-12, 'z < 5 m → 5 m')
near(wallCpLeeward(1.5), -0.4, 1e-12, '표2.4 풍하 Cp L/B 1.5 = −0.4')
near(roofCp({ thetaDeg: 10, hOverL: 0.3 }).high, 0.2, 1e-12, '표2.5 θ10 h/L 0.3 high +0.2')
near(roofCp({ thetaDeg: 10, hOverL: 0.3 }).low, -0.9, 1e-12, '표2.5 θ10 h/L 0.3 low −0.9')
const nHand = n

/* ── 2. 하중 평형 (기본 샘플) ─────────────────────── */
const spec = structuredClone(DEFAULT_SPEC), model = buildPortal(spec), loads = buildLoadPayloads(spec, model)
eq(model.nodes.length, 219, 'nodes 219'); eq(model.elements.length, 410, 'elements 410')
eq(Object.keys(loads.STLD).length, 15, 'cases 15'); eq(Object.keys(loads['LCOM-GEN']).length, 55, 'combos 55')
const node = new Map(model.nodes.map((x) => [x.id, x]))
const totals: Record<string, number[]> = {}
for (const [id, rec] of Object.entries(loads.BMLD)) {
  const e = model.elements.find((x) => x.id === +id)!, a = node.get(e.n1)!, b = node.get(e.n2)!
  const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  for (const p of (rec as { ITEMS: any[] }).ITEMS) { const o = (totals[p.LCNAME] ??= [0, 0, 0]); o[['GX', 'GY', 'GZ'].indexOf(p.DIRECTION)] += p.P[0] * L }
}
const BL = spec.span * spec.bays * spec.baySpacing
near(-totals.LR[2], loads.info.roofLive * BL, 1e-6, `LR 합 = q·B·L (${(loads.info.roofLive * BL).toFixed(1)} kN)`)
for (const lc of ['EX', 'EY'] as const) {
  const dir = lc === 'EX' ? 'FX' : 'FY'
  const s = Object.values(loads.CNLD).reduce((a: number, rec: any) => a + rec.ITEMS.filter((x: any) => x.LCNAME === lc).reduce((b: number, x: any) => b + x[dir], 0), 0)
  near(s, loads.info.seismic[lc === 'EX' ? 'X' : 'Y'].V, 1e-6, `${lc} 절점하중 합 = V`)
}
const nLoad = n - nHand

/* ── 3. 기준 모델 정답 세트 ──────────────────────── */
const fx = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString()) as { captured: string; spec: typeof spec; reactions: { lc: string; fx: number; fy: number; fz: number }[]; results: EncodedResults; golden: Golden }
eq(JSON.stringify(fx.spec), JSON.stringify(spec), 'fixture spec = 현재 DEFAULT_SPEC (기본값을 바꿨으면 capture-tw-golden 재실행)')
const res = decodeResults(fx.results)
const now = golden(spec, res)
if (process.argv.includes('--update')) {
  writeFileSync(FIXTURE, gzipSync(JSON.stringify({ ...fx, golden: now })))
  console.log('golden updated (design/connection answers only; Gen results unchanged)')
}
const G = process.argv.includes('--update') ? now : fx.golden
/* Gen 반력 합 vs 손계산 — Gen 이 하중을 그대로 받았는지 */
const rx = (lc: string) => fx.reactions.find((x) => x.lc === lc)!
near(Math.abs(rx('LR').fz), loads.info.roofLive * BL, 1e-4, 'Gen LR 반력 = q·B·L')
near(Math.abs(rx('EX').fx), loads.info.seismic.X.V, 1e-4, 'Gen EX 반력 = V_X')
near(Math.abs(rx('EY').fy), loads.info.seismic.Y.V, 1e-4, 'Gen EY 반력 = V_Y')
/* 설계·접합 — 부재 410 개 강도비, 지배 조합·식 */
eq(now.members.length, G.members.length, 'member count')
const diffs = now.members.filter((m, i) => JSON.stringify(m) !== JSON.stringify(G.members[i]))
eq(diffs.slice(0, 5), [], `members differ from golden (${diffs.length}) — 의도한 변경이면 --update`)
n += now.members.length - 1
eq(now.summary, G.summary, 'summary (max ratio, NG, by role, serviceability, connections)')
eq(now.conns, G.conns, 'connection dims and per-item ratios')

console.log(`TW verify: ${n} checks passed (hand ${nHand}, load balance ${nLoad}, golden ${n - nHand - nLoad} incl. ${now.members.length} members)`)
console.log(`  fixture ${fx.captured.slice(0, 10)} · max ${G.summary.maxRatio} · NG ${G.summary.ng} · conns ${G.summary.conns.map((c) => `${c.type} ${c.ratio.toFixed(3)}`).join(', ')}`)
