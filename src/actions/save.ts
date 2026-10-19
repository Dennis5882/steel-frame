/* 자동 저장 — Gen NX 확인 창(저장 안 된 문서의 "저장할까요?"·해석 거부)이 뜨면 API 전체가 멈춘다.
   그래서 doc/new·doc/anal 직전에 항상 doc/saveas 로 임시 파일에 저장해 문서를 '저장됨' 상태로 만든다.
   경로는 Gen NX 실행 PC 기준. 사용자 폴더를 추정하면 "잘못된 경로" 창이 뜨므로 고정 폴더(S.saveDir, 기본 C:/temp)를 쓴다(story 규칙).
   파일명에 시각을 넣어 덮어쓰기 확인 창도 피한다. */
import { mapi } from '../mapi/client'
import { S } from '../state/store'
import { t } from '../i18n'
import { Cancelled } from './job'

/** YYYYMMDD_hhmmss (브라우저 현지 시각) */
function stamp(): string {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function autoSavePath(tag: string): string {
  let dir = S.saveDir.trim().split('\\').join('/')
  while (dir.endsWith('/')) dir = dir.slice(0, -1)
  return `${dir || 'C:/temp'}/sms_${tag}_${stamp()}.mgbx`
}

/** 저장한 경로를 돌려준다 (Gen PC 기준) */
export async function autoSave(tag: 'backup' | 'model'): Promise<string> {
  const path = autoSavePath(tag)
  try {
    const res = await mapi<{ message?: string }>('POST', '/doc/saveas', { Argument: path }, path)
    // HTTP 200 alone is insufficient: Gen also returns command refusals as messages.
    if (res?.message !== 'MIDAS GEN NX command complete') throw new Error(String(res?.message ?? t('gen_bad_response')))
    return path
  } catch (e) {
    if (e instanceof Cancelled) throw e
    throw new Error(t('save_failed', path, e instanceof Error ? e.message : String(e)))
  }
}
