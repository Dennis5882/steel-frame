/* 한국 KDS 14 31 25 (2024) 접합 강도 (순수 함수, N·mm·MPa → kN 반환은 함수별 표기).
   - 4.1.3 고장력볼트 표 4.1-9: F10T Fnt 750, Fnv 400 (나사부 전단면 포함), φ 0.75, Rn = Fn·Ab (4.1-6, Ab = 공칭 축부 단면적)
     인장+전단 지압접합 (4.1-8): F'nt = 1.3Fnt − Fnt/(φFnv)·fv ≤ Fnt, 한쪽 응력이 설계응력의 20% 이하면 무시 (4.1.3.4(3))
     설계볼트장력 표 4.1-10 T0, 마찰접합 (4.1-12) φRn = φ·μ·hf·T0·Ns (표준공 φ 1.0, μ 0.5 무도장 블라스트, hf 1.0), 인장 동시 ks = 1 − Tu/(T0·Nb) (4.1-13)
     구멍 표 4.1-1: d + 2 (≤ M22), d + 3 (≥ M24)
   - 4.1.3.5 지압: φ 0.75, 1.2·Lc·t·Fu ≤ 2.4·d·t·Fu (4.1-9, 사용하중 변형 고려)
   - 4.1.4.1 접합요소 인장: 항복 φ 0.90 Fy·Ag, 파단 φ 0.75 Fu·Ae (Ae = An ≤ 0.85Ag)
   - 4.1.2 필릿용접 (건축, 표 4.1-8): φ 0.75, Fnw = 0.6·FEXX, 목두께 0.7s, 유효길이 = 전체 − 2s (4.1.2.2.1(2) — AISC 와 다름)
     용접봉 KDS 14 31 05 표 3.1-6: 400 MPa 급 강재 420, 490 MPa 급 490
   - 4.1.8 콘크리트 지압: φc 0.65, Pp = 0.85fck·A1·√(A2/A1) ≤ 1.7fck·A1 (4.1-26)
   - 4.1.9 앵커볼트 강재: 4.1.3.3 과 같이 Fnt = 0.75Fu, Fnv = 0.4Fu (표 4.1-9 의 4.6 = 300/160), 인장+전단 4.1-8. 콘크리트 정착(KDS 14 20 54)은 별도
   - 4.1.10 집중하중: 플랜지 국부휨 φ 0.90·6.25tf²Fyf (부재 끝 10tf 안 50%), 웨브 국부항복 φ 1.0 (5k+N 또는 끝 d 안 2.5k+N)·Fyw·tw,
     패널존 φ 0.90·0.6Fy·dc·tw (Pr ≤ 0.4Pc, 4.1-36) / ×(1.4 − Pr/Pc) (4.1-37), 스티프너 bs + tw/2 ≥ b/3, ts ≥ tf/2·b/15 (4.1.10.7(4))
   본문에 식이 없는 판 두께(단부판 항복선·지레작용, 베이스플레이트 휨)는 4.1.1.1(5) '표준접합상세지침'이 KB 에 없어 AISC Design Guide 를 쓴다 (호출부가 출처 표기). */

export const BOLT_KR = { Fnt: 750, Fnv: 400, phi: 0.75 } // F10T, MPa
/** 표 4.1-10 F10T 설계볼트장력 T0 (kN) */
export const T0_KR: Record<number, number> = { 16: 106, 20: 165, 22: 200, 24: 237, 27: 301, 30: 371 }
/** 공칭 축부 단면적 (mm²) */
export const areaKR = (d: number) => (Math.PI * d * d) / 4
/** 표 4.1-1 표준구멍 지름 (mm) */
export const holeKR = (d: number) => d + (d <= 22 ? 2 : 3)

/** 인장+전단 지압접합 (4.1-8) — 볼트·앵커 1개 φRn (kN). Fnt·Fnv MPa, vPer = 볼트 1개 소요 전단 (kN) */
function bearingType(d: number, Fnt: number, Fnv: number, vPer: number) {
  const Ab = areaKR(d), phi = 0.75
  const fv = (vPer * 1e3) / Ab
  const Fnt2 = fv <= 0.2 * phi * Fnv ? Fnt : Math.min(Fnt, 1.3 * Fnt - (Fnt / (phi * Fnv)) * fv)
  return { phiRt: (phi * Math.max(0, Fnt2) * Ab) / 1e3, phiRt0: (phi * Fnt * Ab) / 1e3, phiRv: (phi * Fnv * Ab) / 1e3 }
}
/** F10T 1개 (kN) — 인장(전단 동시 4.1-8)·전단(나사부 포함) */
export const boltKR = (d: number, vPer = 0) => bearingType(d, BOLT_KR.Fnt, BOLT_KR.Fnv, vPer)
/** F10T 마찰접합 1개·1면 (kN) — φ 1.0, μ 0.5, hf 1.0, 인장 동시 ks (4.1-12·13) */
export function slipKR(d: number, tPer = 0, Ns = 1, mu = 0.5) {
  const T0 = T0_KR[d]
  if (!T0) throw new Error(`KDS 14 31 25 table 4.1-10: no T0 for M${d}`)
  return 1.0 * mu * 1.0 * T0 * Ns * Math.max(0, 1 - tPer / T0)
}
/** 앵커볼트 강재 1개 (kN) — Fu MPa (4.6 = 400 → Fnt 300·Fnv 160) */
export const anchorKR = (d: number, Fu: number, vPer = 0) => bearingType(d, 0.75 * Fu, 0.4 * Fu, vPer)

/** 지압 1개 (kN) — Lc 순연단/순간격, t 판 두께, Fu 판 (4.1-9) */
export const bearingKR = (Lc: number, d: number, t: number, Fu: number) => (0.75 * Math.min(1.2 * Lc * t * Fu, 2.4 * d * t * Fu)) / 1e3

/** 콘크리트 지압 설계응력 (MPa) — φc·0.85fck·√(A2/A1) ≤ φc·1.7fck (4.1-26) */
export const concreteBearingKR = (fck: number, A1: number, A2: number) => 0.65 * 0.85 * fck * Math.min(2, Math.sqrt(A2 / A1))

/** 용접봉 FEXX (MPa) — 강재 인장강도 등급 (KDS 14 31 05 표 3.1-6) */
export const fexxKR = (Fu: number) => (Fu >= 490 ? 490 : 420)
/** 필릿용접 설계강도 (kN) — s 다리 길이, L 전체 길이(한 줄), 유효길이 L − 2s */
export const filletKR = (s: number, L: number, FEXX: number) => (0.75 * 0.6 * FEXX * 0.7 * s * Math.max(0, L - 2 * s)) / 1e3
/** 표 4.1-6(a) 최소 필릿 (얇은 쪽 t) */
export const minFilletKR = (t: number) => (t < 6 ? 3 : t < 13 ? 5 : t < 20 ? 6 : 8)

/** 플랜지 국부휨 φRn (kN) — 부재 끝 10tf 안이면 50% (4.1.10.1(3)) */
export const flangeBendKR = (tf: number, Fy: number, nearEnd: boolean) => (0.9 * 6.25 * tf * tf * Fy * (nearEnd ? 0.5 : 1)) / 1e3
/** 웨브 국부항복 φRn (kN) — k 플랜지 외면~필렛 끝, N 지압길이, 끝에서 d 안이면 2.5k (4.1-28·29) */
export const webYieldKR = (k: number, N: number, tw: number, Fy: number, nearEnd: boolean) => (1.0 * ((nearEnd ? 2.5 : 5) * k + N) * Fy * tw) / 1e3
/** 패널존 φRn (kN) — 골조 안정해석에 패널존 변형 미고려 (4.1-36·37). Pr·Pc kN */
export const panelKR = (Fy: number, dc: number, tw: number, Pr: number, Pc: number) =>
  (0.9 * 0.6 * Fy * dc * tw * (Pr <= 0.4 * Pc ? 1 : 1.4 - Pr / Pc)) / 1e3

/** 판 두께 표준 (mm) */
export const PLATES_KR = [9, 12, 16, 19, 22, 25, 28, 32, 36, 40, 45, 50, 55, 60]
export const pickPlateKR = (tReq: number) => PLATES_KR.find((t) => t >= tReq) ?? Math.ceil(tReq)
