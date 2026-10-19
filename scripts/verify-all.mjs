/* 품질 게이트 — 오프라인 회귀를 모두 실행 (Gen·키 불필요). npm run verify
   하나라도 실패하면 종료 코드 1. 커밋 전에 실행 (빌드와 별도 — Vercel 빌드에는 넣지 않음).
   스택을 브라우저 수준(500 KB)으로 줄여 실행 — Node 기본(984 KB)에서는 큰 배열 펼치기(push(...11만 행))가 통과해 브라우저 전용 오류를 놓쳤다. */
import { spawnSync } from 'node:child_process'

const SUITES = [
  ['Crane operating range', 'verify-crane-travel.ts'],
  ['Modeling structure flow', 'verify-modeling-flow.ts'],
  ['Gen property source', 'verify-gen-section-source.ts'],
  ['NG diagnosis / repair', 'verify-remediation.ts'],
  ['Openings / interface', 'verify-phase6.ts'],
  ['Runway / closed doors', 'verify-phase5.ts'],
  ['Factory additions', 'verify-additions.ts'],
  ['Review regression', 'verify-review-fixes.ts'],
  ['TW hand-calc + golden', 'verify-tw.ts'],
  ['TW cold-formed + Q', 'verify-tw-coldformed.ts'],
  ['CN code anchors', 'verify-cn.ts'],
  ['CN golden', 'verify-golden.ts'],
  ['KR code anchors', 'verify-kr.ts'],
  ['KR golden', 'verify-golden.ts', '--code', 'KR'],
  ['Result integrity', 'verify-results.ts'],
  ['Job / send / cancel', 'verify-job.ts'],
  ['Gen sync', 'verify-sync.ts'],
  ['Input validation', 'verify-input.ts'],
  ['Gen catalog audit', 'verify-catalog-audit.ts'],
  ['Spec change / job steps', 'verify-workflow.ts'],
  ['Click workspace', 'verify-workspace.ts'],
  ['Task flow / history', 'verify-task-flow.ts'],
  ['Optimization pick', 'verify-opt.ts'],
  ['3D solid sections', 'verify-solid.ts'],
  ['Cross-section types', 'verify-frames.ts'],
  ['Quantities', 'verify-quantities.ts'],
  ['PDF + fonts', 'verify-pdf.ts'],
]
const t0 = Date.now()
let failed = 0
for (const [name, file, ...args] of SUITES) {
  const t = Date.now()
  const r = spawnSync(process.execPath, ['--stack-size=500', '--import', 'tsx', `scripts/${file}`, ...args], { encoding: 'utf8' })
  const ok = r.status === 0
  if (!ok) failed++
  const last = (ok ? r.stdout : r.stderr || r.stdout).trim().split('\n').filter(Boolean).at(-1) ?? ''
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${((Date.now() - t) / 1000).toFixed(1).padStart(5)}s  ${last.slice(0, 110)}`)
  if (!ok) console.log((r.stderr || r.stdout).split('\n').slice(0, 12).map((l) => `      ${l}`).join('\n'))
}
console.log(`\n${failed ? `${failed} suite(s) FAILED` : `all ${SUITES.length} suites passed`} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
process.exit(failed ? 1 : 0)
