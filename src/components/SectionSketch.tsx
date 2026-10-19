import type { CodeId } from '../codes/types'
import { profileOf } from '../codes'
import { sectionProps, type SectionProps } from '../domain/sections'
import { t } from '../i18n'

/** CC 립 길이는 성질 레코드에 없어서 이름에서 읽는다 ('CC 150x65x20/3.2', 'LC-150x65x20x3.2'). */
const lipOf = (name: string) => Number(name.trim().match(/^(?:CC\s+|LC-)\d[\d.]*x\d[\d.]*x(\d[\d.]*)/)?.[1] ?? 0)

/** Scaled outline with key dimensions, beside the properties used by the checks. Drawing only — not a fabrication detail. */
export function SectionSketch({ name, code, material }: { name: string; code: CodeId; material: string }) {
  let p: SectionProps
  try { p = sectionProps(name, code) } catch { return null }
  // 입력 중인 이름('RH 400x200')은 오류 대신 NaN 치수가 된다 — 완전한 치수일 때만 그린다
  if (![p.d, p.bf, p.tw, p.tf, p.A, p.Ix, p.Iy].every((v) => Number.isFinite(v) && v > 0) || (p.kind !== 'P' && p.d <= 2 * p.tf) || (p.kind === 'P' && p.d <= 2 * p.tw)) return null
  // 물량표(schedule)와 같은 단위중량: γ(kN/m³)·A → kg/m
  const gamma = profileOf(code).materials[material]?.gamma
  const W = 132, Hh = 132, pad = 22
  const s = Math.min((W - 2 * pad) / p.bf, (Hh - 2 * pad) / p.d)
  const cx = W / 2, cy = Hh / 2, d = p.d * s, b = p.bf * s
  // 아주 얇은 판도 보이게 최소 두께를 둔다 (그림용)
  const tw = Math.max(p.tw * s, 1.2), tf = Math.max(p.tf * s, 1.2)
  const x0 = cx - b / 2, y0 = cy - d / 2
  let shape: string
  if (p.kind === 'H') {
    shape = `M${x0} ${y0}h${b}v${tf}h${-(b - tw) / 2}v${d - 2 * tf}h${(b - tw) / 2}v${tf}h${-b}v${-tf}h${(b - tw) / 2}v${-(d - 2 * tf)}h${-(b - tw) / 2}Z`
  } else if (p.kind === 'CC') {
    const c = Math.max(lipOf(name) * s, tf)
    shape = `M${x0 + b} ${y0}h${-b}v${d}h${b}v${-c}h${-tw}v${c - tf}h${-(b - 2 * tw)}v${-(d - 2 * tf)}h${b - 2 * tw}v${c - tf}h${tw}Z`
  } else {
    const r = d / 2
    shape = `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0ZM${cx - r + tw} ${cy}a${r - tw} ${r - tw} 0 1 1 ${2 * (r - tw)} 0a${r - tw} ${r - tw} 0 1 1 ${-2 * (r - tw)} 0Z`
  }
  const mm = (v: number) => +v.toFixed(1)
  const rows: [string, string, string][] = [
    ['A', (p.A / 100).toFixed(1), 'cm²'],
    ['Ix', (p.Ix / 1e4).toFixed(0), 'cm⁴'],
    ['Iy', (p.Iy / 1e4).toFixed(0), 'cm⁴'],
    ['Sx', (p.Sx / 1e3).toFixed(0), 'cm³'],
    // 치수 계산 냉간성형은 Zx 자리에 탄성계수가 들어 있다 — 소성 Zx 로 보이지 않게 뺀다
    ...(p.kind === 'CC' && p.source !== 'gen-db' ? [] : [['Zx', (p.Zx / 1e3).toFixed(0), 'cm³'] as [string, string, string]]),
    ['rx / ry', `${(p.rx / 10).toFixed(2)} / ${(p.ry / 10).toFixed(2)}`, 'cm'],
    ...(gamma ? [[t('section_unit_weight'), (gamma * p.A * 1e-6 * 1000 / 9.80665).toFixed(1), 'kg/m'] as [string, string, string]] : []),
  ]
  return <div className="section-sketch">
    <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={`${name} ${t('section_sketch')}`}>
      <path d={shape} fillRule="evenodd" className="section-sketch-shape" />
      {/* 춤(왼쪽)·폭(아래) 치수 */}
      <path d={`M${x0 - 9} ${y0}V${y0 + d}M${x0 - 12} ${y0}h6M${x0 - 12} ${y0 + d}h6${p.kind === 'P' ? '' : `M${x0} ${y0 + d + 9}H${x0 + b}M${x0} ${y0 + d + 6}v6M${x0 + b} ${y0 + d + 6}v6`}`} className="section-sketch-dim" />
      <text x={x0 - 12} y={cy} textAnchor="middle" transform={`rotate(-90 ${x0 - 12} ${cy})`} dy="-2">{p.kind === 'P' ? `Ø${mm(p.d)}` : mm(p.d)}</text>
      {p.kind !== 'P' && <text x={cx} y={y0 + d + 19} textAnchor="middle">{mm(p.bf)}</text>}
    </svg>
    {/* 대부분은 그림만 보면 된다 — 성질 표는 필요할 때 펼친다 */}
    <details className="section-sketch-info">
      <summary>{t('section_detail')}</summary>
      <small className="mono">{p.kind === 'H' ? `tw ${mm(p.tw)} · tf ${mm(p.tf)} mm` : p.kind === 'CC' ? `t ${mm(p.tw)} · ${t('section_lip')} ${mm(lipOf(name))} mm` : `t ${mm(p.tw)} mm`}</small>
      <dl>{rows.map(([k, v, u]) => <div key={k}><dt>{k}</dt><dd className="mono">{v} <small>{u}</small></dd></div>)}</dl>
      <small>{t(p.source === 'gen-db' ? 'section_sketch_gen' : 'section_sketch_dim')}</small>
    </details>
  </div>
}
