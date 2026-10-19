// 새 버전 열기: `npm run release -- patch|minor|major [--items N]` (rebar-repair 와 같은 방식).
// package.json(+ lock) version 을 올리고, src/data/releases.json 맨 앞에 항목을 추가하며(date = 지금 KST 'YYYY-MM-DD HH:mm'),
// 네 언어 사전(src/i18n/dict/*.ts)의 앵커 줄 위에 빈 노트 키 rn_<id>_1..N 을 넣는다.
// 노트를 모두 쓰기 전에는 release-check(빌드에 포함)가 실패 → 버전업과 릴리즈 노트는 항상 같은 커밋.
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const level = process.argv[2]
const itemsArg = process.argv.indexOf('--items')
const items = itemsArg > 0 ? Number(process.argv[itemsArg + 1]) : 3
if (!['patch', 'minor', 'major'].includes(level) || !(items >= 1)) {
  console.error('usage: npm run release -- patch|minor|major [--items N]')
  process.exit(1)
}

const pkgPath = new URL('package.json', root)
const pkgTxt = readFileSync(pkgPath, 'utf8')
let [ma, mi, pa] = JSON.parse(pkgTxt).version.split('.').map(Number)
if (level === 'major') [ma, mi, pa] = [ma + 1, 0, 0]
else if (level === 'minor') [mi, pa] = [mi + 1, 0]
else pa += 1
/* 자릿수 올림 (사용자 규칙 2026-10-16): minor·patch 는 0~9 — 10 이 되면 윗자리로. 예) 0.9.x minor → 1.0.0, 1.2.9 patch → 1.3.0 */
if (pa >= 10) [mi, pa] = [mi + 1, 0]
if (mi >= 10) [ma, mi, pa] = [ma + 1, 0, 0]
const version = `${ma}.${mi}.${pa}`
const id = 'v' + version.replace(/\./g, '_')
/* 날짜 + 시각 (사용자 규칙 2026-10-16) — KST 'YYYY-MM-DD HH:mm' */
const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')

const setVersion = (txt) => txt.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`)
writeFileSync(pkgPath, setVersion(pkgTxt))
const lockPath = new URL('package-lock.json', root)
try {
  let lock = readFileSync(lockPath, 'utf8')
  lock = setVersion(lock)
  lock = lock.replace(/("packages":\s*\{\s*"":\s*\{[^}]*?"version":\s*")[^"]+(")/, `$1${version}$2`)
  writeFileSync(lockPath, lock)
} catch { /* lock 없음 */ }

const relPath = new URL('src/data/releases.json', root)
const rel = JSON.parse(readFileSync(relPath, 'utf8'))
rel.unshift({ version, date: kst, id, items })
writeFileSync(relPath, '[\n' + rel.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n')

/* 사전 파일은 줄 단위로 끼워 넣는다 (재직렬화 금지) — 앵커 = '@release-notes' 주석 줄 */
for (const lang of ['en', 'ko', 'zh-TW', 'zh-CN']) {
  const p = new URL(`src/i18n/dict/${lang}.ts`, root)
  const txt = readFileSync(p, 'utf8')
  const eol = txt.includes('\r\n') ? '\r\n' : '\n'
  const lines = txt.split(eol)
  const at = lines.findIndex((l) => l.includes('@release-notes'))
  if (at < 0) throw new Error(`${lang}: no @release-notes anchor`)
  const add = Array.from({ length: items }, (_, i) => `  rn_${id}_${i + 1}: '',`)
  lines.splice(at + 1, 0, ...add)
  writeFileSync(p, lines.join(eol))
}

console.log(`v${version} (${kst}) opened with ${items} empty note(s): rn_${id}_1..${items}`)
console.log('Write them in ko / en / zh-TW / zh-CN — the build fails until every note is filled.')
