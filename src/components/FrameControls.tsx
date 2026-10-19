import { Check } from 'lucide-react'
import { FRAME_TYPES, type FactorySpec, type FrameType } from '../domain/types'
import { t } from '../i18n'

/** Structural support symbol: internal leaning columns always use a pin. */
export function BaseSymbol({ x, y, fixed }: { x: number; y: number; fixed: boolean }) {
  return <g className="mw-support" transform={`translate(${x} ${y})`} fill="var(--panel2)" stroke="currentColor" strokeWidth="1.5">
    {fixed ? <>
      <path d="M-11 1 H11 M-10 1 l-4 6 M-4 1 l-4 6 M2 1 l-4 6 M8 1 l-4 6 M14 1 l-4 6" />
    </> : <>
      <path d="M0 1 L-7 11 H7 Z M-11 14 H11 M-7 14 l-3 4 M0 14 l-3 4 M7 14 l-3 4" />
      <circle r="2.5" />
    </>}
  </g>
}

function FrameIcon({ frame }: { frame: FrameType }) {
  return <svg viewBox="0 0 88 64" aria-hidden="true" focusable="false">
    <path className="mw-icon-ground" d="M8 54 H80" />
    <path className="mw-icon-frame" d={frame === 'mono' ? 'M14 52 V28 L74 12 V52'
      : frame === 'multi' ? 'M10 52 V30 L27 17 L44 30 L61 17 L78 30 V52 M44 30 V52'
      : 'M14 52 V30 L44 14 L74 30 V52'} />
  </svg>
}

export function FrameTypePicker({ value, disabled, onChange }: { value: FrameType; disabled: boolean; onChange(v: FrameType): void }) {
  return <div className="mw-frame-picker" role="group" aria-label={t('f_frame')}>
    <span className="mw-picker-label">{t('f_frame')}</span>
    <div className="mw-frame-options">{FRAME_TYPES.map((frame) => <button type="button" key={frame} disabled={disabled}
      aria-pressed={value === frame} onClick={() => onChange(frame)}>
      <FrameIcon frame={frame} /><span>{t(`frame_${frame}`)}</span>
      {value === frame && <Check className="mw-choice-check" size={13} aria-hidden="true" />}
    </button>)}</div>
  </div>
}

export function BaseFixityPicker({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange(v: FactorySpec['baseFixity']): void }) {
  return <div id={id} className="mw-base-options" role="group" aria-label={t('f_base')}>
    {(['pinned', 'fixed'] as const).map((base) => <button type="button" key={base} disabled={disabled}
      aria-pressed={value === base} onClick={() => onChange(base)}>
      <svg viewBox="0 0 38 42" aria-hidden="true" focusable="false">
        <path d="M19 3 V22" stroke="currentColor" strokeWidth="3" />
        <BaseSymbol x={19} y={22} fixed={base === 'fixed'} />
      </svg>
      <span>{t(base === 'fixed' ? 'base_fixed' : 'base_pinned')}</span>
      {value === base && <Check size={13} aria-hidden="true" />}
    </button>)}
  </div>
}
