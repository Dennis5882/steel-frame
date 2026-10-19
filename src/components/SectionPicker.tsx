import type { ElementRole, FactorySpec } from '../domain/types'
import { modelingSectionChoices } from '../domain/sectionCatalog'
import { t } from '../i18n'
import { SectionSketch } from './SectionSketch'

/** Current/custom values survive catalog and material changes; they are never silently replaced. */
export function SectionPicker({ id, spec, role, value, disabled, invalid, errorId, onChange }: {
  id: string; spec: FactorySpec; role: ElementRole; value: string; disabled: boolean
  invalid: boolean; errorId?: string; onChange: (value: string) => void
}) {
  const { material, options, selected, source, excluded, propertyReview, preliminary } = modelingSectionChoices(spec, role, value)
  const shapes = [...new Set(options.map((o) => o.shape))]
  const noteId = `${id}-catalog-note`
  return <div className="section-picker">
    <select id={id} className="mono" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid} aria-describedby={[noteId, errorId].filter(Boolean).join(' ')}>
      {!selected && <option value={value}>{value || t('section_empty')} · {t('section_current')}</option>}
      {shapes.map((shape) => <optgroup key={shape} label={shape}>
        {options.filter((o) => o.shape === shape).map((o) => <option key={o.name} value={o.name}>
          {o.name}{o.selectionStatus === 'review' ? ` · ${t('section_review_short')}` : ''}{o.materialSupport[material]?.status === 'preliminary' ? ` · ${t('section_preliminary_short')}` : ''}
        </option>)}
      </optgroup>)}
    </select>
    {value.trim() && <SectionSketch name={value} code={spec.code} material={spec.material} />}
    <div id={noteId} className="section-picker-note">
      <small>{t('section_options_note', material, options.length)}</small>
      <small className={excluded ? 'section-picker-warning' : undefined}>{excluded ? t('section_excluded_source') : source ? t('section_gen_source', source.db) : t('section_dimension_source')}</small>
      {!selected && <small className="section-picker-warning">{t(options.length ? 'section_outside' : 'section_no_options')}</small>}
      {propertyReview && <small className="section-picker-warning">{t('section_property_review', (selected!.maxRelativeDifference * 100).toFixed(1))}</small>}
      {preliminary && <small className="section-picker-warning">{t('section_preliminary_note')}</small>}
    </div>
    <details className="section-picker-manual">
      <summary>{t('section_manual')}</summary>
      <label htmlFor={`${id}-manual`}>{t('section_manual_label')}</label>
      <input id={`${id}-manual`} className="pe-code" value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} aria-describedby={[noteId, errorId].filter(Boolean).join(' ')} />
      <small>{t('section_manual_note')}</small>
    </details>
  </div>
}
