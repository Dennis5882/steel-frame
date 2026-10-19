/* 언어 레지스트리 — 지원 언어의 단일 출처.
   언어 추가 = 여기 한 줄 + src/i18n/dict/<code>.ts (Dict 타입이 키 누락을 컴파일 오류로 잡는다). */
export const LANG_DEFS = [
  { code: 'ko', label: '한국어', html: 'ko' },
  { code: 'en', label: 'English', html: 'en' },
  { code: 'zh-TW', label: '繁體中文', html: 'zh-Hant' }, // 대만 번체
  { code: 'zh-CN', label: '简体中文', html: 'zh-Hans' }, // 대륙 간체
] as const

export type Lang = (typeof LANG_DEFS)[number]['code']
export const LANGS: readonly Lang[] = LANG_DEFS.map((d) => d.code)
export const DEFAULT_LANG: Lang = 'ko'

export function normalizeLang(raw: string | null | undefined): Lang | null {
  return raw && (LANGS as readonly string[]).includes(raw) ? (raw as Lang) : null
}

/** 브라우저 선호 언어 → 지원 언어. zh-TW/HK/MO·Hant → 번체, 그 밖의 zh → 간체 */
export function detectLang(prefs: readonly string[] | null | undefined): Lang | null {
  for (const raw of prefs ?? []) {
    const l = String(raw).toLowerCase()
    if (/^zh-(tw|hk|mo|hant)/.test(l)) return 'zh-TW'
    if (/^zh\b/.test(l)) return 'zh-CN'
    if (/^ko\b/.test(l)) return 'ko'
    if (/^en\b/.test(l)) return 'en'
  }
  return null
}

export function htmlLang(l: Lang): string {
  return LANG_DEFS.find((d) => d.code === l)?.html ?? l
}
