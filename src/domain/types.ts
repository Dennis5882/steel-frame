import type { CodeId } from '../codes'
import type { CpiKR, ExposureKR, ImportanceKR, SiteKR } from '../codes/krLateral'
import type { ScopeFeatures } from './scope'
import type { AdditionModel, AdditionUsage, FactoryAdditions } from './additionTypes'

/* 공장형 단경간 포털 프레임 입력 스펙. 단위: m, kN */
export type FrameType = 'gable' | 'mono' | 'multi'
export const FRAME_TYPES: FrameType[] = ['gable', 'mono', 'multi']

export interface FactorySpec {
  /** 설계기준 (UI 언어와 독립) */
  code: CodeId
  /** 프레임 스팬 (m) */
  span: number
  /** 길이 방향 베이 수 */
  bays: number
  /** 베이 간격 (m) — bayList 가 있으면 그중 최댓값(퍼린·거트 경간 등 설계값, 보수적) */
  baySpacing: number
  /** 베이별 간격 (m, y=0 박공부터). 기본 모델링·자유골조 공통. 있으면 bays = 길이, baySpacing = 최댓값 (normalizeBays) */
  bayList?: number[]
  /** 횡단면 형식 — 없으면 'gable'(단경간 박공). 'mono' = 단경간 편경사: x = 0 이 낮은 처마, x = 스팬이 높은 처마.
      'multi' = 다경간 박공: 경간마다 마루, 내부 기둥 = 흔들림 기둥(상·하단 핀), 골 높이 = 처마 */
  frame?: FrameType
  /** 다경간 경간별 폭 (m, x = 0 부터). frame 'multi' 에서만 — span = 합계 (normalizeSpans) */
  spanList?: number[]
  /** 처마 높이 (m) — 편경사는 낮은 쪽 처마 (높은 쪽 = 처마 + 스팬 × 경사) */
  eaveHeight: number
  /** 지붕 경사 (rise/run, 예 0.1 = 1:10) */
  roofSlope: number
  /** 기둥 베이스 접합 */
  baseFixity: 'pinned' | 'fixed'
  /** 퍼린 간격 (경사 방향, m) */
  purlinSpacing: number
  /** 거트 간격 (높이 방향, m) */
  girtSpacing: number
  /** 박공벽 풍주(gable post) 목표 간격 (m) — 실제 위치는 지붕보 절점에 맞춤 */
  postSpacing: number
  /** 퍼린·거트 새그로드(횡지지) 수 / 베이 — 설계 비지지길이 Lb = 베이 간격 / (n+1) */
  sagRods: number
  /** Physical restraint details: assumed keeps a visible review condition;
   * none removes the length reduction; confirmed records project verification. */
  restraints?: { flyBraces?: 'assumed' | 'confirmed' | 'none'; sagRods?: 'assumed' | 'confirmed' | 'none'; braceCrossing?: 'assumed' | 'confirmed' | 'none' }
  /** 지진 입력 — county·town·soil 로 표2-1/2-4 조회해 SDS·SD1·SMS·SM1 을 채움(직접 수정 가능). I: 용도계수, Rx/Ry: 구조계 R (표1-3).
      county '臺北盆地' = 微分區 (地盤 放大 없음, Ra·V* 대북분지 식) */
  seismic: { county: string; town: string; soil: 1 | 2 | 3; SDS: number; SD1: number; SMS: number; SM1: number; I: number; Rx: number; Ry: number }
  /** 풍 입력 — V10: 기본설계풍속(m/s), I: 풍 용도계수, exposure: 지표조도 A/B/C, enclosure: 封閉/部分封閉 */
  wind: { V10: number; I: number; exposure: 'A' | 'B' | 'C'; enclosure: 'enclosed' | 'partial' }
  /** 지붕 마감 고정하중 — 경사면 면적 기준 (kN/m²) */
  roofDead: number
  /** 벽 마감 고정하중 (kN/m²) */
  wallDead: number
  /** 기초 콘크리트 fc' (MPa) — 주각 지압 */
  fc: number
  /** 앵커볼트 인장강도 Fu (MPa) */
  anchorFu: number
  sections: { column: string; rafter: string; purlin: string; girt: string; strut: string; post: string; brace: string }
  material: string
  /** 적용범위 질문 답 (크레인·메자닌·다경간·큰 개구부) — domain/scope.ts */
  features?: ScopeFeatures
  additions?: FactoryAdditions
  /** China: secondary members may use a different certified steel grade. */
  secondaryMaterial?: string
  /** GB inputs, used only when code === CN. Pressures kN/m², periods s. */
  china?: { w0: number; terrain: 'A' | 'B' | 'C' | 'D'; /** 미사용 — GB 51022 4.2.1 β(1.1·1.5)로 대체 (이전 저장값 호환) */ betaZ?: number; topography: number; alphaMax: number; Tg: number; Tx: number; Ty: number; damping: number; snow: number; snowMu: number; gamma0: number; concreteBearing: number; anchorFt: number }
  /** KDS 입력 (code === KR 에서만). 풍 KDS 41 12 00 5장: V0 기본풍속(m/s, 그림 5.5-1), 지표면조도 A~D, K_zt 지형계수, K_D 풍향계수, cpi 표 5.7-4 밀폐 분류,
      roofZeta 지붕 1차 감쇠비(5.6.4). 적설 4장: Sg 기본지상설하중(kN/m², 그림 4.2-1), Ce 노출계수, Ct 온도계수.
      지진 KDS 41 17 00: zone 지진구역 I/II, S 유효지반가속도(= Z × 2.0), site 지반종류 S1~S5. importance = KDS 41 10 05 중요도(특·1·2·3) — I_W·I_s·내진등급 */
  korea?: { V0: number; exposure: ExposureKR; Kzt: number; KD: number; cpi: CpiKR; roofZeta: number; Sg: number; Ce: number; Ct: number; zone: '1' | '2'; S: number; site: SiteKR; importance: ImportanceKR
    /** 지진력저항시스템 (KDS 41 17 00 표 6.2-1) — 없으면 '일반규정만'(R 3). X 보통모멘트골조, Y 보통중심가새골조 → KDS 14 31 60 상세 */
    systemX?: 'general' | 'OMF'; systemY?: 'general' | 'OCBF'
    /** 행정구역 (KDS 17 10 00 표 4.2-1) — 'manual' 이면 구역을 직접 고름 */
    region?: string }
}

/** 베이별 간격 (m) — 등간격이면 baySpacing × bays */
export function baySpans(spec: Pick<FactorySpec, 'bays' | 'baySpacing' | 'bayList'>): number[] {
  return spec.bayList?.length ? spec.bayList : Array.from({ length: spec.bays }, () => spec.baySpacing)
}

/** 다경간 경간 폭 목록 — 'multi' 가 아니면 [span] */
export function frameSpans(spec: Pick<FactorySpec, 'frame' | 'span' | 'spanList'>): number[] {
  return spec.frame === 'multi' && spec.spanList?.length ? spec.spanList : [spec.span]
}
/** 다경간: span = 경간 합계 (전체 폭). 그 밖 형식은 spanList 제거 */
export function normalizeSpans(spec: FactorySpec): FactorySpec {
  if (spec.frame !== 'multi') return spec.spanList ? { ...spec, spanList: undefined } : spec
  const list = spec.spanList?.filter((v) => Number.isFinite(v) && v > 0)
  return list?.length ? { ...spec, spanList: list, span: list.reduce((a, b) => a + b, 0) } : spec
}

/** bayList → bays·baySpacing 동기화. 모든 균등 간격이면 bayList 제거 */
export function normalizeBays(spec: FactorySpec): FactorySpec {
  const list = spec.bayList?.filter((v) => Number.isFinite(v) && v > 0)
  if (!list?.length) { const { bayList: _, ...rest } = spec; return rest }
  if (list.every((v) => v === list[0])) { const { bayList: _, ...rest } = spec; return { ...rest, bays: list.length, baySpacing: list[0] } }
  return { ...spec, bayList: list, bays: list.length, baySpacing: Math.max(...list) }
}

/** 길이 표기 — '6 × 6 = 36 m' / '6 + 7.5 + 6 = 19.5 m' */
export function lengthText(spec: FactorySpec): string {
  const s = baySpans(spec), L = s.reduce((a, b) => a + b, 0)
  const r = (v: number) => +v.toFixed(2)
  return spec.bayList?.length ? `${s.map(r).join(' + ')} = ${r(L)} m` : `${spec.bays} × ${r(spec.baySpacing)} = ${r(L)} m`
}

export interface Node { id: number; x: number; y: number; z: number }
/** post = 박공벽 풍주, brace = X-가새(TRUSS) */
export type ElementRole = 'column' | 'rafter' | 'purlin' | 'girt' | 'strut' | 'post' | 'brace'
export const ROLES: ElementRole[] = ['column', 'rafter', 'purlin', 'girt', 'strut', 'post', 'brace']
/** wall: 벽 부재가 붙은 면 — 'x0'·'xL' = 측벽(x=0, x=스팬), 'y0'·'yL' = 박공벽(y=0, y=길이), 'roof' = 지붕 가새 */
export type Face = 'x0' | 'xL' | 'y0' | 'yL' | 'roof'
export interface Element { id: number; n1: number; n2: number; role: ElementRole; section: string; face?: Face; /** 흔들림 기둥(다경간 내부): 상단 핀·기초 핀, 면내 K = 1 */ lean?: true
  designLength?: number; physicalKey?: string; addition?: AdditionUsage; sourceId?: string
  /** Virtual wall load collector: never sent to Gen or counted as structural steel. */
  loadOnly?: true
}

/** 전역: X = 스팬 방향, Y = 길이 방향, Z = 높이 */
export interface FactoryModel { nodes: Node[]; elements: Element[]; additions?: AdditionModel }

export const DEFAULT_SPEC: FactorySpec = {
  code: 'TW',
  span: 24, bays: 6, baySpacing: 6, eaveHeight: 8, roofSlope: 0.1,
  baseFixity: 'fixed', purlinSpacing: 1.5, girtSpacing: 1.5, postSpacing: 6, sagRods: 2,
  /* 샘플 공지: 基隆市 中正區·第一類地盤 (표2-1: 0.60 / 0.35 / 0.80 / 0.50, Fa = Fv = 1). Rx 3.2 = 部分韌性抗彎矩構架(鋼, h ≤ 12m, 표1-3), Ry 2.0 = 同心斜撐(h ≤ 12m).
     V10 42.5 = 臺北市 (風力規範 2.4), 지표조도 B 가정 */
  seismic: { county: '基隆市', town: '中正區', soil: 1, SDS: 0.6, SD1: 0.35, SMS: 0.8, SM1: 0.5, I: 1.0, Rx: 3.2, Ry: 2.0 },
  wind: { V10: 42.5, I: 1.0, exposure: 'B', enclosure: 'enclosed' },
  /* ⚠ 마감 하중은 가정값(금속 지붕 패널+단열 / 벽 패널) — 사용자 입력으로 대체 */
  roofDead: 0.15,
  wallDead: 0.1,
  /* ⚠ 가정: fc' 280 kgf/cm² ≈ 27.5 MPa, 앵커 Fu 400 MPa (ASTM F1554 Gr.36 상당) */
  fc: 27.5,
  anchorFu: 400,
  /* Gen NX CNS2020.sdb 단면명 (RH = 압연 H, CC = 립 C형강 '치수/두께').
     샘플 단면은 라이브 설계 검토로 조정(2026-10-15): 핀 주각 RH500/RH450 은 풍 변위각 0.0109(> 0.005)·지붕보 처짐 L/235 로 NG.
     스트럿은 KL/r ≤ 200 (ry ≥ 30mm) 위해 RH150x150.
     2026-10-15 국부 풍압(3장)·횡풍향/비틀림(2.10~2.12) 추가 후 라이브: 거트 CC150x65 1.23(모서리 부압)·풍주 RH250 1.17 NG → 거트 CC200x75x20/3.2, 풍주 RH298x149. */
  sections: { column: 'RH 600x200x11x17', rafter: 'RH 600x200x11x17', purlin: 'CC 200x75x20/4.0', girt: 'CC 200x75x20/3.2', strut: 'RH 150x150x7x10',
    post: 'RH 298x149x5.5x8', brace: 'P 139.8x4.5' },
  material: 'SN400B',
}

export const CN_DEFAULT_SPEC: FactorySpec = {
  ...DEFAULT_SPEC, code: 'CN', material: 'Q235B', secondaryMaterial: 'Q235B',
  // Gen NX live sizing: CC candidates failed local wind/LTB; use rolled H.
  sections: { column: 'HM 390x300x10/16', rafter: 'HM 390x300x10/16', purlin: 'HN 198x99x4.5/7', girt: 'HN 150x75x5/7', strut: 'HW 175x175x7.5/11', post: 'HN 248x124x5/8', brace: 'P 219x6' },
  china: { w0: 0.45, terrain: 'B', topography: 1, alphaMax: 0.08, Tg: 0.35, Tx: 0.5, Ty: 0.3, damping: 0.05, snow: 0.3, snowMu: 1, gamma0: 1, concreteBearing: 14.3, anchorFt: 140 },
}

/* 한국 샘플: 서울(지진구역 I, S = 0.11 × 2.0), 지반 S4(4.1.1 ③ 자료 부족 시), V0 28 m/s·Sg 0.5 kN/m² 는 지도 판독 예시값 — 프로젝트 지역으로 바꿀 것.
   단면 = KS21.sdb. 퍼린·거트는 용접 경량 H(LH) — KS21 에 립 C형강이 없음 (냉간성형은 2단계) */
export const KR_DEFAULT_SPEC: FactorySpec = {
  /* 퍼린·거트 = KS21 립 C형강 + SSC275 (KDS 41 30 30, 2026-10-16) */
  ...DEFAULT_SPEC, code: 'KR', material: 'SS275', secondaryMaterial: 'SSC275',
  sections: { column: 'H 600x200x11/17', rafter: 'H 600x200x11/17', purlin: 'LC-200x75x20x3.2', girt: 'LC-150x75x20x3.2', strut: 'H 150x150x7/10',
    post: 'H 300x150x6.5/9', brace: 'P 139.8x4.5' },
  korea: { V0: 28, exposure: 'C', Kzt: 1, KD: 1, cpi: 'wallsLeaky', roofZeta: 0.02, Sg: 0.5, Ce: 1.0, Ct: 1.0, zone: '1', S: 0.22, site: 'S4', importance: '2' },
}

export function defaultSpecFor(code: CodeId): FactorySpec {
  return structuredClone(code === 'CN' ? CN_DEFAULT_SPEC : code === 'KR' ? KR_DEFAULT_SPEC : DEFAULT_SPEC)
}
