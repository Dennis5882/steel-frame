/* 단면 자동 최적화 실행 — 검토 → 단면 제안 → 재전송 → 재해석 반복 (골조 부재력 재분배를 Gen 해석으로 확인).
   종료: 제안 = 현재(수렴) / 이미 거친 단면 조합(진동) / 최대 반복. 최종 = 거친 상태 중 OK 이고 가장 가벼운 것(현재가 아니면 그 단면으로 다시 전송·해석). */
import { runConnections } from '../domain/connections'
import { summarizeStatus } from '../domain/status'
import { checkScope } from '../domain/scope'
import { statusLine } from '../components/Status'
import { runDesign, type DesignResult } from '../domain/design'
import { pickBest, proposeSections, roleTons, steelWeight, type OptControl, type OptIter, type OptRow, type Sections } from '../domain/optimize'
import { sectionProps } from '../domain/sections'
import { ROLES } from '../domain/types'
import { t, lt, ltc } from '../i18n'
import { S, notify } from '../state/store'
import { addMsg, draw3D, log, tab } from '../state/ui'
import { analyzeCore } from './analysis'
import { sendModel } from './build'
import { fetchResults } from './results'
import { assertGenSync } from './genSync'
import { quantities } from '../domain/quantities'
import { blockedMembers } from '../domain/validity'
import { beginJob, endJob, failMsg, setIter } from './job'

const MAX_ITER = 5
const key = (s: Sections) => ROLES.map((r) => s[r]).join('|')

export async function runOptimize(): Promise<void> {
  if (S.busy) { addMsg('bot', lt('busy')); return }
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  if (!S.analyzed) { addMsg('bot', lt('need_anal')); return }
  if (!beginJob('opt')) return
  S.results = null; S.design = null; S.connections = null; S.opt = null; S.ratioView = false
  S.repairPlan = null; S.repairComparison = null
  notify()
  addMsg('bot', ltc(S.built.spec.code, 'opt_start', MAX_ITER))
  tab('logP')
  const start = S.built.spec
  const iters: OptIter[] = []
  let lastRows: OptRow[] = []
  let converged = false
  const ctl: Required<Pick<OptControl, 'floors' | 'bans' | 'amp'>> = { floors: {}, bans: [], amp: {} }
  try {
    await assertGenSync() // 시작 모델이 앱이 보낸 것과 같은지 (반복 중 재전송분은 sendModel 이 확인)
    let d: DesignResult
    for (let it = 1; ; it++) {
      setIter(it, MAX_ITER)
      const b = S.built!
      S.results = await fetchResults(b)
      d = runDesign(b.spec, b.model, b.info, S.results)
      const svcMax = Math.max(0, ...d.service.map((s) => s.ratio))
      /* 접합부도 반복마다 산정 — 부재만 통과하고 접합이 NG 인 안을 최종안으로 고르지 않게 */
      const cs = runConnections(b.spec, b.model, b.info, S.results)
      const rec: OptIter = { it, sections: b.spec.sections, weight: steelWeight(b.spec, b.model), plateT: quantities(b.spec, b.model, cs).plateT,
        maxRatio: d.maxRatio, svcMax, ng: d.ng, invalid: blockedMembers(d), connMax: Math.max(0, ...cs.map((c) => c.ratio)), connNg: cs.filter((c) => c.ratio > 1).length }
      iters.push(rec)
      log(t('log_opt_iter', it, rec.weight.toFixed(2), d.maxRatio.toFixed(3), svcMax.toFixed(3), d.ng) + t('log_opt_conn', rec.connMax.toFixed(3), rec.connNg) + (rec.invalid ? ` · ${t('rs_applicability')}: ${rec.invalid}` : ''), d.ng || rec.connNg || rec.invalid ? 'warn' : 'ok')
      /* 재해석 NG 를 하한·금지로 기록 — 다음 제안이 같은(또는 더 가벼운) 단면으로 되돌아가지 않게 */
      for (const r of ROLES) {
        const m = d.byRole[r]
        if (m && m.ratio > 1) ctl.floors[r] = Math.max(ctl.floors[r] ?? 0, sectionProps(m.section, b.spec.code).A)
        /* 직전 제안 추정비 대비 실제비 → 증폭 학습 (골조 재분배) */
        const prev = lastRows.find((x) => x.role === r && x.after === m?.section && x.before !== x.after)
        if (m && prev && prev.ratio > 0) ctl.amp[r] = Math.max(ctl.amp[r] ?? 1, m.ratio / prev.ratio)
      }
      if (d.service.some((s) => s.ratio > 1 && (s.key === 'windDriftX' || s.key === 'seisDriftX' || s.key === 'rafterDefl')))
        ctl.bans.push({ column: b.spec.sections.column, rafter: b.spec.sections.rafter })
      const svcNg = (k: string) => d.service.some((s) => s.key === k && s.ratio > 1)
      if (svcNg('windDriftY') || svcNg('seisDriftY')) ctl.floors.brace = Math.max(ctl.floors.brace ?? 0, sectionProps(b.spec.sections.brace, b.spec.code).A)
      if (svcNg('purlinDefl')) ctl.floors.purlin = Math.max(ctl.floors.purlin ?? 0, sectionProps(b.spec.sections.purlin, b.spec.code).A)
      if (svcNg('girtDefl')) ctl.floors.girt = Math.max(ctl.floors.girt ?? 0, sectionProps(b.spec.sections.girt, b.spec.code).A)
      if (svcNg('postDefl')) ctl.floors.post = Math.max(ctl.floors.post ?? 0, sectionProps(b.spec.sections.post, b.spec.code).A)
      if (it === MAX_ITER) break
      const p = proposeSections(b.spec, b.model, b.info, S.results, d, ctl)
      lastRows = p.rows
      if (!p.changed) { converged = d.ng === 0 && !blockedMembers(d) && rec.connNg === 0; if (converged) break }
      if (!p.changed || iters.some((x) => key(x.sections) === key(p.sections))) break
      for (const r of p.rows) if (r.before !== r.after) log(`${t(`role_${r.role}`)}: ${r.before} → ${r.after} (${r.ratio.toFixed(2)})`, 'info')
      await sendModel({ ...b.spec, sections: p.sections })
      await analyzeCore()
    }

    /* 최종 — 부재·사용성·접합 모두 OK 인 안 중 (부재 + 판재) 최경량, 없으면 NG 최소 (pickBest) */
    const { best, valid } = pickBest(iters)
    if (key(best.sections) !== key(S.built!.spec.sections)) {
      log(t('log_opt_restore', best.it), 'info')
      await sendModel({ ...start, sections: best.sections })
      await analyzeCore()
      S.results = await fetchResults(S.built!)
      d = runDesign(S.built!.spec, S.built!.model, S.built!.info, S.results)
    }
    const b = S.built!
    const connections = runConnections(b.spec, b.model, b.info, S.results!)
    S.design = d!
    S.connections = connections
    S.draftSpec = b.spec
    S.draftInvalid = false
    const wB = steelWeight(start, b.model, start.sections), wA = steelWeight(b.spec, b.model)
    const tB = roleTons(start, b.model, start.sections), tA = roleTons(b.spec, b.model)
    S.opt = {
      before: start.sections, after: b.spec.sections, iters, weightBefore: wB, weightAfter: wA, converged,
      ok: valid && !blockedMembers(S.design) && S.design.ng === 0 && S.connections.every((c) => c.ratio <= 1),
      rows: ROLES.filter((r) => b.model.elements.some((e) => e.role === r)).map((r) => ({
        role: r, before: start.sections[r], after: b.spec.sections[r], ratio: S.design!.byRole[r]?.ratio ?? 0,
        governs: lastRows.find((x) => x.role === r)?.governs ?? 'strength', tBefore: tB[r], tAfter: tA[r],
      })),
    }
    S.ratioView = true
    const pct = wB > 0 ? ((wB - wA) / wB) * 100 : 0
    addMsg('bot', t('opt_done', wB.toFixed(2), wA.toFixed(2), pct.toFixed(1), S.design.maxRatio.toFixed(2), statusLine(summarizeStatus(S.design, S.connections, checkScope(S.built!.spec))), iters.length)
      + (S.opt.ok ? '' : `<br>⚠ ${t('opt_no_valid')}`))
    draw3D()
    tab('resP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('opt_fail', m)))
  } finally {
    endJob()
  }
}
