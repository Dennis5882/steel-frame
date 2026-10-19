/* Open a saved Gen model: npx tsx scripts/gate/open.ts <path> < /dev/null */
import { MidasClient } from 'midas-nx'
import { readMapiKey } from '../mapi-key'
const client = new MidasClient({ mapiKey: await readMapiKey(), product: 'gen', timeout: 120000 })
console.log(JSON.stringify(await client.request('POST', '/doc/open', { Argument: process.argv[2] })))
