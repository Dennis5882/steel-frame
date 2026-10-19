import { S, notify } from '../state/store'
import { unavailable } from '../state/taskFlow'
import { addMsg, addPlanMsg, draw3D, tab } from '../state/ui'
import { t, lt, type I18nKey } from '../i18n'
import { createRepairPlan, previewRepair, repairMetrics, type RepairPlan } from '../domain/remediation'
import { runDesign } from '../domain/design'
import { runConnections } from '../domain/connections'
import { checkScope } from '../domain/scope'
import { assertGenSync } from './genSync'
import { beginJob, checkCancel, endJob, failMsg, stage } from './job'
import { sendModel } from './build'
import { analyzeCore } from './analysis'
import { fetchResults } from './results'
import { confirmAction } from '../components/ConfirmDialog'

export const currentRepairPlan=(plan:RepairPlan|null):plan is RepairPlan=>!!plan&&plan.source===S.built&&plan.results===S.results&&plan.design===S.design&&plan.connections===S.connections
const repairError=(e:unknown)=>e instanceof Error&&['repair_invalid','repair_geometry'].includes(e.message)?new Error(t(e.message as I18nKey)):e

export async function prepareRepairs():Promise<void> {
  const reason=unavailable({...S,mapiKey:'offline'},'optimize')||(S.genChanged?'wf_stale_gen':null)
  if(reason){addMsg('bot',lt(reason));return}
  if(!S.built||!S.results||!S.design||!S.connections||!beginJob('opt'))return
  const source=S.built,res=S.results,design=S.design,connections=S.connections
  S.repairPlan=null
  try {
    stage('repair_generating')
    const plan=await createRepairPlan(source,res,design,connections,checkCancel)
    if(source!==S.built||res!==S.results)throw new Error(t('repair_stale'))
    S.repairPlan=plan
    tab('resP')
  } catch(e) {
    // Planning never touches Gen: report it, but leave no failed stage or restore prompt behind.
    addMsg('bot',failMsg(repairError(e),(m)=>t('repair_fail',m)));S.lastFail=null
  }
  finally{endJob()}
}

export async function applyRepairs(selection:Record<string,string>):Promise<void> {
  const reason=unavailable(S,'optimize')
  if(reason){addMsg('bot',lt(reason));return}
  const plan=S.repairPlan
  if(!currentRepairPlan(plan)){addMsg('bot',lt('repair_stale'));return}
  const selected={...selection}
  let preview
  try {preview=previewRepair(plan,selected)}catch {addMsg('bot',lt('repair_invalid'));return}
  if(!preview)return
  if(preview.selectedBlocked||checkScope(preview.spec).blocked){addMsg('bot',lt('flow_invalid_design'));return}
  if(!await confirmAction({title:t('repair_apply'),body:t('repair_confirm'),ok:t('repair_apply')}))return
  // The open confirmation may outlive a model/result/draft change.
  if(unavailable(S,'optimize')||!currentRepairPlan(plan)){addMsg('bot',lt('repair_stale'));return}
  if(!beginJob('opt'))return
  const before=repairMetrics(plan.design,plan.connections),editor=S.activePlan
  try {
    await assertGenSync()
    checkCancel()
    await sendModel(preview.spec,(backup)=>{S.restorePoint=backup;notify()})
    await analyzeCore()
    const b=S.built!
    S.results=await fetchResults(b)
    const design=runDesign(b.spec,b.model,b.info,S.results),connections=runConnections(b.spec,b.model,b.info,S.results)
    S.design=design;S.connections=connections
    S.repairComparison={before,estimated:preview.metrics,after:repairMetrics(design,connections),changes:preview.changes,built:b,design}
    S.repairPlan=null
    S.buildEpoch++
    addPlanMsg(structuredClone(b.spec),editor?.mode??'free',editor?.tpl)
    S.preview=null;S.task='design';S.ratioView=true
    draw3D();tab('resP')
    addMsg('bot',lt('repair_done'))
  } catch(e){addMsg('bot',failMsg(repairError(e),(m)=>t('repair_fail',m)));if(S.lastFail)S.lastFail.repair=true;S.task='optimize'}
  finally{endJob()}
}
