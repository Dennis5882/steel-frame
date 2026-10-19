import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Building2, Send } from 'lucide-react'
import { baySpans, frameSpans, type FactorySpec } from '../domain/types'
import { t } from '../i18n'
import { BaseSymbol } from './FrameControls'
import { MODEL_STEPS, REVIEW_STEP } from './modelingFlow'
import { PROFILES } from '../codes'

export const WIZARD_STEPS = MODEL_STEPS

/** Small explanatory elevation/plan, independent of the interactive 3D viewport. */
function GeometrySketch({ spec, plan }: { spec: FactorySpec; plan: boolean }) {
  const gridId = useId()
  const spans = baySpans(spec)
  const length = spans.reduce((a, b) => a + b, 0)
  const mono = spec.frame === 'mono'
  const widths = frameSpans(spec)
  const rise = (mono ? spec.span : Math.max(...widths) / 2) * spec.roofSlope
  const width = 220, scale = Math.min(width / spec.span, 112 / (spec.eaveHeight + rise))
  const left = (300 - spec.span * scale) / 2, right = 300 - left
  const eave = 145 - spec.eaveHeight * scale, ridge = eave - rise * scale
  const bayX = [40, ...spans.map((_, i) => 40 + spans.slice(0, i + 1).reduce((a, b) => a + b, 0) * 220 / length)]
  return <div className="mw-sketch" aria-hidden="true">
    <svg viewBox="0 0 300 185" focusable="false">
      <defs><pattern id={gridId} width="15" height="15" patternUnits="userSpaceOnUse"><path d="M 15 0 L 0 0 0 15" fill="none" stroke="var(--border)" strokeWidth=".5" /></pattern></defs>
      <rect x="0" y="0" width="300" height="185" fill={`url(#${gridId})`} />
      {plan ? <>
        <path d="M40 38 H260 V139 H40 Z" fill="var(--tile)" stroke="var(--cyan)" strokeWidth="2" />
        {bayX.map((x, i) => <path key={i} d={`M${x} 38 V139`} stroke="var(--blue)" strokeWidth="1.5" />)}
        {spans.length <= 16 && spans.map((span, i) => <text key={i} x={(bayX[i] + bayX[i + 1]) / 2} y="57" textAnchor="middle">{+span.toFixed(2)}</text>)}
        <path d="M40 88 H260" stroke="var(--muted)" strokeDasharray="4 4" />
        <text x="150" y="163" textAnchor="middle">{+length.toFixed(2)} m · {t('f_bays')} {spec.bays}</text>
        <text x="150" y="24" textAnchor="middle">{t('mw_plan')}</text>
      </> : <>
        <path d={mono ? `M${left} 145 V${eave} L${right} ${ridge} V145`
          : `M${left} 145 V${eave} ${widths.reduce((acc, w, i) => { const x0 = left + widths.slice(0, i).reduce((a, b) => a + b, 0) * scale; return `${acc} L${x0 + w * scale / 2} ${eave - (w / 2) * spec.roofSlope * scale} L${x0 + w * scale} ${eave}` }, '')} V145`}
          fill="var(--tile)" stroke="var(--cyan)" strokeWidth="4" strokeLinejoin="round" />
        {/* 다경간 내부 기둥 (흔들림 기둥) */}
        {widths.slice(0, -1).map((_, i) => { const x = left + widths.slice(0, i + 1).reduce((a, b) => a + b, 0) * scale; return <path key={i} d={`M${x} 145 V${eave}`} stroke="var(--cyan)" strokeWidth="2" strokeDasharray="4 3" /> })}
        <BaseSymbol x={left} y={145} fixed={spec.baseFixity === 'fixed'} />
        <BaseSymbol x={right} y={145} fixed={spec.baseFixity === 'fixed'} />
        {widths.slice(0, -1).map((_, i) => <BaseSymbol key={i} x={left + widths.slice(0, i + 1).reduce((a, b) => a + b, 0) * scale} y={145} fixed={false} />)}
        <path d={`M${left} 170 H${right} M${left} 166 V174 M${right} 166 V174`} stroke="var(--muted)" />
        <text x="150" y="183" textAnchor="middle">{spec.span} m</text>
        {/* 편경사: 낮은 처마는 왼쪽, 높은 처마는 오른쪽에 */}
        <text x={mono ? left - 8 : right + 8} y={(145 + eave) / 2} fontSize="10" textAnchor={mono ? 'end' : 'start'}>{spec.eaveHeight} m</text>
        {mono && <text x={right + 8} y={(145 + ridge) / 2} fontSize="10">{+(spec.eaveHeight + rise).toFixed(2)} m</text>}
        <text x="150" y={Math.max(14, ridge - 12)} textAnchor="middle">{t('f_slope')} {spec.roofSlope}</text>
      </>}
    </svg>
  </div>
}

interface Props {
  spec: FactorySpec; step: number; visited: number; disabled: boolean; blocked: boolean; invalid: boolean; attempted: boolean
  onStep(step: number): void; onBuild(): void; onCancel(): void; onChangeCode?(): void; codeLocked?: boolean; children: ReactNode
}

export function ModelWizard({ spec, step, visited, disabled, blocked, invalid, attempted, onStep, onBuild, onCancel, onChangeCode, codeLocked, children }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0
    if (mounted.current) heading.current?.focus({ preventScroll: true })
    mounted.current = true
  }, [step])
  const length = baySpans(spec).reduce((a, b) => a + b, 0)
  return <div className="model-wizard">
    <header className="mw-banner">
      <div className="mw-brand"><Building2 size={18} /><span>{t('mw_title')}</span>
        <span className="mw-code-info"><span className="mw-code" title={t('code_label')}>{spec.code}</span><span className="mw-code-label" title={t(PROFILES[spec.code].labelKey)}>{t(PROFILES[spec.code].labelKey)}</span>
          {onChangeCode && <button type="button" className="btn btn-ghost mw-code-change" disabled={codeLocked} onClick={onChangeCode}>{t('project_code_change')}</button>}</span></div>
      <div className="mw-progress-text"><span>{t('mw_process')}</span><strong>{String(step + 1).padStart(2, '0')} / {String(WIZARD_STEPS.length).padStart(2, '0')}</strong></div>
      <div className="mw-progress" role="progressbar" aria-label={t('mw_process')} aria-valuemin={1} aria-valuemax={WIZARD_STEPS.length} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) / WIZARD_STEPS.length * 100}%` }} /></div>
    </header>
    <nav className="mw-steps" aria-label={t('mw_process')}>{WIZARD_STEPS.map((key, i) => <button key={key} type="button" disabled={disabled || i > visited}
      aria-current={i === step ? 'step' : undefined} onClick={() => onStep(i)} title={t(key)}>
      <span className={`mw-step-dot${i === step ? ' current' : i < visited ? ' done' : ''}`}>{i < visited && i !== step ? <Check size={12} /> : i + 1}</span><span>{t(key)}</span>
    </button>)}</nav>
    <div className="mw-content" ref={content}>
      <div className="mw-stage-heading"><span className="mw-eyebrow">{t('mw_step', step + 1)}</span><h3 tabIndex={-1} ref={heading}>{t(WIZARD_STEPS[step])}</h3></div>
      {step === 1 && <div className="mw-frame-preview">
        <GeometrySketch spec={spec} plan={false} />
        <div className="mw-preview-caption"><span>{t(`frame_${spec.frame ?? 'gable'}`)}</span><span>{t('f_base')} · {t(spec.baseFixity === 'fixed' ? 'base_fixed' : 'base_pinned')}</span></div>
      </div>}
      {step === 2 && <GeometrySketch spec={spec} plan />}
      {step > 1 && <div className="mw-metrics"><span>{t('f_span')}<b>{spec.span}<small> m</small></b></span><span>{t('kv_length')}<b>{+length.toFixed(2)}<small> m</small></b></span><span>{t('f_eave')}<b>{spec.eaveHeight}<small> m</small></b></span></div>}
      {step === REVIEW_STEP && !blocked && !invalid && <div className="mw-ready"><CheckCircle2 size={18} />{t('mw_ready')}</div>}
      {children}
      {attempted && (blocked || invalid) && <p className="mw-error mw-alert" role="alert">{t(blocked ? 'sc_blocked' : 'mw_invalid')}</p>}
    </div>
    <footer className="mw-footer">
      <div className="mw-footer-actions">
        <button className="btn btn-ghost" disabled={disabled} onClick={step ? () => onStep(step - 1) : onCancel}>{step ? <ArrowLeft size={14} /> : null}{t(step ? 'mw_back' : 'ws_home')}</button>
        {step < REVIEW_STEP ? <button className="btn btn-c" disabled={disabled} onClick={() => onStep(step + 1)}>{t(step === REVIEW_STEP - 1 ? 'mw_to_review' : 'mw_next')}<ArrowRight size={14} /></button>
          : <button className="btn btn-c" disabled={disabled || blocked || invalid} onClick={onBuild}><Send size={14} />{t('mw_build')}</button>}
      </div>
      <p>{t(disabled ? 'mw_locked' : 'mw_preview_note')}</p>
    </footer>
  </div>
}
