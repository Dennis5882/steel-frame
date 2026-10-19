/* 접합부 상세(dims) 표시 — 키는 사전 dim_<key>, 값 속 영문 관용구는 ph_* 로 화면 언어에 맞춘다.
   dims 자체(도메인 결과·DXF·물량 파싱)는 영문 그대로 두고 표시할 때만 바꾼다 — DXF 는 ASCII 필요, 물량은 'PL …'·'n-M d' 형식을 읽음. */
import { t, type I18nKey } from '../i18n'
import { en } from '../i18n/dict/en'

const has = (k: string): k is I18nKey => Object.hasOwn(en, k)

export const dimLabel = (k: string) => (has(`dim_${k}`) ? t(`dim_${k}` as I18nKey) : k)

/** 관용구 치환 (긴 것부터) */
export function dimValue(v: unknown): string {
  return String(v)
    .replace(/web fillet/g, t('ph_web_fillet'))
    .replace(/flanges CJP/g, t('ph_flange_cjp'))
    .replace(/\bweb\b/g, t('ph_web'))
    .replace(/\s?\/\s?side/g, ` ${t('ph_per_side')}`)
    .replace(/\bedge\b/g, t('ph_edge'))
    .replace(/\bminimum\b/g, t('ph_min'))
    .replace(/\bembedded\b/g, t('ph_embedded'))
    .replace(/\bfriction\b/g, t('ph_friction'))
}

/** 'plate: PL … · bolts: …' 한 줄 */
export const dimsText = (dims: Record<string, string | number>, sep = ' · ') =>
  Object.entries(dims).map(([k, v]) => `${dimLabel(k)}: ${dimValue(v)}`).join(sep)
