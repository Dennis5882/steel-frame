/* 최소 DXF (AutoCAD R12, ASCII) 작성기 — LINE·CIRCLE·TEXT·레이어. 단위 mm ($INSUNITS 4).
   R12 는 비ASCII 문자 인코딩이 환경마다 달라 도면 문자는 영문·숫자만 쓴다.
   같은 그리기 명령을 시트별로 기록해 SVG 로도 내보낸다(toSvgSheets) — 계산서에 DXF 와 같은 도면을 넣기 위함. */

export interface Layer { name: string; color: number }

type Prim =
  | { k: 'l'; layer: string; x1: number; y1: number; x2: number; y2: number }
  | { k: 'c'; layer: string; x: number; y: number; r: number }
  | { k: 't'; layer: string; x: number; y: number; h: number; s: string; align: 0 | 1 | 2; rot: number }
interface Sheet { name: string; x: number; y: number; w: number; h: number; prims: Prim[] }

/** SVG 레이어 스타일 — 색(흰 종이 기준), 선 굵기(px, 화면 고정), 점선 */
export interface SvgLayerStyle { color: string; width: number; dash?: string }

export class Dxf {
  private ents: string[] = []
  private sheets: Sheet[] = []
  constructor(private layers: Layer[]) {}

  /** 시트 시작 — 이후 그리기 명령은 이 시트의 SVG 에 들어간다 (영역 = 테두리 사각형) */
  beginSheet(name: string, x: number, y: number, w: number, h: number): void {
    this.sheets.push({ name, x, y, w, h, prims: [] })
  }
  private rec(p: Prim): void { this.sheets[this.sheets.length - 1]?.prims.push(p) }
  sheetList(): readonly Sheet[] { return this.sheets }

  line(layer: string, x1: number, y1: number, x2: number, y2: number): void {
    this.rec({ k: 'l', layer, x1, y1, x2, y2 })
    this.ents.push(`0\nLINE\n8\n${layer}\n10\n${r(x1)}\n20\n${r(y1)}\n30\n0\n11\n${r(x2)}\n21\n${r(y2)}\n31\n0`)
  }
  circle(layer: string, x: number, y: number, rad: number): void {
    this.rec({ k: 'c', layer, x, y, r: rad })
    this.ents.push(`0\nCIRCLE\n8\n${layer}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(rad)}`)
  }
  /** align: 0 = 왼쪽, 1 = 가운데, 2 = 오른쪽 (기준점 = 글자 아래선) */
  text(layer: string, x: number, y: number, h: number, s: string, align: 0 | 1 | 2 = 0, rot = 0): void {
    const ascii = toAscii(s)
    this.rec({ k: 't', layer, x, y, h, s: ascii, align, rot })
    const al = align ? `\n72\n${align}\n11\n${r(x)}\n21\n${r(y)}\n31\n0` : ''
    this.ents.push(`0\nTEXT\n8\n${layer}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(h)}\n1\n${ascii}${rot ? `\n50\n${rot}` : ''}${al}`)
  }
  rect(layer: string, x: number, y: number, w: number, h: number): void {
    this.line(layer, x, y, x + w, y); this.line(layer, x + w, y, x + w, y + h)
    this.line(layer, x + w, y + h, x, y + h); this.line(layer, x, y + h, x, y)
  }
  /** 수평·수직 치수 — 치수선 + 끝 표시 + 값 */
  dim(layer: string, x1: number, y1: number, x2: number, y2: number, off: number, h: number, label?: string): void {
    const horiz = Math.abs(y2 - y1) < Math.abs(x2 - x1)
    if (horiz) {
      const y = Math.min(y1, y2) - off
      this.line(layer, x1, y, x2, y); this.line(layer, x1, y - h / 2, x1, y + h / 2); this.line(layer, x2, y - h / 2, x2, y + h / 2)
      this.text(layer, (x1 + x2) / 2, y + h * 0.4, h, label ?? String(Math.round(Math.abs(x2 - x1))), 1)
    } else {
      const x = Math.min(x1, x2) - off
      this.line(layer, x, y1, x, y2); this.line(layer, x - h / 2, y1, x + h / 2, y1); this.line(layer, x - h / 2, y2, x + h / 2, y2)
      this.text(layer, x - h * 0.4, (y1 + y2) / 2, h, label ?? String(Math.round(Math.abs(y2 - y1))), 1, 90)
    }
  }

  toString(): string {
    const layerTbl = this.layers.map((l) => `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS`).join('\n')
    return [
      '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC',
      `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${this.layers.length}\n${layerTbl}\n0\nENDTAB\n0\nENDSEC`,
      `0\nSECTION\n2\nENTITIES\n${this.ents.join('\n')}\n0\nENDSEC`,
      '0\nEOF\n',
    ].join('\n')
  }
}

/** 시트별 SVG — 모델 mm 좌표 그대로 viewBox (y 뒤집음), 선 굵기는 화면 고정(non-scaling-stroke) */
export function toSvgSheets(d: Dxf, style: Record<string, SvgLayerStyle>): { name: string; svg: string }[] {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  return d.sheetList().map((sh) => {
    const st = (l: string) => style[l] ?? { color: '#111', width: 0.6 }
    const body = sh.prims.map((p) => {
      const s = st(p.layer)
      if (p.k === 'l') return `<line x1="${r(p.x1)}" y1="${r(-p.y1)}" x2="${r(p.x2)}" y2="${r(-p.y2)}" stroke="${s.color}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} vector-effect="non-scaling-stroke"/>`
      if (p.k === 'c') return `<circle cx="${r(p.x)}" cy="${r(-p.y)}" r="${r(p.r)}" fill="none" stroke="${s.color}" stroke-width="${s.width}" vector-effect="non-scaling-stroke"/>`
      const anchor = ['start', 'middle', 'end'][p.align]
      return `<text x="${r(p.x)}" y="${r(-p.y)}" font-size="${r(p.h * 1.35)}" text-anchor="${anchor}" fill="${s.color}"${p.rot ? ` transform="rotate(${-p.rot} ${r(p.x)} ${r(-p.y)})"` : ''}>${esc(p.s)}</text>`
    }).join('')
    const vb = `${r(sh.x)} ${r(-(sh.y + sh.h))} ${r(sh.w)} ${r(sh.h)}`
    return { name: sh.name, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" font-family="Arial,Helvetica,sans-serif" style="width:100%;height:auto">${body}</svg>` }
  })
}

/** DXF R12 는 ASCII 만 — 치수·단위 기호는 읽히는 글자로 바꾸고 나머지만 '?' (예전엔 PL 250×704×28 → PL 250?704?28) */
const ASCII_SUB: Record<string, string> = { '×': 'x', '·': '.', '²': '2', '³': '3', '°': ' deg', '−': '-', '–': '-', '—': '-', '≤': '<=', '≥': '>=', 'φ': 'phi', 'Ø': 'D' }
export const toAscii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => ASCII_SUB[c] ?? '?')

const r = (v: number) => (Math.round(v * 100) / 100).toString()
