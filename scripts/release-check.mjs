// 버전과 릴리즈 노트가 함께 움직이지 않으면 빌드 실패 (npm run build → Vercel 빌드에도 적용):
//  - package.json version == src/data/releases.json 최신 항목
//  - 버전 중복 없음·엄격 내림차순 semver, 날짜 YYYY-MM-DD·비증가
//  - 모든 항목의 노트 rn_<id>_1..items 가 네 언어 사전에 있고 비어 있지 않음, 남는 rn_* 키 없음
// 새 버전은 `npm run release -- patch|minor|major` 로만 연다.
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const pkg = JSON.parse(read('package.json'))
const releases = JSON.parse(read('src/data/releases.json'))
const LANGS = ['en', 'ko', 'zh-TW', 'zh-CN']
const errors = []

const sv = (v) => v.split('.').map(Number)
const cmp = (a, b) => { const x = sv(a), y = sv(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 }

if (!releases.length) errors.push('releases.json is empty')
else if (releases[0].version !== pkg.version)
  errors.push(`package.json version ${pkg.version} != newest release ${releases[0].version} — use \`npm run release\`, never edit by hand`)

const ids = new Set()
releases.forEach((r, i) => {
  if (!/^\d+\.\d+\.\d+$/.test(r.version)) errors.push(`bad version "${r.version}"`)
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.date)) errors.push(`${r.version}: bad date "${r.date}" (KST 'YYYY-MM-DD HH:mm')`)
  if (!(Number.isInteger(r.items) && r.items > 0)) errors.push(`${r.version}: items must be ≥ 1`)
  if (r.id !== 'v' + r.version.replace(/\./g, '_')) errors.push(`${r.version}: id must be v${r.version.replace(/\./g, '_')}`)
  if (ids.has(r.id)) errors.push(`duplicate id ${r.id}`)
  ids.add(r.id)
  const next = releases[i + 1]
  if (next) {
    if (cmp(r.version, next.version) <= 0) errors.push(`${r.version} must be newer than ${next.version}`)
    if (r.date < next.date) errors.push(`${r.version} date ${r.date} is before ${next.version}'s ${next.date}`)
  }
})

/* 사전 TS 파일에서 rn_* 키와 문자열 값 추출 (작은따옴표 한 줄 문자열) */
const KEY = /^\s*(rn_v\d+_\d+_\d+_\d+):\s*'((?:[^'\\]|\\.)*)',?\s*$/
for (const lang of LANGS) {
  const found = new Map()
  for (const l of read(`src/i18n/dict/${lang}.ts`).split(/\r?\n/)) {
    const m = l.match(KEY)
    if (m) found.set(m[1], m[2])
  }
  const expected = new Set()
  for (const r of releases)
    for (let i = 1; i <= r.items; i++) {
      const k = `rn_${r.id}_${i}`
      expected.add(k)
      if (!found.get(k)?.trim()) errors.push(`${lang}: release note ${k} (v${r.version}) is missing or empty`)
    }
  for (const k of found.keys()) if (!expected.has(k)) errors.push(`${lang}: stray release note ${k}`)
}

if (errors.length) {
  for (const e of errors) console.error('✗ ' + e)
  console.error(`release: ${errors.length} error(s)`)
  process.exit(1)
}
console.log(`release: v${pkg.version} · ${releases.length} releases · notes complete in ${LANGS.length} languages`)
