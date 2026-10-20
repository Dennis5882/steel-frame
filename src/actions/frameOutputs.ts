/* 다층 강골조 산출물 — 계산서(HTML 새 창 / PDF / Word)·도면(DXF / A3 PDF). 공장 앱 변환기(report/pdf.ts·docx.ts)를 그대로 쓴다.
   모두 브라우저 안에서 만들고 서버로 보내지 않는다. 해석·검토 전이면 있는 부분까지만 싣는다(계산서에 '없음' 표시). */
import { getLang, t, lt } from '../i18n'
import { S } from '../state/store'
import { addMsg, log, recordArtifact } from '../state/ui'
import { APP_VERSION } from '../version'
import { F } from '../frame/state'
import { buildFrameReport } from '../frame/report'
import { buildFrameDrawingSvgs, buildFrameDxf, elevationLines } from '../frame/drawings'
import { beginJob, checkCancel, endJob, failMsg, stage } from './job'

const stamp = () => new Intl.DateTimeFormat('sv-SE').format(new Date()).replaceAll('-', '')

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  recordArtifact(name)
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function ready(): boolean {
  if (S.busy) { addMsg('bot', lt('busy')); return false }
  if (!F.built) { addMsg('bot', lt('no_model')); return false }
  return true
}

const reportHtml = () => buildFrameReport({ built: F.built!, analysis: F.analysis, review: F.review, design: F.design, opt: F.opt })
const drawingInput = () => ({ spec: F.built!.spec, model: F.built!.model, title: t('rp_title'), date: new Intl.DateTimeFormat('sv-SE').format(new Date()), version: APP_VERSION, colStrongAxis: F.analysis?.colStrongAxis })
const partial = (): 'fr_report_done' | 'fr_report_partial' => (F.design ? 'fr_report_done' : 'fr_report_partial')

export function openFrameReport(): void {
  if (!ready()) return
  const html = reportHtml()
  const name = `steel_frame_report_${getLang()}_${stamp()}.html`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  if (w) recordArtifact(name)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  if (!w) downloadBlob(name, new Blob([html], { type: 'text/html' })) // 팝업 차단 시 파일로
  log(t('log_report'), 'ok')
  addMsg('bot', lt(partial()))
}

export async function downloadFrameReportPdf(): Promise<void> {
  if (!ready() || !beginJob('pdf')) return
  try {
    stage('pdf_start')
    const name = `steel_frame_report_${getLang()}_${stamp()}.pdf`
    const { createReportPdf } = await import('../report/pdf')
    checkCancel()
    const { blob, pages } = await createReportPdf(reportHtml())
    checkCancel()
    downloadBlob(name, blob)
    log(t('log_report'), 'ok')
    addMsg('bot', lt('pdf_done', name, pages, (blob.size / 1024).toFixed(0), new Date().toLocaleString()))
    if (!F.design) addMsg('bot', lt('fr_report_partial'), 'warn')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('pdf_failed', m)))
  } finally {
    endJob()
  }
}

export async function downloadFrameReportDocx(): Promise<void> {
  if (!ready() || !beginJob('docx')) return
  try {
    stage('docx_start')
    const name = `steel_frame_report_${getLang()}_${stamp()}.docx`
    const { createReportDocx } = await import('../report/docx')
    checkCancel()
    const { blob, images, tables } = await createReportDocx(reportHtml())
    checkCancel()
    downloadBlob(name, blob)
    log(t('log_report'), 'ok')
    addMsg('bot', lt('docx_done', name, tables, images, (blob.size / 1024).toFixed(0)))
    if (!F.design) addMsg('bot', lt('fr_report_partial'), 'warn')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('docx_failed', m)))
  } finally {
    endJob()
  }
}

export function downloadFrameDxf(): void {
  if (!ready()) return
  const name = `steel_frame_drawings_${stamp()}.dxf`
  downloadBlob(name, new Blob([buildFrameDxf(drawingInput())], { type: 'application/dxf' }))
  log(t('log_dxf'), 'ok')
  addMsg('bot', lt('fr_dxf_done', elevationLines(F.built!.spec).length + 2))
}

export async function downloadFrameDrawingsPdf(): Promise<void> {
  if (!ready() || !beginJob('dwgpdf')) return
  try {
    stage('dwg_pdf_start')
    const name = `steel_frame_drawings_${stamp()}.pdf`
    const { createDrawingsPdf } = await import('../report/pdf')
    checkCancel()
    const { blob, pages } = await createDrawingsPdf(buildFrameDrawingSvgs(drawingInput()), name.replace(/\.pdf$/, ''))
    checkCancel()
    downloadBlob(name, blob)
    log(t('log_dwg_pdf'), 'ok')
    addMsg('bot', lt('dwg_pdf_done', name, pages, (blob.size / 1024).toFixed(0)))
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('dwg_pdf_failed', m)))
  } finally {
    endJob()
  }
}
