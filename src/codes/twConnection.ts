/* 대만 LRFD 10장 접합 강도 (순수 함수) — 원문 KB: steel-design-technical-code/LRFD-10-接合設計.md
   - 표10.3-2 F10T: φ = 0.75, 인장 Fnt = 7.50 tf/cm², 전단(나사부 전단면 포함) Fnv = 4.00 tf/cm²
   - 표10.3-3 F10T 조합(나사부 전단면 포함): Ft = 9.8 − 2.5·fv ≤ 7.5 tf/cm²
   - 표10.3-2 나사봉(앵커): 인장 0.75Fu, 전단 0.40Fu (나사부 전단면 포함), 조합은 해설 그림 C10.3-4 의 타원식
   - 10.9 콘크리트 지압 φc = 0.6, Pp = 0.85fc'·A1·√(A2/A1), √(A2/A1) ≤ 2
   - 표10.2-5 필릿용접: φ = 0.75, 0.6·F_EXX (유효 목두께 0.707w)
   본문에 식이 없는 판 두께는 AISC Design Guide 식을 쓴다(호출부가 출처 표기):
   - 베이스플레이트 DG1 (2nd ed.) 3.3/3.4: 지압측 t ≥ 1.5m√(fp/Fy), 인장측 t ≥ 2.11√(T·x/(B·Fy))
   - 단부판 DG4 4E 항복선: t ≥ √(1.11·Mu / (φb·Fy·Y)) */

const KN_TF = 1 / 9.80665
export const MPA_TFCM2 = 1 / 98.0665 // MPa → tf/cm² (정확값 — 반올림 0.0101972 는 +4e-6 오차)

export const F10T = { phi: 0.75, Fnt: 7.5, Fnv: 4.0 } // tf/cm²
/** 볼트 공칭 단면적 cm² */
export const boltArea = (dMm: number) => (Math.PI * (dMm / 10) ** 2) / 4

/** F10T 1개 설계강도 (kN) — 인장(전단 fv 동시작용 시 표10.3-3)·전단 */
export function f10t(dMm: number, vPerBolt_kN = 0) {
  const Ab = boltArea(dMm)
  const fv = (vPerBolt_kN * KN_TF) / Ab
  const Ft = Math.min(F10T.Fnt, 9.8 - 2.5 * fv)
  return { phiRt: (F10T.phi * Ft * Ab) / KN_TF, phiRv: (F10T.phi * F10T.Fnv * Ab) / KN_TF }
}

/** 앵커(나사봉) 1개 설계강도 (kN) — FuMPa = 봉재 인장강도 */
export function anchorRod(dMm: number, FuMPa: number) {
  const Ab = boltArea(dMm), Fu = FuMPa * MPA_TFCM2
  return { phiRt: (0.75 * 0.75 * Fu * Ab) / KN_TF, phiRv: (0.75 * 0.4 * Fu * Ab) / KN_TF }
}

/** 인장·전단 동시 — 타원 상관 (해설 C10.3-4): (Tu/φRt)² + (Vu/φRv)² ≤ 1 → 비율 √(…) */
export const ellipse = (t: number, phiRt: number, v: number, phiRv: number) => Math.sqrt((t / phiRt) ** 2 + (v / phiRv) ** 2)

/** 10.9 콘크리트 지압 설계응력 φc·0.85fc'√(A2/A1) (MPa) */
export const concreteBearing = (fcMPa: number, A1: number, A2: number) => 0.6 * 0.85 * fcMPa * Math.min(2, Math.sqrt(A2 / A1))

/** 표10.2-5 필릿용접 단위길이 설계강도 (kN/mm) — w = 다리 길이 mm, FEXX MPa */
export const filletPerMm = (wMm: number, FEXXMPa: number) => (0.75 * 0.6 * FEXXMPa * 0.707 * wMm) / 1000

/** 판 두께 표준 (mm) */
export const PLATES = [12, 16, 19, 22, 25, 28, 32, 36, 40, 45, 50, 55, 60]
export const pickPlate = (tReq: number) => PLATES.find((t) => t >= tReq) ?? Math.ceil(tReq)
