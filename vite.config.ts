import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }
import { en } from './src/i18n/dict/en'
import { ko } from './src/i18n/dict/ko'
import { zhCN } from './src/i18n/dict/zh-CN'
import { zhTW } from './src/i18n/dict/zh-TW'
import { LANG_DEFS } from './src/i18n/types'

/* 언어별 공유 링크 (story 와 같은 방식) — 메신저 링크 미리보기는 JS 를 실행하지 않고 HTML <title>/og 메타만 읽는다.
   그래서 /en/ 등 언어별 정적 index.html 을 만들고 미리보기 문구를 그 언어로 둔다(문구 = 사전 meta_title/meta_desc).
   앱은 경로(또는 ?lang=)의 언어로 시작한다(src/i18n/index.ts). 루트(/)는 ko. */
const META: Record<string, { meta_title: string; meta_desc: string }> = { en, ko, 'zh-TW': zhTW, 'zh-CN': zhCN }
const OG_LOCALE: Record<string, string> = { ko: 'ko_KR', en: 'en_US', 'zh-TW': 'zh_TW', 'zh-CN': 'zh_CN' }
const META_RE = /<!--meta-->[\s\S]*?<!--\/meta-->/
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const metaOf = (code: string) => {
  const d = META[code], title = esc(d.meta_title), desc = esc(d.meta_desc)
  return `<!--meta--><title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${title}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:locale" content="${OG_LOCALE[code] ?? code.replace('-', '_')}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}"><!--/meta-->`
}
function langPages(): Plugin {
  return {
    name: 'lang-pages',
    transformIndexHtml: { order: 'post', handler: (html) => (META_RE.test(html) ? html.replace(META_RE, metaOf('ko')) : html) },
    closeBundle() {
      const src = resolve(import.meta.dirname, 'dist/index.html')
      let base: string
      try { base = readFileSync(src, 'utf8') } catch { return } // 산출물 없음(dev 등)
      for (const d of LANG_DEFS) {
        const page = base.replace(/<html lang="[^"]*">/, `<html lang="${d.html}">`).replace(META_RE, metaOf(d.code))
        /* 대소문자 둘 다(/zh-TW/ · /zh-tw/) — 정적 호스팅 경로는 대소문자 구분 */
        for (const dir of new Set([d.code, d.code.toLowerCase()])) {
          mkdirSync(resolve(import.meta.dirname, 'dist', dir), { recursive: true })
          writeFileSync(resolve(import.meta.dirname, 'dist', dir, 'index.html'), page)
        }
      }
    },
  }
}

/** 빌드 날짜 (KST, YYYY-MM-DD) — 하단 바 표시 */
const buildDate = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') // KST 날짜 + 시각

export default defineConfig({
  plugins: [react(), tailwindcss(), langPages()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  server: { proxy: { '/api': 'http://localhost:3000' } }, // `vercel dev --listen 3000`
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
})
