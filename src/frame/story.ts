/* 층 검토 지표 (CN) — Gen 층 결과 표(RS) + 앱 계산을 GB 한계와 비교. 판정은 앱이 한다(Gen 표의 Remark 는 RC 기본값 등이라 쓰지 않음).
   - 층간변위각    GB 50011 5.5.1 표5.5.1 多、高层钢结构 1/250 (STORY_DRIFT 최대; 표에서 빠지는 최상층은 STORY_DISPLACEMENT 로 보완)
   - 扭转位移比   GB 50011 3.4.3 표3.4.3-1 (>1.2 不规则), 3.4.4-1 (≤1.5 권장 상한) — TORSIONAL_IRREGULARITY (우발편심 RS)
   - 侧向刚度     GB 50011 3.4.3 표3.4.3-2 K_i ≥ 0.7 K_{i+1}, ≥ 0.8 평균(K_{i+1..i+3}) — STIFFNESS_IRREGULARITY 층강성(전단/질량중심 변위)
   - 楼层承载力   GB 50011 3.4.3 표3.4.3-2 V_i ≥ 0.8 V_{i+1} — 앱 계산 층 수평내력(기둥 전단 + 가새 수평분력)
   - 剪重比       GB 50011 5.2.5 표5.2.5 λ_min (T1 < 3.5 s)
   - 质量比       JGJ 3-2010 3.5.6 (참고): 楼层质量 ≤ 1.5 × 아래층
   - 二阶效应     GB 50017-2017 5.1.6: θ = ΣN·Δu/(ΣH·h) ≤ 0.1 이면 1차 해석 허용
   - 有效质量     GB 50011 5.2.2 条文说明: 누적 ≥ 90% (EIGENVALUEMODE 참여질량) */
import { bucklingPhi } from '../codes/cnSteel'
import { cnFrameStrength, curvesOf } from '../codes/cnFrameSteel'
import { hSection } from './design'
import { elementLength } from './geometry'
import { LAMBDA_MIN } from './loads'
import { n } from './results'
import type { FrameModel, FrameSpec } from './types'

export type StoryStatus = 'ok' | 'warn' | 'ng' | 'na'
export interface StoryRow { story: string; value: number; limit: number; status: StoryStatus; note?: string }
export interface StoryItem { key: string; clause: string; dir?: 'X' | 'Y'; rows: StoryRow[]; status: StoryStatus }

type Rows = Record<string, string>[]
export interface StoryTables {
  mass?: Rows; shearX?: Rows; shearY?: Rows; driftX?: Rows; driftY?: Rows; dispX?: Rows; dispY?: Rows
  stiffX?: Rows; stiffY?: Rows; torsionX?: Rows; torsionY?: Rows
  eigen?: { periods: number[]; massX: number[]; massY: number[] } | null
}

const worst = (rows: StoryRow[]): StoryStatus => rows.some((r) => r.status === 'ng') ? 'ng' : rows.some((r) => r.status === 'warn') ? 'warn' : rows.length ? 'ok' : 'na'

/** 층 이름 순서 (아래 → 위): spec.storyNames[0..ns-1] 이 층, 마지막은 지붕 레벨. Gen 은 RF 를 'Roof' 로 바꿈 */
const storyOrder = (spec: FrameSpec) => spec.storyNames.slice(0, -1)

/** EIGENVALUEMODE 원본 응답에서 주기·누적 참여질량 */
export function parseEigen(resp: any): StoryTables['eigen'] {
  const subs: any[] = resp?.SUB_TABLES ?? []
  const pick = (name: string) => subs.map((s) => s[name]).find(Boolean)
  const ev = pick('EIGENVALUE ANALYSIS'), pm = pick('MODAL PARTICIPATION MASSES PRINTOUT (1)')
  if (!ev?.DATA) return null
  const periods = ev.DATA.map((d: string[]) => n(d[3]))
  const iX = pm?.HEAD?.indexOf('TRAN-XSUM(%)') ?? -1, iY = pm?.HEAD?.indexOf('TRAN-YSUM(%)') ?? -1
  return { periods, massX: pm?.DATA?.map((d: string[]) => n(d[iX])) ?? [], massY: pm?.DATA?.map((d: string[]) => n(d[iY])) ?? [] }
}

/** 방향별 층 수평내력 (kN, 앱 계산): 기둥 웨브/플랜지 전단 + 가새 수평분력 φAf·cosθ (압축 가새 기준, 인장 가새도 같은 값으로 보수 산정) */
export function storyShearCapacity(spec: FrameSpec, model: FrameModel, dir: 'X' | 'Y', colStrongAxis: 'X' | 'Y'): number[] {
  const out: number[] = []
  for (let k = 1; k < model.levels.length; k++) {
    let V = 0
    for (const e of model.elements) {
      if (e.story !== k) continue
      const s = hSection(e.section), st = cnFrameStrength(spec.material, Math.max(s.tw, s.tf))
      if (e.role === 'column') {
        const strong = dir === colStrongAxis
        V += (strong ? (s.d - 2 * s.tf) * s.tw : 2 * s.bf * s.tf / 1.5) * st.fv / 1000
      } else if (e.role === 'brace' && e.axis === dir) {
        const a = model.nodes[e.n1 - 1], b = model.nodes[e.n2 - 1], L = elementLength(model, e)
        const cos = Math.abs(dir === 'X' ? b.x - a.x : b.y - a.y) / L
        const cv = curvesOf(s, spec.material), lam = L * 1000 / Math.min(s.ix, s.iy)
        const phi = bucklingPhi(lam, st.fy, 206000, s.iy <= s.ix ? cv.y : cv.x)
        V += phi * s.A * st.f / 1000 * cos
      }
    }
    out.push(V)
  }
  return out
}

export function storyReview(spec: FrameSpec, model: FrameModel, t: StoryTables, colStrongAxis: 'X' | 'Y'): StoryItem[] {
  const names = storyOrder(spec)
  const items: StoryItem[] = []
  const byStory = (rows: Rows | undefined, key = 'Story') => new Map((rows ?? []).map((r) => [r[key], r]))
  const h = spec.heights

  for (const dir of ['X', 'Y'] as const) {
    /* 층간변위각 */
    const drift = byStory(dir === 'X' ? t.driftX : t.driftY), disp = byStory(dir === 'X' ? t.dispX : t.dispY)
    const rows: StoryRow[] = []
    names.forEach((nm, i) => {
      const r = drift.get(nm)
      let v: number | null = r ? n(r['Maximum Drift of All Vertical Elements/Story Drift Ratio']) : null
      let note: string | undefined
      if (v === null) {
        const above = i + 1 < names.length ? disp.get(names[i + 1]) : disp.get('Roof') ?? disp.get(spec.storyNames[spec.storyNames.length - 1])
        const here = disp.get(nm)
        if (above && here) { v = Math.abs(n(above.MaximumDisplacement) - n(here.MaximumDisplacement)) / h[i]; note = 'from STORY_DISPLACEMENT' }
      }
      if (v !== null) rows.push({ story: nm, value: v, limit: 1 / 250, status: v <= 1 / 250 ? 'ok' : 'ng', note })
    })
    items.push({ key: 'drift', clause: 'GB 50011 5.5.1', dir, rows, status: worst(rows) })

    /* 扭转位移比 */
    const tor = dir === 'X' ? t.torsionX : t.torsionY
    const trows: StoryRow[] = (tor ?? []).map((r) => {
      const v = n(r['Maximum Value/Story Drift']) / Math.max(1e-12, n(r['Average Value of Extreme Points/Story Drift']))
      return { story: r.Story, value: v, limit: 1.2, status: v <= 1.2 ? 'ok' : v <= 1.5 ? 'warn' : 'ng', note: v > 1.2 ? 'torsionally irregular (3.4.3)' : undefined }
    })
    items.push({ key: 'torsion', clause: 'GB 50011 3.4.3 / 3.4.4', dir, rows: trows, status: worst(trows) })

    /* 侧向刚度 */
    const st = byStory(dir === 'X' ? t.stiffX : t.stiffY)
    const K = names.map((nm) => (st.get(nm) ? n(st.get(nm)!['Story Stiffness']) : NaN))
    const krows: StoryRow[] = []
    names.forEach((nm, i) => {
      if (!Number.isFinite(K[i]) || i === names.length - 1) return
      const up = K[i + 1], avg3 = K.slice(i + 1, i + 4).filter(Number.isFinite)
      const r1 = K[i] / (0.7 * up), r2 = avg3.length >= 3 ? K[i] / (0.8 * (avg3.reduce((a, b) => a + b, 0) / avg3.length)) : Infinity
      const v = Math.min(r1, r2)
      krows.push({ story: nm, value: v, limit: 1, status: v >= 1 ? 'ok' : 'warn', note: `K/0.7K_up ${r1.toFixed(3)}${Number.isFinite(r2) ? ` · K/0.8K_avg3 ${r2.toFixed(3)}` : ''}` })
    })
    items.push({ key: 'stiffness', clause: 'GB 50011 3.4.3 表3.4.3-2', dir, rows: krows, status: worst(krows) })

    /* 楼层承载力 */
    const cap = storyShearCapacity(spec, model, dir, colStrongAxis)
    const crows: StoryRow[] = []
    names.forEach((nm, i) => {
      if (i === names.length - 1) return
      const v = cap[i] / cap[i + 1]
      crows.push({ story: nm, value: v, limit: 0.8, status: v >= 0.8 ? 'ok' : 'warn', note: `V ${cap[i].toFixed(0)} / V_up ${cap[i + 1].toFixed(0)} kN` })
    })
    items.push({ key: 'capacity', clause: 'GB 50011 3.4.3 表3.4.3-2', dir, rows: crows, status: worst(crows) })

    /* 剪重比 */
    const sh = dir === 'X' ? t.shearX : t.shearY, lmin = LAMBDA_MIN[spec.seismic.intensity]
    const srows: StoryRow[] = (sh ?? []).map((r) => {
      const v = n(r[`Story Shear Force Coefficient/${dir}`])
      return { story: r.Story, value: v, limit: lmin, status: v >= lmin ? 'ok' : 'ng' }
    })
    items.push({ key: 'shearWeight', clause: 'GB 50011 5.2.5', dir, rows: srows, status: worst(srows) })

    /* 二阶效应 θ = ΣN Δu / (ΣH h) — ΣN = 위 층 중력대표값(Weight Sum), ΣH = 층전단, Δu = 질량중심 층간변위 */
    const prow: StoryRow[] = []
    const shear = byStory(sh)
    names.forEach((nm, i) => {
      const s = shear.get(nm), d = drift.get(nm)
      if (!s || !d) return
      const theta = n(s[`Weight Sum/${dir}`]) * n(d['Drift at the Center of Mass/Story Drift']) / (n(s[`Shear Force/${dir}`]) * h[i])
      prow.push({ story: nm, value: theta, limit: 0.1, status: theta <= 0.1 ? 'ok' : 'warn' })
    })
    items.push({ key: 'pDelta', clause: 'GB 50017 5.1.6', dir, rows: prow, status: worst(prow) })
  }

  /* 质量比 (아래층 대비) — 지반층 제외 */
  const mass = byStory(t.mass), mrows: StoryRow[] = []
  const levelName = (k: number) => (k === spec.storyNames.length - 1 ? 'Roof' : spec.storyNames[k])
  for (let k = 2; k < spec.storyNames.length; k++) {
    const m = mass.get(levelName(k)) ?? mass.get(spec.storyNames[k]), lo = mass.get(levelName(k - 1))
    if (!m || !lo) continue
    const v = n(m['X-DIR']) / n(lo['X-DIR'])
    mrows.push({ story: levelName(k), value: v, limit: 1.5, status: v <= 1.5 ? 'ok' : 'warn' })
  }
  items.push({ key: 'mass', clause: 'JGJ 3-2010 3.5.6', rows: mrows, status: worst(mrows) })

  /* 유효질량 */
  if (t.eigen && t.eigen.massX.length) {
    const ex = t.eigen.massX[t.eigen.massX.length - 1], ey = t.eigen.massY[t.eigen.massY.length - 1]
    const rows: StoryRow[] = [
      { story: 'X', value: ex / 100, limit: 0.9, status: ex >= 90 ? 'ok' : 'ng' },
      { story: 'Y', value: ey / 100, limit: 0.9, status: ey >= 90 ? 'ok' : 'ng' },
    ]
    items.push({ key: 'effMass', clause: 'GB 50011 5.2.2', rows, status: worst(rows) })
  } else items.push({ key: 'effMass', clause: 'GB 50011 5.2.2', rows: [], status: 'na' })
  return items
}
