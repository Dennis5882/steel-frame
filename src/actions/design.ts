/* 설계 검토 실행 (M3) — 결과 회수(M2) → 대만 LRFD 부재·사용성 검토 */
import { runConnections } from '../domain/connections'
import { runDesign } from '../domain/design'
import { summarizeStatus } from '../domain/status'
import { checkScope } from '../domain/scope'
import { statusLine } from '../components/Status'
import { t, lt, ltc } from '../i18n'
import { S, notify } from '../state/store'
import { addMsg, log, tab } from '../state/ui'
import { fetchResults } from './results'
import { assertGenSync } from './genSync'
import { beginJob, endJob, failMsg, stage } from './job'

export async function runDesignCheck(): Promise<void> {
  if (S.busy) { addMsg('bot', lt('busy')); return }
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  if (!S.analyzed) { addMsg('bot', lt('need_anal')); return }
  if (!beginJob('design')) return
  S.results = null; S.design = null; S.connections = null; S.opt = null; S.ratioView = false
  S.repairPlan = null; S.repairComparison = null
  notify()
  addMsg('bot', ltc(S.built.spec.code, 'design_start'))
  try {
    const b = S.built
    await assertGenSync() // 해석 후 Gen 에서 바꿨으면 결과·단면 정보가 어긋남
    S.results = await fetchResults(b)
    log(t('log_results'), 'ok')
    stage('st_check')
    const d = runDesign(b.spec, b.model, b.info, S.results)
    const connections = runConnections(b.spec, b.model, b.info, S.results)
    S.design = d; S.connections = connections
    log(t('log_design', d.members.length, d.ng), d.ng ? 'warn' : 'ok')
    S.ratioView = true
    addMsg('bot', lt('design_done', d.members.length, d.maxRatio.toFixed(2), statusLine(summarizeStatus(d, S.connections, checkScope(S.built!.spec)))))
    tab('resP')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('design_fail', m)))
  } finally {
    endJob()
  }
}
