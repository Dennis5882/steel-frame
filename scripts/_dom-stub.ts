/* 테스트용 최소 DOM — i18n 이 import 시 document.documentElement.lang 을 설정 */
;(globalThis as any).document ??= { documentElement: { lang: 'ko', dataset: {} } }
export {}
