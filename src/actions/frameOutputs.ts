/* 다층 강골조 산출물 — 계산서(HTML 새 창 / PDF / Word)·도면(DXF / A3 PDF). 공장 앱 변환기(report/pdf.ts·docx.ts)를 그대로 쓴다.
   모두 브라우저 안에서 만들고 서버로 보내지 않는다. 해석·검토 전이면 있는 부분까지만 싣는다(계산서에 '없음' 표시). */
import { getLang, t, lt } from '../i18n'
import { S } from '../state/store'
import { addMsg, log, recordArtifact } from '../state/ui'
import { APP_VERSION } from '../version'
import { F } from '../frame/state'
import { buildFrameReport } from '../frame/report'
import { buildFrameDrawingSvgs, buildFrameDxf, elevationLines } from '../frame/drawings'
import { frameQuantities } from '../frame/quantities'
import { frameQuantitySheet } from '../frame/quantitySheet'
import { quantityCsv } from '../report/quantitySheet'
import { Cancelled, beginJob, checkCancel, endJob, failMsg, stage } from './job'
import { mapi } from '../mapi/client'
import { outputBlocker, outputState, type FrameOutput } from '../frame/state'
import { captureShots } from '../frame/captures'
import { captureGen } from '../frame/run'
import type { Request } from '../frame/results'
import type { GenFigure } from '../frame/report'
import { folderAccessSupported, folderName, forgetGenFolder, pickGenFolder, readFolderImage } from '../lib/genFolder'
import { escapeHtml } from '../state/ui'

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

/** 실행 전 판정 — 단계 안내·카드와 같은 outputBlocker. 막히면 이유를 대화창에 남긴다 */
function outputReady(out: FrameOutput): boolean {
  const b = outputBlocker(outputState(), out)
  if (b) addMsg('bot', lt(b), b === 'busy' ? undefined : 'warn')
  return !b
}

const reportHtml = () => buildFrameReport({ built: F.built!, analysis: F.analysis, review: F.review, design: F.design, opt: F.opt })
const drawingInput = () => ({ spec: F.built!.spec, model: F.built!.model, title: t('rp_title'), date: new Intl.DateTimeFormat('sv-SE').format(new Date()), version: APP_VERSION, colStrongAxis: F.analysis?.colStrongAxis })
const partial = (): 'fr_report_done' | 'fr_report_partial' => (F.design ? 'fr_report_done' : 'fr_report_partial')

export function openFrameReport(): void {
  if (!outputReady('report')) return
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
  if (!outputReady('report') || !beginJob('pdf')) return
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
  if (!outputReady('report') || !beginJob('docx')) return
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
  if (!outputReady('drawings')) return
  const name = `steel_frame_drawings_${stamp()}.dxf`
  downloadBlob(name, new Blob([buildFrameDxf(drawingInput())], { type: 'application/dxf' }))
  log(t('log_dxf'), 'ok')
  addMsg('bot', lt('fr_dxf_done', elevationLines(F.built!.spec).length + 2))
}

export async function downloadFrameDrawingsPdf(): Promise<void> {
  if (!outputReady('drawings') || !beginJob('dwgpdf')) return
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

/** 물량 산출서 — CSV(UTF-8 BOM, 엑셀에서 바로 열림) 또는 Excel(.xlsx, 제목·머리 굵게·숫자 칸). 공장 앱과 같은 작성기 */
export async function downloadFrameQuantities(format: 'csv' | 'xlsx'): Promise<void> {
  if (!outputReady('quantities')) return
  const q = frameQuantities(F.built!.model), sheet = frameQuantitySheet(F.built!.spec, q)
  if (format === 'xlsx') {
    const { createXlsx } = await import('../report/xlsx')
    downloadBlob(`steel_frame_quantities_${stamp()}.xlsx`, await createXlsx(sheet))
  } else downloadBlob(`steel_frame_quantities_${stamp()}.csv`, new Blob([quantityCsv(sheet)], { type: 'text/csv;charset=utf-8' }))
  log(t(format === 'xlsx' ? 'log_xlsx' : 'log_csv'), 'ok')
  addMsg('bot', lt('fr_qty_done', q.memberT.toFixed(2), q.orderT.toFixed(2)))
}

/** 검토 결과 — Excel(.xlsx) 또는 CSV. 물량 산출서와 같은 작성기·같은 시트(화면 언어, 부재 검토 + 층 검토) */
export async function downloadFrameChecks(format: 'csv' | 'xlsx'): Promise<void> {
  if (!outputReady('checks')) return
  const { frameCheckSheet } = await import('../frame/checkSheet')
  const sheet = frameCheckSheet(F.built!.spec, F.design!, F.review)
  if (format === 'xlsx') {
    const { createXlsx } = await import('../report/xlsx')
    downloadBlob(`steel_frame_checks_${stamp()}.xlsx`, await createXlsx(sheet))
  } else downloadBlob(`steel_frame_checks_${stamp()}.csv`, new Blob([quantityCsv(sheet)], { type: 'text/csv;charset=utf-8' }))
  log(t('fr_log_checks', format.toUpperCase()), 'ok')
}

const req: Request = (m, p, b) => mapi(m, p, b as Record<string, unknown> | undefined)
const genDir = () => S.saveDir.trim().replace(/\\/g, '/').replace(/\/+$/, '') || 'C:/temp'

/** 상세 계산서 (Word) — Gen NX 화면 캡처(모델·평면·입면·반력·변위·내력·응력) + Gen 층 결과 표를 기본 계산서에 넣는다.
    캡처 PNG 는 Gen 이 같은 PC 의 저장 폴더에 쓰고, 앱은 사용자가 고른 그 폴더에서 읽는다(File System Access, Chrome·Edge).
    폴더 고르기는 클릭 직후(사용자 동작 안)에 먼저 한다. Gen 문서가 이 모델이 아니면(절점 수 다름) 캡처하지 않는다 */
export async function downloadFrameDetailedDocx(): Promise<void> {
  if (!outputReady('detail')) return
  if (!folderAccessSupported()) { addMsg('bot', lt('fr_detail_no_fs'), 'warn'); return }
  let dir
  try { dir = await pickGenFolder() } catch { return } // 사용자가 폴더 선택을 취소
  if (dir.name.toLowerCase() !== folderName(genDir())) { forgetGenFolder(); addMsg('bot', lt('fr_detail_wrong_folder', escapeHtml(dir.name), escapeHtml(genDir())), 'warn'); return }
  if (!beginJob('docx')) return
  const b = F.built!
  try {
    stage('fr_cap_check', 1)
    const nodes = await req('GET', '/db/NODE')
    const n = Object.keys(nodes?.NODE ?? {}).length
    if (n !== b.model.nodes.length) throw new Error(t('fr_detail_wrong_doc', n, b.model.nodes.length))
    const shots = captureShots(b.spec, b.model, F.design)
    stage('fr_cap_run', shots.length * 2 + 2)
    const res = await captureGen(req, shots, genDir(), stamp() + '_' + Date.now().toString(36), { fatal: (e) => e instanceof Cancelled })
    stage('fr_cap_read')
    const figures: GenFigure[] = [], failed: string[] = []
    for (const [i, r] of res.entries()) {
      const shot = shots[i], caption = (t as (k: string, ...a: unknown[]) => string)(shot.caption[0], ...shot.caption.slice(1))
      const img = r.ok ? await readFolderImage(dir, r.file) : null
      if (img) figures.push({ key: shot.key, section: shot.section, caption, src: img.src, width: img.width, height: img.height })
      else failed.push(caption)
      checkCancel()
    }
    if (!figures.length) throw new Error(t('fr_detail_no_images', genDir()))
    stage('docx_start')
    const html = buildFrameReport({ built: b, analysis: F.analysis, review: F.review, design: F.design, opt: F.opt, gen: { figures, failed } })
    const name = `steel_frame_report_detail_${getLang()}_${stamp()}.docx`
    const { createReportDocx } = await import('../report/docx')
    const { blob, tables } = await createReportDocx(html)
    checkCancel()
    downloadBlob(name, blob)
    log(t('log_report'), 'ok')
    addMsg('bot', lt('fr_detail_done', name, figures.length, tables, (blob.size / 1024).toFixed(0)))
    if (failed.length) addMsg('bot', lt('fr_detail_partial', failed.join(', ')), 'warn')
  } catch (e) {
    addMsg('bot', failMsg(e, (m) => t('docx_failed', m)))
  } finally {
    endJob()
  }
}
