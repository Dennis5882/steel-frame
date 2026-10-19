import type { CodeId } from '../codes/types'
import { genSectionRecord } from './sections'

/** Check the installed Gen's MM table against the frozen source; no response means no verification. */
export function sectionSourceDifferences(code: CodeId, sent: Record<string, any>, table: any): string[] {
  const expected = Object.entries(sent).flatMap(([id,s]) => {
    const name = s?.SECT_BEFORE?.SECT_I?.SECT_NAME
    const source = typeof name === 'string' ? genSectionRecord(name,code) : undefined
    return source && !source.excluded ? [{id,source,db:s?.SECT_BEFORE?.SECT_I?.DB_NAME}] : []
  })
  if (!expected.length) return [] // Explicit dimension-based, noncatalog model.
  if(table?.DIST!=='MM'||!Array.isArray(table.HEAD)||!Array.isArray(table.DATA))return ['SECTIONALL: missing MM property table']
  const values = new Map<string, Record<string,string>>()
  for(const row of table.DATA) {
    if(!Array.isArray(row))return ['SECTIONALL: invalid row']
    const record=Object.fromEntries(table.HEAD.map((h:string,i:number)=>[h,row[i]]))
    if(values.has(String(record.ID)))return ['SECTIONALL: duplicate section ID']
    values.set(String(record.ID),record)
  }
  const errors:string[]=[]
  for(const {id,source,db} of expected) {
    if(db!==source.db)errors.push(`${source.name}: DB ${db} != ${source.db}`)
    const row=values.get(id)
    for(const [heading,key] of [['Area','A'],['Iyy','Ix'],['Izz','Iy'],['Ixx','J']] as const) {
      const actual=Number(row?.[heading]),expected=source[key]
      if(!row||!String(row[heading]??'').trim()||!Number.isFinite(actual)||Math.abs(actual-expected)>Math.max(.000051,Math.abs(expected)*1e-9))errors.push(`${source.db}/${source.name}: ${heading}`)
    }
  }
  return errors
}
