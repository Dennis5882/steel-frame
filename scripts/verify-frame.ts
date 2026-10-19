/* 다층 강골조 오프라인 회귀 (Gen·키 불필요) — npm run verify 에 포함.
   1) 형상: 예제 절점 129 · 요소 284 · 지점 21 (docs/tutorial-cn-braced-frame.md)
   2) 원문 식 독립 재구현: E.0.1 표값, 表4.4.1 Q355(2019 勘误), 판폭두께비(예제 그림 5-13), C.0.1 φb(εk²), βz 8.4.3, 表5.1.4
   3) 고정 라이브 결과(scripts/fixtures/cn-frame.json.gz)로 부재 검토·층 검토 재현 → Gen 예제 목표와 대조 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { buildFrame } from '../src/frame/geometry'
import { TUTORIAL_SPEC } from '../src/frame/tutorial'
import { betaZ, frameCombos, gravityTotals, tgOf, windLoads } from '../src/frame/loads'
import { cnFrameStrength, flangeRatio, muNoSway, phiBeam, webRatio } from '../src/codes/cnFrameSteel'
import { designMembers, hSection, runFrameDesign } from '../src/frame/design'
import { storyReview } from '../src/frame/story'
import { framePayloads } from '../src/frame/gen'
import type { ElementForces } from '../src/frame/results'

let checks = 0
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++ }
const near = (a: number, b: number, tol: number, msg: string) => ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`)

/* 1) 형상 */
const spec = TUTORIAL_SPEC, model = buildFrame(spec)
const cnt = (r: string) => model.elements.filter((e) => e.role === r).length
ok(model.nodes.length === 129 && model.elements.length === 284 && model.supports.length === 21, 'tutorial counts 129/284/21')
ok(cnt('column') === 84 && cnt('beam') === 152 && cnt('brace') === 48, 'roles 84/152/48')
ok(model.floorArea === 288 && model.perimeter === 80, 'L-shape area 288 m², perimeter 80 m')
for (const e of model.elements.filter((x) => x.role === 'brace')) {
  const a = model.nodes[e.n1 - 1], b = model.nodes[e.n2 - 1]
  ok(a.level === b.level - 1 && Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - (e.axis === 'X' ? 3 : 2)) < 1e-9, `chevron brace ${e.id} spans half bay up one storey`)
}
const g = gravityTotals(spec, model)
ok(g.ll === 1872 && g.dlExceptSelf === 6176, 'gravity totals: LL 2·288·3 + 0.5·288; DL floors + 80 m edge')
const P = framePayloads(spec, model)
ok(P.combos.length === 22 && P.combos.every((c) => c.name.length <= 20), '22 combos, names ≤ 20 chars (Gen limit)')
ok(Object.keys(P.CNLD).length > 0 && Object.values(P.CNLD).every((v: any) => new Set(v.ITEMS.map((i: any) => i.LCNAME)).size === v.ITEMS.length), 'CNLD: one item per case per node')

/* 2) 원문 대조 */
const E01: [number, number, number][] = [[0, 0, 1], [0.05, 0, 0.99], [1, 1, 0.774], [0.5, 10, 0.685], [2, 3, 0.663], [10, 10, 0.549], [0.3, 0.2, 0.916]]
for (const [k1, k2, mu] of E01) near(muNoSway(k1, k2), mu, 0.0015, `GB 50017 表E.0.1 μ(K1=${k1},K2=${k2})`)
const q = cnFrameStrength('Q355B', 12), q2 = cnFrameStrength('Q355B', 20)
ok(q.f === 305 && q.fv === 175 && q.fy === 355 && q2.f === 295 && q2.fy === 345, 'GB 50017 表4.4.1 Q355 (2019 勘误)')
const beam = hSection('HW 200x200x8/12')
near(flangeRatio(beam), 6.917, 0.0005, 'B/tf (예제 그림 5-13)')
near(webRatio(beam), 18.75, 1e-9, 'Hw/tw (예제 그림 5-13)')
near(9 * Math.sqrt(235 / 355), 7.323, 0.0005, 'GB 50011 8.3.2 beam flange 9εk (예제 7.323)')
near(65 * Math.sqrt(235 / 355), 52.885, 0.0005, 'GB 50011 8.3.2 beam web 65εk (예제 52.885)')
/* C.0.1 독립 재구현: βb = 0.69 + 0.13ξ, φb = βb·4320/λy²·Ah/Wx·√(1+(λy t1/4.4h)²)·εk², φb' = 1.07 − 0.282/φb */
{
  const l1 = 6000, xi = l1 * beam.tf / (beam.bf * beam.d), bb = 0.69 + 0.13 * xi, ly = l1 / beam.iy, ek2 = 235 / 355
  const raw = bb * 4320 / ly ** 2 * beam.A * beam.d / beam.Wx * Math.sqrt(1 + (ly * beam.tf / (4.4 * beam.d)) ** 2) * ek2
  const phi = raw > 0.6 ? 1.07 - 0.282 / raw : raw
  near(phiBeam(beam, l1, 355, bb), phi, 1e-12, 'φb C.0.1 matches independent formula')
  /* 예제: 6 m 보, M = 101.58 kN·m (sLCB14) → Gen 비 0.912 */
  near(101.58e6 / (phi * beam.Wx * 305), 0.912, 0.002, 'tutorial beam LTB ratio 0.912 reproduced by hand')
}
ok(tgOf(spec.seismic) === 0.4, 'GB 50011 表5.1.4-2 二组 II → Tg 0.40 (예제)')
/* βz 8.4.3 독립 재구현 (B 지면, 고층건축) */
{
  const z = 14.4, H = 14.4, B = 16, T1 = 0.3947, w0 = 0.3, zeta = 0.02
  const x1 = Math.max(5, 30 / T1 / Math.sqrt(1 * w0)), R = Math.sqrt(Math.PI / (6 * zeta) * x1 ** 2 / (1 + x1 ** 2) ** (4 / 3))
  const rx = 10 * Math.sqrt(B + 50 * Math.exp(-B / 50) - 50) / B, rz = 10 * Math.sqrt(H + 60 * Math.exp(-H / 60) - 60) / H
  const muz = 1 + (1.13 - 1) * (z - 10) / 5, Bz = 0.67 * H ** 0.187 * rx * rz * 1.0 / muz
  near(betaZ(z, H, B, T1, w0, 'B', zeta), 1 + 2 * 2.5 * 0.14 * Bz * Math.sqrt(1 + R * R), 1e-9, 'GB 50009 8.4.3 βz at roof')
  const w = windLoads(spec, model, 'X')
  ok(w.stories.every((s) => s.betaz >= 1.2), 'GB 55001 4.6.5 βz ≥ 1.2')
  near(w.T1, 0.22 + 0.035 * 14.4 / 24 ** (1 / 3), 1e-12, 'wind T1 formula (예제 0.4)')
}

/* 3) 고정 라이브 결과 */
const fx = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/cn-frame.json.gz', import.meta.url))).toString())
const forces: ElementForces = new Map(fx.forces.map(([id, loads]: [number, [string, number[][]][]]) =>
  [id, new Map(loads.map(([l, st]) => [l, st.map(([N, Vx, Vy, Mx, My]) => ({ N, Vx, Vy, Mx, My }))]))]))
ok(forces.size === 284, 'fixture has all 284 elements')
const eq = fx.equilibrium
for (const k of ['DL', 'LL', 'WX', 'WY']) near(eq[k].gen, eq[k].app, Math.abs(eq[k].app) * 1e-5, `live equilibrium ${k}`)
const members = designMembers(spec, model, fx.colStrongAxis)
const design = runFrameDesign(spec, members, forces, frameCombos().map((c) => ({ name: c.name, seismic: c.seismic })))
near(design.byRole.beam!.ratio, 0.912, 0.01, 'beam max ratio vs Gen tutorial 0.912')
ok(design.byRole.beam!.worst.governing === 'ltb', 'beam governed by LTB (6.2.3) as in tutorial')
ok(design.byRole.column!.ratio < 1, 'columns pass')
/* 가새: GB 50011 8.4.1 세장비 120εk = 97.6 초과 (예제 단면 HW150, λ ≈ 143) → 구조 규정 NG 로 표시되어야 함 */
ok(design.byRole.brace!.detailRatio > 1.4, 'brace slenderness NG flagged (GB 50011 8.4.1)')
const s = fx.story
const sx = s.shearX.find((r: any) => r.Story === '1F'), sy = s.shearY.find((r: any) => r.Story === '1F')
near(+sx['Shear Force/X'], 515.23, 515.23 * 0.005, 'RX base shear vs tutorial')
near(+sx['Story Shear Force Coefficient/X'], 0.06732, 0.0002, 'RX shear-weight ratio vs tutorial')
near(+sy['Story Shear Force Coefficient/Y'], 0.03658, 0.0002, 'RY shear-weight ratio vs tutorial')
near(fx.eigen.periods[0], 1.044, 0.005, 'T1 vs tutorial 1.044 s')
const review = storyReview(spec, model, s, fx.colStrongAxis)
const drift = review.find((i) => i.key === 'drift' && i.dir === 'X')!
const d1 = drift.rows.find((r) => r.story === '1F')!
near(1 / d1.value, 2357, 15, 'RX 1F drift 1/2357 (tutorial)')
ok(drift.rows.length === 4 && drift.rows.some((r) => r.note), 'drift: top storey filled from STORY_DISPLACEMENT')
ok(review.find((i) => i.key === 'torsion' && i.dir === 'X')!.status !== 'ok', 'torsion ratio > 1.2 flagged (L-plan, tutorial table also irregular)')
ok(review.find((i) => i.key === 'shearWeight' && i.dir === 'X')!.status === 'ok', 'shear-weight ≥ 0.016')

console.log(`Frame (CN): ${checks} checks passed (tutorial geometry, GB 50017/50011/50009 originals, live fixture beam ${design.byRole.beam!.ratio.toFixed(3)} vs 0.912, T1 ${fx.eigen.periods[0]} s)`)
