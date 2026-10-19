/** Project quantities use kN, m and kN/m². No rated crane capacity is converted to wheel loads. */
export interface EquipmentLoad {
  id: string; name: string; x: number; y: number; weight: number; seismicFraction: number
  source: string; confirmed: boolean
}
export interface CraneOptions {
  id: string; elevation: number; eccentricity: number; wheelSpacing: number
  maxWheel: number; minWheel: number; impactFactor: number; lateral: number; braking: number
  seismicWeight: number; source: string; confirmed: boolean
  /** Crane maker. Blank/omitted = not decided yet: loads are assumptions (scope warning, expert review). */
  manufacturer?: string
  driftLimitMm: number
  /** Optional operating bays, zero-based and inclusive. Omitted = entire building. */
  travel?: {firstBay:number;lastBay:number}
  runway?: { section: string; deflectionDivisor: number; source: string; confirmed: boolean }
}
/** Full-bay, closed side-wall door. Pressure remains on the closed door envelope. */
export interface WallOpeningOptions {
  id: string; face: 'x0' | 'xL'; bay: number; height: number; headerSection: string
  source: string; confirmed: boolean
}
export interface PlatformOptions {
  id: string; kind: 'mezzanine' | 'equipment'; elevation: number
  x0: number; x1: number; firstBay: number; lastBay: number; beamSpacing: number
  beamSection: string; columnSection: string; dead: number; live: number; liveMassFraction: number
  source: string; confirmed: boolean
  deflectionDivisor: number
}
export interface AdditionFactors {
  dead: number; live: number; accompanyingLive: number; crane: number
  source: string; confirmed: boolean
}
export interface FactoryAdditions {
  equipment: EquipmentLoad[]; crane?: CraneOptions; platform?: PlatformOptions
  wallOpening?: WallOpeningOptions
  roofOpening?: RoofOpeningOptions; floorOpening?: FloorOpeningOptions; link?: LinkOptions
  factors: AdditionFactors
}
export interface RoofOpeningOptions {
  id:string; bay:number; x0:number; x1:number; section:string; deflectionDivisor:number; source:string; confirmed:boolean
}
export interface FloorOpeningOptions { id:string; bay:number; x0:number; x1:number; source:string; confirmed:boolean }
export interface LinkReaction { name:string; fx:number; fy:number; fz:number; mx:number; my:number; mz:number }
export interface LinkOptions {
  id:string; mode:'sliding'|'separate'|'integral'; face:'x0'|'xL'; frame:number; elevation:number
  aMovementMm:number; bMovementMm:number; thermalMovementMm:number; toleranceMm:number
  availableGapMm:number; seatLengthMm:number; minBearingMm:number; loadFactor:number
  cases:LinkReaction[]; source:string; confirmed:boolean
}
export type AdditionUsage = 'platform-beam' | 'platform-column' | 'runway-beam' | 'opening-header' | 'roof-trimmer' | 'floor-trimmer'
export const additionLabelKey = (usage: AdditionUsage) => ({'platform-beam':'add_platformBeam','platform-column':'add_platformColumn','runway-beam':'add_runway','opening-header':'add_header','roof-trimmer':'p6_roofBeam','floor-trimmer':'p6_floorBeam'} as const)[usage]
export interface PhysicalMember {
  key: string; elementIds: number[]; length: number; source: 'factory' | string
}
export interface AdditionNodalLoad {
  node: number; case: string; source: string
  fx: number; fy: number; fz: number; mx: number; my: number; mz: number
}
export interface AdditionBeamLoad { element: number; case: string; source: string; q: number }
export interface AdditionModel {
  members: PhysicalMember[]
  nodal: AdditionNodalLoad[]; beam: AdditionBeamLoad[]
  /** Seismic weight (kN), not a mass in tonnes. Structural self-weight is recorded once. */
  seismicWeights: { node: number; weight: number; source: string }[]
  fixedBases: number[]
  craneCases: { name: string; position: number; maxRail: 'left' | 'right'; lateralSign: number; brakingSign: number }[]
  sources: { id: string; kind: 'equipment' | 'crane' | 'platform' | 'opening' | 'roof' | 'link'; dead: number; live: number; seismic: number }[]
  /** Removed horizontal wall members retained only to compile closed-door envelope loads. */
  removedGirts?: import('./types').Element[]
  roofCollectors?: {original:import('./types').Element; keys:string[]; shares:number[]}[]
  voids?: {id:string; kind:'roof'|'floor'; x0:number; x1:number; y0:number; y1:number; z0:number; z1:number; area:number}[]
  linkCases?: {name:string; label:string}[]
}
