import { buildPortal } from './portal.ts'
import { DEFAULT_SPEC } from './types.ts'

const m = buildPortal(DEFAULT_SPEC)
const count = (r: string) => m.elements.filter((e) => e.role === r).length
console.log('nodes', m.nodes.length, 'elements', m.elements.length)
for (const r of ['column', 'rafter', 'purlin', 'girt', 'strut']) console.log(r, count(r))
