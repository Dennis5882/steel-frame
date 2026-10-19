/* 3D 단면 형상 메시 회귀 (drawing/solid, 순수) — 실행: node --import tsx scripts/verify-solid.ts
   모든 요소가 메시가 되고(H 3상자·CC 5상자·P 12각), 좌표 유한, 삼각형 번호 범위 안, 단면 폭·춤이 실제 치수와 같은지. */
import assert from 'node:assert/strict'
import { addElementSolid, emptyMesh, solidMeshes } from '../src/drawing/solid'
import { buildPortal, risingAt } from '../src/domain/portal'
import { CN_DEFAULT_SPEC, DEFAULT_SPEC } from '../src/domain/types'

let n = 0
for (const spec of [DEFAULT_SPEC, CN_DEFAULT_SPEC]) {
  const m = buildPortal(spec)
  const meshes = solidMeshes(m, risingAt(spec), spec.roofSlope, (e) => e.role)
  let verts = 0, tris = 0
  for (const [, mesh] of meshes) {
    const nv = mesh.x.length
    assert.ok([mesh.x, mesh.y, mesh.z].every((a) => a.length === nv && a.every(Number.isFinite)), 'finite vertices'); n++
    assert.ok([mesh.i, mesh.j, mesh.k].every((a) => a.length === mesh.i.length && a.every((v) => v >= 0 && v < nv)), 'triangle indices in range'); n++
    verts += nv; tris += mesh.i.length
  }
  assert.equal([...meshes.keys()].sort().join(), [...new Set(m.elements.map((e) => e.role))].sort().join(), 'every role meshed'); n++
  console.log(`${spec.code}: ${m.elements.length} elements → ${verts} vertices, ${tris} triangles`)
}
/* 치수: 기둥(연직) H — 폭(Y)·춤(X) 이 단면 B·H 와 같음 */
const spec = DEFAULT_SPEC, model = buildPortal(spec)
const col = model.elements.find((e) => e.role === 'column')!
const byId = new Map(model.nodes.map((x) => [x.id, x]))
const mesh = emptyMesh()
addElementSolid(mesh, col, byId.get(col.n1)!, byId.get(col.n2)!, risingAt(spec), spec.roofSlope)
const [, dims] = col.section.split(/\s+/), [H, B] = dims.replace('/', 'x').split('x').map(Number)
const ext = (a: number[]) => Math.max(...a) - Math.min(...a)
assert.ok(Math.abs(ext(mesh.x) - H / 1000) < 1e-9, `column depth along X = ${H} mm`); n++
assert.ok(Math.abs(ext(mesh.y) - B / 1000) < 1e-9, `column width along Y = ${B} mm`); n++
assert.equal(mesh.i.length, 3 * 12, 'H = 3 boxes × 12 triangles'); n++
console.log(`Solid sections: ${n} checks passed`)
