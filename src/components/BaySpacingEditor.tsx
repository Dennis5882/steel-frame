import { Plus, Trash2 } from 'lucide-react'
import { t } from '../i18n'
import { NumericInput } from './NumericInput'

interface Props {
  id: string; individual: boolean; raw: string; disabled: boolean; invalid: boolean
  onMode(individual: boolean): void; onChange(raw: string): void
}

export function BaySpacingEditor({ id, individual, raw, disabled, invalid, onMode, onChange }: Props) {
  // Preserve empty cells while typing; validation rejects them rather than dropping a bay.
  const rows = raw.split(/[,，、]/).map((v) => v.trim())
  const update = (i: number, value: string) => onChange(rows.map((v, j) => j === i ? value : v).join(', '))
  return <div className="mw-bay-editor">
    <div className="mw-bay-mode" role="group" aria-label={t('bay_mode')}>
      {[false, true].map((mode) => <button type="button" key={String(mode)} aria-pressed={individual === mode} disabled={disabled} onClick={() => onMode(mode)}>{t(mode ? 'bay_individual' : 'bay_uniform')}</button>)}
    </div>
    {individual && <>
      <div id={id} className="mw-bay-list" role="group" aria-label={t('bay_spacing_title')}>
        {rows.map((v, i) => {
          const bad = invalid && (!v || !Number.isFinite(Number(v)) || Number(v) <= 0)
          return <div className="mw-bay-cell" key={i}>
            <label htmlFor={`${id}-${i}`}>{t('bay_number', i + 1)}</label>
            <div><NumericInput id={`${id}-${i}`} className="mono" value={v} disabled={disabled} step={0.1}
              onValueChange={(value) => update(i, value)} title={t('numeric_wheel_hint')} aria-invalid={bad} aria-describedby={invalid ? `${id}-error` : undefined} />
              <span>m</span><button type="button" disabled={disabled || rows.length === 1} aria-label={t('bay_remove', i + 1)}
                onClick={() => { onChange(rows.filter((_, j) => j !== i).join(', ')); requestAnimationFrame(() => document.getElementById(`${id}-${Math.max(0, i - 1)}`)?.focus()) }}><Trash2 size={14} /></button>
            </div>
          </div>
        })}
      </div>
      <button type="button" className="btn btn-ghost mw-bay-add" disabled={disabled} onClick={() => {
        const last = rows[rows.length - 1]
        onChange([...rows, Number(last) > 0 && Number.isFinite(Number(last)) ? last : '6'].join(', '))
        requestAnimationFrame(() => document.getElementById(`${id}-${rows.length}`)?.focus())
      }}><Plus size={14} />{t('bay_add')}</button>
      {invalid && <p id={`${id}-error`} className="mw-error" role="alert">{t('bay_error')}</p>}
    </>}
  </div>
}
