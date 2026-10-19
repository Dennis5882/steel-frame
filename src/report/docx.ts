/* Convert our own report markup to an editable Word document (.docx), like report/pdf.ts does for PDF.
   Headings and paragraphs use Word's built-in style ids (Title, Heading1–3, Normal, Caption, list bullets),
   so a company template's styles apply unchanged. Tables stay Word tables; SVG figures become PNG images.
   Generated in the browser — the report is never sent to a server. */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType, type IRunOptions,
} from 'docx'

export interface DocxImage { data: Uint8Array; width: number; height: number }
/** SVG markup (width/height = display px) → PNG. Browser: canvas; tests: a stub. null = leave the figure out (caption kept). */
export type Rasterize = (svg: string, width: number, height: number) => Promise<DocxImage | null>

type Block = Paragraph | Table
const children = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1)
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
const COLORS: Record<string, string> = { ok: '1D8653', ng: 'C43030', 'gr-fail': 'C43030', 'gr-expert': '5A45C6', 'gr-prelim': '966000', 'gr-reinforced': '2F55C9', 'gr-pass': '1D8653' }
/** Word fonts present on Windows/Office for each report language (East Asian glyph forms differ by region). */
export function reportDocxFont(lang: string): string {
  const l = lang.toLowerCase()
  return /^zh-(hant|tw|hk)/.test(l) ? 'Microsoft JhengHei' : /^zh/.test(l) ? 'Microsoft YaHei' : /^ko/.test(l) ? 'Malgun Gothic' : 'Calibri'
}
const PAGE_WIDTH_PX = 600 // A4 text width at 96 dpi (≈ 15.9 cm)

function runs(el: Element, base: IRunOptions = {}): TextRun[] {
  return Array.from(el.childNodes).flatMap((n): TextRun[] => {
    if (n.nodeType === 3) {
      const text = (n.textContent ?? '').replace(/\s+/g, ' ')
      return text ? [new TextRun({ ...base, text })] : []
    }
    if (n.nodeType !== 1) return []
    const e = n as Element, tag = e.tagName.toLowerCase()
    if (tag === 'br') return [new TextRun({ ...base, break: 1 })]
    const color = classes(e).map((c) => COLORS[c]).find(Boolean)
    return runs(e, { ...base, ...(tag === 'b' || tag === 'strong' ? { bold: true } : {}), ...(color ? { color } : {}) })
  })
}

/** Same column grouping as the PDF: wide engineering tables repeat the member identification columns. */
function tables(el: Element): Table[] {
  const rows = Array.from(el.getElementsByTagName('tr')).map((r) => children(r).filter((c) => /^(td|th)$/i.test(c.tagName)))
  if (!rows.length) return []
  const n = rows[0].length, groups: number[][] = []
  if (n <= 8) groups.push(Array.from({ length: n }, (_, i) => i))
  else for (let i = 3; i < n; i += 4) groups.push([0, 1, 2, ...Array.from({ length: Math.min(4, n - i) }, (_, j) => i + j)])
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C8CCD4' }
  return groups.map((cols) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map((row, ri) => new TableRow({
      tableHeader: ri === 0, cantSplit: true,
      children: cols.map((i) => new TableCell({
        children: [new Paragraph({ spacing: { after: 0, line: 240 }, children: row[i] ? runs(row[i], { size: n > 8 ? 15 : 16, ...(ri === 0 ? { bold: true, color: '163678' } : {}) }) : [] })],
        ...(ri === 0 ? { shading: { type: ShadingType.CLEAR, fill: 'EEF1F7', color: 'auto' } } : {}),
        margins: { top: 40, bottom: 40, left: 70, right: 70 },
      })),
    })),
  }))
}

export async function reportDocxDocument(doc: Document_, serialize: (el: Element) => string, rasterize: Rasterize): Promise<Document> {
  const body = doc.getElementsByTagName('body')[0]
  if (!body) throw new Error('Report body missing')
  const lang = doc.documentElement.getAttribute('lang') ?? ''
  const title = doc.getElementsByTagName('title')[0]?.textContent ?? 'Steel report'
  async function block(el: Element): Promise<Block[]> {
    const tag = el.tagName.toLowerCase()
    if (tag === 'table') return tables(el)
    if (tag === 'figure') {
      const svg = el.getElementsByTagName('svg')[0]
      const cap = el.getElementsByTagName('figcaption')[0]?.textContent ?? ''
      const out: Block[] = []
      if (svg) {
        const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
        const w = box[2] || 640, h = box[3] || 400
        // Display size on the page; drawing sheets use mm viewBoxes (e.g. 44 000 wide), so never rasterize at viewBox size
        const fit = Math.min(PAGE_WIDTH_PX / w, 640 / h), dw = Math.round(w * fit), dh = Math.round(h * fit)
        const copy = svg.cloneNode(true) as Element
        copy.setAttribute('width', String(dw)); copy.setAttribute('height', String(dh)); copy.removeAttribute('style')
        if (!copy.getAttribute('xmlns')) copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        const png = await rasterize(serialize(copy), dw, dh)
        if (png) out.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new ImageRun({ type: 'png', data: png.data, transformation: { width: dw, height: dh } })] }))
      }
      if (cap) out.push(new Paragraph({ style: 'Caption', alignment: AlignmentType.CENTER, children: [new TextRun(cap)] }))
      return out
    }
    if (tag === 'ul' || tag === 'ol') return children(el).map((li) => new Paragraph({ bullet: { level: 0 }, children: runs(li) }))
    const heading = ({ h1: HeadingLevel.TITLE, h2: HeadingLevel.HEADING_1, h3: HeadingLevel.HEADING_2, h4: HeadingLevel.HEADING_3 } as Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]>)[tag]
    if (heading) return [new Paragraph({ heading, keepNext: true, children: runs(el) })]
    if (tag === 'p' || tag === 'figcaption' || (tag === 'div' && !children(el).some((c) => /^(div|ul|p|table|figure)$/i.test(c.tagName)))) {
      const note = classes(el).some((c) => ['note', 'meta'].includes(c))
      return [new Paragraph({ children: runs(el, note ? { size: 16, color: '555555' } : {}), ...(classes(el).includes('keep') ? { keepLines: true } : {}) })]
    }
    const out: Block[] = []
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 1) out.push(...await block(node as Element))
      else if (node.nodeType === 3 && node.textContent?.trim()) out.push(new Paragraph({ children: [new TextRun(node.textContent.trim())] }))
    }
    // Drawings start on a new page, as in the PDF
    if (classes(el).includes('dwg') && out[0] instanceof Paragraph) out.unshift(new Paragraph({ pageBreakBefore: true, children: [] }))
    return out
  }
  const content: Block[] = []
  for (const el of children(body)) content.push(...await block(el))
  const font = reportDocxFont(lang)
  return new Document({
    creator: 'Steel Frame Agent', title, description: 'Structural model and preliminary design report',
    styles: { default: { document: { run: { font: { ascii: font, hAnsi: font, eastAsia: font, cs: font }, size: 18 }, paragraph: { spacing: { after: 80, line: 276 } } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1020, bottom: 1020, left: 1134, right: 1134 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: title, size: 16, color: '666666' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Steel Frame Agent  ·  ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, color: '666666' })] })] }) },
      children: content,
    }],
  })
}
type Document_ = globalThis.Document

/** Browser rasterizer: SVG → canvas (2×) → PNG. White background so figures read on any Word theme. */
export const rasterizeInBrowser: Rasterize = async (svg, width, height) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = 2.5, canvas = document.createElement('canvas') // ≈ 240 dpi at the display size
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ? { data: new Uint8Array(await blob.arrayBuffer()), width, height } : null
  } catch { return null } finally { URL.revokeObjectURL(url) }
}

export async function createReportDocx(html: string): Promise<{ blob: Blob; images: number; tables: number }> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let images = 0
  const document_ = await reportDocxDocument(doc, (el) => new XMLSerializer().serializeToString(el), async (svg, w, h) => {
    const png = await rasterizeInBrowser(svg, w, h)
    if (png) images++
    return png
  })
  const blob = await Packer.toBlob(document_)
  if (blob.size < 1000) throw new Error('Empty Word output')
  return { blob, images, tables: doc.getElementsByTagName('table').length }
}
