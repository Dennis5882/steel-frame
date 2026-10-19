/* Read-only scope assessment. Geometry and additional-structure controls live in their own stages. */
import { checkScope, type ScopeIssue } from '../domain/scope'
import type { FactorySpec } from '../domain/types'
import { t } from '../i18n'

/** 판정 문구 (사전 sc_<key>, 인자 = issue.args) */
export const scopeMsg = (i: ScopeIssue): string => (t as (k: string, ...a: unknown[]) => string)(`sc_${i.key}`, ...i.args)

export function ScopeBox({ spec }: { spec: FactorySpec }) {
  const r = checkScope(spec)
  return (
    <div className="plan-editor" style={{ paddingBottom: 8 }}>
      <div className="sec-divider" style={{ margin: '0 0 8px' }}>{t('sec_scope')}</div>
      {r.issues.map((i, n) => (
        <div key={n} className="pe-tip" style={{ color: i.level === 'block' ? 'var(--red)' : 'var(--amber)', marginTop: 4 }}>
          {i.level === 'block' ? '⛔' : '⚠'} {scopeMsg(i)}
        </div>
      ))}
      <div className="pe-tip" style={{ marginTop: 6, fontWeight: 600, color: r.blocked ? 'var(--red)' : r.issues.length ? 'var(--amber)' : 'var(--green)' }}>
        {t(r.blocked ? r.issues.filter((i)=>i.level==='block').every((i)=>i.key==='additionInput') ? 'sc_additionInput' : 'sc_blocked' : r.issues.length ? 'sc_warned' : 'sc_ok')}
      </div>
    </div>
  )
}
