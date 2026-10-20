/* 산출물 시트 행 작성기 (물량 산출서·검토 결과 공통) — 제목·머리 행을 만들 때 표시해 두고 styleOf 가 그 표시를 읽는다
   (글자 비교로 찾지 않는다). 작성기는 공장 앱 report/xlsx.ts */
import type { XlsxRowStyle, XlsxSheet } from '../report/xlsx'

export function sheetRows() {
  const rows: unknown[][] = [], style = new Map<number, XlsxRowStyle>()
  const put = (cells: unknown[], s?: XlsxRowStyle) => { if (s) style.set(rows.length, s); rows.push(cells) }
  return {
    title: (text: string) => put([text], 'title'),
    header: (cells: unknown[]) => put(cells, 'header'),
    row: (cells: unknown[]) => put(cells),
    blank: () => put([]),
    sheet: (name: string, widths: number[]): XlsxSheet => ({ name, rows, widths, styleOf: (_r, i) => style.get(i) }),
  }
}
