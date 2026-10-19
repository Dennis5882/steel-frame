/* 다층 강골조 스펙·모델 타입 (CN 1차). 길이 m, 하중 kN·m, 단면 이름 = Gen DB(GB-YB05) 이름.
   기준 예제: docs/tutorial-cn-braced-frame.md */

export type Axis = 'X' | 'Y'
export type FrameRole = 'column' | 'beam' | 'brace'

/** 평면에서 빼는 직사각형 영역 (모든 층) — 격자 좌표 경계 */
export interface PlanVoid { x0: number; x1: number; y0: number; y1: number }

/** 가새 베이 — `axis` 방향 골조선(`line` = 직교 좌표) 위 a~b 구간의 각 베이에 人자형(역V) 가새 */
export interface BraceBay { axis: Axis; line: number; a: number; b: number; type: 'chevron' }

export interface FrameLoads {
  /** 바닥·지붕 마감 고정하중, 활하중 (kN/m², 하향 양수) */
  floorDead: number; floorLive: number; roofDead: number; roofLive: number
  /** 외곽 보 선하중 (kN/m, 고정하중) */
  edgeFloor: number; edgeRoof: number
}

export interface CnWindSpec {
  /** 기본풍압 w0 (kN/m²), 지면 거칠기 A~D */
  w0: number; terrain: 'A' | 'B' | 'C' | 'D'
  /** 체형계수 迎风·背风 (절댓값 합 사용) */
  muWindward: number; muLeeward: number
  /** 풍진동 감쇠비, 기본주기 (s) — 미지정이면 T = 0.22 + 0.035H/B^(1/3) */
  damping: number; Tx?: number; Ty?: number
}

export interface CnSeismicSpec {
  /** 설방열도 '7_010' 등, 설계지진분조 1~3, 场地 I0·I1·II·III·IV */
  intensity: '6_005' | '7_010' | '7_015' | '8_020' | '8_030' | '9_040'
  group: 1 | 2 | 3
  site: 'I0' | 'I1' | 'II' | 'III' | 'IV'
  damping: number
  /** 중력대표값 활하중 조합계수 (GB 50011 5.1.3) */
  liveMassFactor: number
  modes: number
  accidentalEccentricity: boolean
}

export interface CnDesignSpec {
  /** 抗震等级 1~4 (钢结构) */
  seismicGrade: 1 | 2 | 3 | 4
  /** 측이동 구속 (가새골조 = 无侧移) */
  braced: { X: boolean; Y: boolean }
  /** 순단면적비 */
  netAreaRatio: number
}

export interface FrameSpec {
  code: 'CN'
  /** 격자선 좌표 (m), 오름차순 */
  xs: number[]; ys: number[]
  /** 1층 바닥(지점) 표고와 층고(아래부터) */
  baseZ: number; heights: number[]
  /** 층 이름 (아래부터, 길이 = heights + 1: 마지막이 지붕) */
  storyNames: string[]
  voids: PlanVoid[]
  material: 'Q235B' | 'Q355B'
  sections: Record<FrameRole, string>
  braces: BraceBay[]
  loads: FrameLoads
  wind: CnWindSpec
  seismic: CnSeismicSpec
  design: CnDesignSpec
}

export interface FrameNode { id: number; x: number; y: number; z: number; /** 층 레벨 index (0 = 지점) */ level: number }

export interface FrameElement {
  id: number; role: FrameRole; n1: number; n2: number; section: string
  /** 층 index (1 = 1F: 레벨 0~1 사이) */
  story: number
  /** 보·가새: 골조 방향과 골조선 좌표 */
  axis?: Axis; line?: number
  /** 설계 부재(분할 전 보 전체) 번호 — 같은 값의 요소는 한 부재 */
  member: number
  /** 외곽 보 여부 (선하중 대상) */
  edge?: boolean
}

export interface FrameModel {
  nodes: FrameNode[]
  elements: FrameElement[]
  /** 지점 절점 */
  supports: number[]
  /** 레벨별 표고 (index 0 = baseZ) */
  levels: number[]
  /** 레벨별 바닥 영역 (평면 직사각형 목록 — FBLA 꼭짓점 절점) */
  floorRegions: { level: number; nodes: number[] }[]
  /** 레벨별 평면 면적 (m²) */
  floorArea: number
  /** 외곽선 길이 (m) */
  perimeter: number
}
