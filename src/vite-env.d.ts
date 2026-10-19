/// <reference types="vite/client" />

/** vite.config.ts define — package.json version / 빌드 날짜(KST, YYYY-MM-DD) */
declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string

/** pdfmake 표준 글꼴 컨테이너(AFM) — 도면 PDF 의 Helvetica */
declare module 'pdfmake/build/standard-fonts/Helvetica' {
  const container: { vfs: Record<string, unknown>; fonts: Record<string, Record<string, string>> }
  export default container
}
