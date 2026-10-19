/* 산출물 (M5·M6) — 계산서(PDF 직접 다운로드 / HTML 새 창)·도면(DXF)·물량(CSV).
   브라우저 안에서 생성하며 PDF는 파일 생성·페이지 수 확인 후 다운로드한다. */
import { buildDrawingSvgs, buildDxf } from '../drawing/drawings'
import { getLang, t, lt } from '../i18n'
import { buildReport } from '../report/report'
import { QuantityError, quantities } from '../domain/quantities'
import { quantityCsv, quantitySheet } from '../report/quantitySheet'
import { S } from '../state/store'
import { addMsg, log, recordArtifact } from '../state/ui'
import { unavailable } from '../state/taskFlow'
import { beginJob, checkCancel, endJob, failMsg, stage } from './job'

const stamp = () => new Intl.DateTimeFormat('sv-SE').format(new Date()).replaceAll('-', '')
function canOutput(): boolean {
  const reason = unavailable(S, 'outputs')
  if (!reason) return true
  addMsg('bot', lt(reason), 'warn')
  return false
}

function download(name: string, text: string, type: string): void {
  downloadBlob(name, new Blob([text], { type }))
}

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

export function openReport(): void {
  if (!canOutput()) return
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  const html = reportHtml()
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const w = window.open(url, '_blank')
  if (w) recordArtifact(`steel_report_${stamp()}.html`)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  if (!w) download(`steel_report_${stamp()}.html`, html, 'text/html') // 팝업 차단 시 파일로
  log(t('log_report'), 'ok')
  addMsg('bot', S.design ? t('report_done') : t('report_partial'))
}

const reportHtml = () => buildReport({ built: S.built!, reactions: S.reactions, design: S.design, connections: S.connections, opt: S.opt })

/** Generate and validate the PDF locally before starting the file download. */
export async function downloadReportPdf(): Promise<void> {
  if (!canOutput()) return
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  if (!beginJob('pdf')) return
  try {
    stage('pdf_start')
    const name = `steel_report_${S.built.spec.code}_${getLang()}_${stamp()}.pdf`
    const html = reportHtml()
    const { createReportPdf } = await import('../report/pdf')
    checkCancel()
    const { blob, pages } = await createReportPdf(html)
    checkCancel()
    downloadBlob(name, blob)
    log(t('log_report'), 'ok')
    addMsg('bot', lt('pdf_done', name, pages, (blob.size / 1024).toFixed(0), new Date().toLocaleString()))
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('pdf_failed', m)))
  } finally {
    endJob()
  }
}

/** 계산서 Word(.docx) — PDF 와 같은 계산서 HTML 에서 만든다. 편집 가능, 서버 전송 없음 */
export async function downloadReportDocx(): Promise<void> {
  if (!canOutput()) return
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  if (!beginJob('docx')) return
  try {
    stage('docx_start')
    const name = `steel_report_${S.built.spec.code}_${getLang()}_${stamp()}.docx`
    const html = reportHtml()
    const { createReportDocx } = await import('../report/docx')
    checkCancel()
    const { blob, images, tables } = await createReportDocx(html)
    checkCancel()
    downloadBlob(name, blob)
    log(t('log_report'), 'ok')
    addMsg('bot', lt('docx_done', name, tables, images, (blob.size / 1024).toFixed(0)))
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('docx_failed', m)))
  } finally {
    endJob()
  }
}

/** 물량 산출서 — CSV(UTF-8 BOM, 엑셀에서 바로 열림) 또는 Excel(.xlsx, 제목·머리 굵게·숫자 칸) */
export async function downloadQuantities(format: 'csv' | 'xlsx' = 'csv'): Promise<void> {
  if (!canOutput()) return
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  const { spec, model } = S.built
  let q: ReturnType<typeof quantities>
  try { q = quantities(spec, model, S.connections) } catch (e) {
    addMsg('bot', e instanceof QuantityError ? t('q_invalid', e.where) : String(e instanceof Error ? e.message : e), 'error'); return
  }
  const sheet = quantitySheet(spec, q)
  if (format === 'xlsx') {
    const { createXlsx } = await import('../report/xlsx')
    downloadBlob(`steel_quantities_${spec.code}_${stamp()}.xlsx`, await createXlsx(sheet))
  } else download(`steel_quantities_${spec.code}_${stamp()}.csv`, quantityCsv(sheet), 'text/csv;charset=utf-8')
  log(t(format === 'xlsx' ? 'log_xlsx' : 'log_csv'), 'ok')
  addMsg('bot', lt(format === 'xlsx' ? 'xlsx_done' : 'csv_done', q.netT.toFixed(2), q.orderT.toFixed(2)))
}

export function downloadDrawings(): void {
  if (!canOutput()) return
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  const dxf = buildDxf({ spec: S.built.spec, model: S.built.model, connections: S.connections, title: 'STEEL PORTAL FACTORY' })
  download(`steel_drawings_${S.built.spec.code}_${stamp()}.dxf`, dxf, 'application/dxf')
  log(t('log_dxf'), 'ok')
  addMsg('bot', S.connections ? t('dxf_done') : t('dxf_partial'))
}

/** 도면 PDF — DXF 와 같은 시트를 A3 가로 PDF 로 (인쇄·공유용, 편집은 DXF) */
export async function downloadDrawingsPdf(): Promise<void> {
  if (!canOutput()) return
  if (!S.built) { addMsg('bot', lt('no_model')); return }
  if (!beginJob('dwgpdf')) return
  try {
    stage('dwg_pdf_start')
    const name = `steel_drawings_${S.built.spec.code}_${stamp()}.pdf`
    const sheets = buildDrawingSvgs({ spec: S.built.spec, model: S.built.model, connections: S.connections, title: 'STEEL PORTAL FACTORY' })
    const { createDrawingsPdf } = await import('../report/pdf')
    checkCancel()
    const { blob, pages } = await createDrawingsPdf(sheets, name.replace(/\.pdf$/, ''))
    checkCancel()
    downloadBlob(name, blob)
    log(t('log_dwg_pdf'), 'ok')
    addMsg('bot', lt(S.connections ? 'dwg_pdf_done' : 'dwg_pdf_partial', name, pages, (blob.size / 1024).toFixed(0)))
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('dwg_pdf_failed', m)))
  } finally {
    endJob()
  }
}
