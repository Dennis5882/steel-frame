import type { Results } from '../actions/results'
import { requireResult } from './resultValidation'

/** KDS 14 31 15 4.5-7: P_e,story = R_M H L / delta_H.
 * Extract linear story stiffness from the pure horizontal EX/EY cases:
 * the same case supplies H and delta_H. This avoids gravity-induced sway
 * and vertical roof wind pressures contaminating an unequal portal's delta_H.
 * P_story stays specific to each strength combination. Maximum column-top
 * drift is used, as the clause permits when drift varies in plan. */
export function lateralSwayKr(res: Results, tops: number[], reference: Record<'X' | 'Y', { V: number }>): void {
  requireResult(tops.length, 'SWAY', 'missing', 'column tops')
  for (const [dir, comp] of [['X', 'dx'], ['Y', 'dy']] as const) {
    const H = reference[dir].V
    requireResult(Number.isFinite(H) && H > 0, 'SWAY', 'invalid', `E${dir} shear`)
    let drift = 0
    for (const id of tops) {
      const d = res.disp.get(`E${dir}`)?.get(id)?.[comp]
      requireResult(Number.isFinite(d), 'DISPLACEMENTG', 'missing', `E${dir} node ${id}`)
      drift = Math.max(drift, Math.abs(d!))
    }
    for (const sway of res.sway.values()) sway[dir] = { ...sway[dir], sumH: H, drift }
  }
}
