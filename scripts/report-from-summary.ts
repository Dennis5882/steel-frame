/* 라이브 결과(live-tw/live-cn 의 -summary.json)로 계산서 HTML 을 다시 만든다 — Gen 재해석 없이 계산서 양식만 고쳐 볼 때.
   실행: node --import tsx scripts/report-from-summary.ts <summary.json> <out.html> [ko|en|zh-TW|zh-CN]
   형상·하중은 스펙으로 다시 계산(순수), 반력·검토·접합·최적화는 JSON 그대로. */
import { readFileSync, writeFileSync } from 'node:fs'

const [src, out, lang = 'ko'] = process.argv.slice(2)
if (!src || !out) throw new Error('usage: report-from-summary.ts <summary.json> <out.html> [lang]')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
;(globalThis as any).__APP_VERSION__ = pkg.version
;(globalThis as any).document = { documentElement: { lang, dataset: {} } }
;(globalThis as any).localStorage = { getItem: () => lang, setItem() {} }
const { setLang, normalizeLang } = await import('../src/i18n')
const { buildPortal } = await import('../src/domain/portal')
const { buildLoadPayloads } = await import('../src/domain/loads')
const { buildReport } = await import('../src/report/report')
const l = normalizeLang(lang)
if (l) setLang(l)
const j = JSON.parse(readFileSync(src, 'utf8'))
const model = buildPortal(j.spec), p = buildLoadPayloads(j.spec, model)
const built = {
  spec: j.spec, model, info: p.info, cases: Object.values(p.STLD).map((c: any) => c.NAME),
  combos: Object.keys(p['LCOM-GEN']).length, comboNames: Object.values(p['LCOM-GEN']).map((c: any) => c.NAME),
}
writeFileSync(out, buildReport({ built: built as any, reactions: j.reactions, design: j.design, connections: j.connections, opt: j.opt }))
console.log(`report: ${out}`)
