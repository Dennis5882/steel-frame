/* dxf (skymakerolof/dxf 5.3.1) — 타입 선언이 없어 dxfRead.ts 가 쓰는 부분만 적는다. 객체 필드는 dxfRead.ts 가 종류별로 읽는다 */
declare module 'dxf' {
  export class Helper {
    constructor(contents: string)
    /** 파싱 결과 — header($INSUNITS·범위 등), blocks, entities */
    readonly parsed: { header: Record<string, any>; blocks: { name: string; entities: any[] }[]; entities: any[] }
    /** 블록을 펼친 객체 목록 — 블록 안 객체는 transforms(배율·회전·이동)를 들고 있다 */
    readonly denormalised: any[]
  }
}
