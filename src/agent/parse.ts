/* 로컬 명령 해석 — ko/en/zh-TW/zh-CN 키워드. 간체 전용 글자는 번체로 정규화한 뒤 번체 정규식만 쓴다(story 방식). */
import type { TemplateKey } from '../domain/templates'
import type { FactorySpec } from '../domain/types'

/** 모델링 방식 — template: 기본 모델링(유형 → 요약 카드, [수정]으로 편집) / free: 자유골조(처음부터 편집 카드, 베이별 간격) */
export type BuildMode = 'template' | 'free'

export type Intent =
  | { intent: 'help' }
  | { intent: 'new'; params: Partial<FactorySpec>; mode: BuildMode; tpl?: TemplateKey }
  | { intent: 'analyze' }
  | { intent: 'reactions' }
  | { intent: 'design' }
  | { intent: 'optimize' }
  | { intent: 'report' }
  | { intent: 'pdf' }
  | { intent: 'docx' }
  | { intent: 'quantities' }
  | { intent: 'quantities_xlsx' }
  | { intent: 'drawings' }
  | { intent: 'drawings_pdf' }
  | { intent: 'status' }
  | { intent: 'conn' }
  | { intent: 'clear' }
  | { intent: 'release_notes' }
  | { intent: 'copy_link' }
  | { intent: 'unknown' }

/* 간체 → 번체 (명령에 쓰이는 글자만) */
const S2T: Record<string, string> = { 创: '創', 厂: '廠', 帮: '幫', 助: '助', 檐: '簷', 开: '開', 间: '間', 数: '數', 状: '狀', 设: '設', 计: '計', 验: '驗', 书: '書', 图: '圖', 纸: '紙', 态: '態', 连: '連', 接: '接', 检: '檢', 查: '查', 析: '析', 反: '反', 力: '力', 除: '除', 说: '說', 线: '線', 认: '認', 确: '確', 跨: '跨', 距: '距', 柱: '柱', 优: '優', 仓: '倉', 库: '庫', 构: '構' }
const normalizeZh = (s: string) => s.replace(/[一-鿿]/g, (c) => S2T[c] ?? c)

const NUM = '(\\d+(?:\\.\\d+)?)'
const num = (txt: string, ...words: string[]): number | undefined => {
  for (const w of words) {
    const m = txt.match(new RegExp(`(?:${w})\\s*[:=]?\\s*${NUM}`, 'i'))
    if (m) return +m[1]
  }
  return undefined
}

export function parseCommand(raw: string): Intent {
  let txt = normalizeZh(raw.trim())
  if (/^(help|\?|도움말?|명령어|說明|幫助)$/i.test(txt)) return { intent: 'help' }
  if (/(copy\s*link|share\s*link|링크\s*(복사|공유)|複製連結|分享連結|复制链接|分享链接)/i.test(txt)) return { intent: 'copy_link' }
  if (/(release\s*notes?|changelog|릴리즈|릴리스|업데이트\s*내역|版本說明|更新說明)/i.test(txt)) return { intent: 'release_notes' }
  if (/^(clear|지우기|대화\s*지우기|清除|清除對話)$/i.test(txt)) return { intent: 'clear' }
  if (/(connection|연결\s*확인|연결|連線確認|連接檢查|連線|連接)/i.test(txt)) return { intent: 'conn' }
  if (/(status|상태|狀態)/i.test(txt)) return { intent: 'status' }
  if (/(reaction|반력|反力)/i.test(txt)) return { intent: 'reactions' }
  /* 도면 PDF — 도면 단어 + pdf, 계산서 단어가 없을 때만 ('계산서 PDF 도면 포함'은 계산서) */
  if (/(drawing|dxf|도면|圖說|圖紙|图纸)/i.test(txt) && /pdf/i.test(txt) && !/(report|계산서|보고서|計算書|计算书)/i.test(txt)) return { intent: 'drawings_pdf' }
  if (/(docx|word|워드|文書|文档)/i.test(txt)) return { intent: 'docx' }
  if (/pdf/i.test(txt)) return { intent: 'pdf' }
  if (/(xlsx|excel|엑셀|엑설)/i.test(txt)) return { intent: 'quantities_xlsx' }
  if (/(quantit|csv|물량|數量|材料表)/i.test(txt)) return { intent: 'quantities' }
  if (/(report|계산서|보고서|計算書)/i.test(txt)) return { intent: 'report' }
  if (/(drawing|dxf|도면|圖說|圖紙|圖)/i.test(txt)) return { intent: 'drawings' }
  /* '최적화'는 '설계' 보다 먼저 — '설계 최적화' 같은 문장도 최적화로 */
  if (/(optimi[sz]|최적화|最佳化|優化)/i.test(txt)) return { intent: 'optimize' }
  if (/(design|설계|검토|設計|檢核|驗算)/i.test(txt)) return { intent: 'design' }
  if (/(analy[sz]|해석|分析)/i.test(txt)) return { intent: 'analyze' }
  const FREE = /(free\s*-?\s*frame|custom\s*frame|자유\s*골조|커스텀\s*골조|自由構架|自由框架)/i
  if (/(factory|portal|warehouse|공장|포털|창고|廠房|倉庫)/i.test(txt) || FREE.test(txt)) {
    const params: Partial<FactorySpec> = {}
    /* 베이별 간격 목록 '베이 6,6,7.5' → 자유골조 */
    const list = txt.match(/(?:bays?|베이(?:\s*간격)?|柱距|開間)\s*[:=]?\s*(\d+(?:\.\d+)?(?:\s*[,，、]\s*\d+(?:\.\d+)?)+)/i)
    if (list) { params.bayList = list[1].split(/[,，、]/).map((v) => +v.trim()); txt = txt.replace(list[0], '') }
    const free = FREE.test(txt) || !!list
    const tpl: TemplateKey | undefined = free ? undefined
      : /(small\s*warehouse|소형\s*창고|小型倉庫)/i.test(txt) ? 'small'
      : /(logistics|물류|物流)/i.test(txt) ? 'logistics'
      : /(long\s*-?\s*span|장\s*스팬|大跨(?!距|度))/i.test(txt) ? 'long'
      : 'general'
    /* '베이 간격'·'柱距' 를 '베이(수)' 보다 먼저 — 같은 단어를 공유 */
    const spacing = num(txt, 'bay\\s*spacing', 'spacing', '베이\\s*간격', '간격', '柱距')
    const rest = txt.replace(/(bay\s*spacing|spacing|베이\s*간격|간격|柱距)\s*[:=]?\s*\d+(\.\d+)?/gi, '')
    const span = num(rest, 'span', '스팬', '跨距', '跨度')
    const eave = num(rest, 'eave(?:\\s*height)?', '처마(?:\\s*높이)?', '簷高')
    const bays = num(rest, 'bays?', '베이(?:\\s*수)?', '跨數', '開間數')
    if (span) params.span = span
    if (eave) params.eaveHeight = eave
    if (bays) params.bays = Math.round(bays)
    if (spacing) params.baySpacing = spacing
    return { intent: 'new', params, mode: free ? 'free' : 'template', tpl }
  }
  return { intent: 'unknown' }
}
