/** Recovery for an interrupted live runner; opens its backup and verifies its recorded DB hashes. */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {MidasClient} from 'midas-nx'
import {readMapiKey} from './mapi-key'
const folder=process.argv[2]
assert.ok(folder?.startsWith('output/'),'Pass the live evidence folder')
const path=`${folder}/evidence.json`,state=JSON.parse(readFileSync(path,'utf8'))
assert.ok(state.backup&&state.before,'Evidence must contain backup and before hashes')
const client=new MidasClient({mapiKey:await readMapiKey(),product:'gen',timeout:120000})
const command=async(path:string,arg:string)=>{const r:any=await client.request('POST',path,{Argument:arg});assert.equal(r.message,'MIDAS GEN NX command complete',path)}
await command('/doc/saveas',`${state.backup}.recovery-scratch.mgbx`)
await command('/doc/open',state.backup)
state.after={}
const canonical=(x:unknown)=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
for(const db of Object.keys(state.before))state.after[db]=createHash('sha256').update(canonical(await client.request('GET',`/db/${db}`))).digest('hex')
state.restored=Object.keys(state.before).every(db=>state.before[db]===state.after[db])
state.interrupted=true
writeFileSync(path,JSON.stringify(state,null,2))
assert.ok(state.restored,'Restore hash mismatch')
console.log(`Original restored; ${Object.keys(state.before).length} DB hashes match`)
