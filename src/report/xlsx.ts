/* 최소 Excel(.xlsx) 작성기 — 시트 하나, 문자열은 inline string, 숫자 모양 문자열은 숫자 칸.
   외부 엑셀 라이브러리 없이 jszip(이미 의존성)으로 OOXML 파트만 묶는다. 브라우저에서 생성, 서버 전송 없음. */
import JSZip from 'jszip'

export type XlsxRowStyle = 'title' | 'header' | undefined
export interface XlsxSheet { name: string; rows: unknown[][]; styleOf?: (row: unknown[], index: number) => XlsxRowStyle; widths?: number[] }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  // XML 1.0 에 허용되지 않는 제어 문자 제거
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
const col = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const NUMERIC = /^-?\d+(\.\d+)?$/

function sheetXml({ rows, styleOf, widths }: XlsxSheet): string {
  const cols = widths?.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const body = rows.map((row, r) => {
    const st = styleOf?.(row, r), s = st === 'title' ? ' s="1"' : st === 'header' ? ' s="2"' : ''
    const cells = row.map((v, c) => {
      const ref = `${col(c)}${r + 1}`
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`
      const text = v == null ? '' : String(v)
      if (!text) return ''
      if (NUMERIC.test(text) && st !== 'header') return `<c r="${ref}"${s}><v>${Number(text)}</v></c>`
      return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(text)}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF1F7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

/** OOXML 파트 (경로 → 내용) — 테스트가 내용을 직접 검사할 수 있게 순수 함수 */
export function xlsxParts(sheet: XlsxSheet): Record<string, string> {
  const name = esc(sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1')
  return {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES,
    'xl/worksheets/sheet1.xml': sheetXml(sheet),
  }
}

export async function createXlsx(sheet: XlsxSheet): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, xml] of Object.entries(xlsxParts(sheet))) zip.file(path, xml)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' })
}
