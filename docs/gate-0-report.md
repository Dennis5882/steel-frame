# 단계 0 게이트 확인 보고 (2026-10-19)

기획서 [steel-app-plan.md](steel-app-plan.md) 2.2절 항목을 Gen NX 2026(로컬, kN·m)에서 라이브로 확인했다.
시험 모델은 예제 형상이다: 24×16 m, 4층(4.5 + 3.3×3), 기둥 HW250×250×9/14, 보 HW200×200×8/12, 가새 HW150×150×7/10(TRUSS, 외곽 가운데 두 베이 X형).
- 절점 125, 요소 324(기둥 100, 보 160, 가새 64)
- 스크립트: [scripts/gate/](../scripts/gate/) (`live-gate.ts`가 본 시험이고 2~6은 후속 원인 분리)
- 증거: `output/gate/evidence-*.json`(로컬)
- 시험 모델: `C:/temp/sf_gate_20261019_193720_final.mgbx`(Gen에 열어 둠)

## 요약

| # | 항목 | 결과 | 앱 방침 |
| --- | --- | --- | --- |
| 1 | 재료 Q355 (`GB50017-17(S)`) | ❌ 규격 이름은 DLL에 있으나 PUT은 DB 재료 전부 `Unknown Error`(Q235·Q345 포함, CODE 후보 11종) | **사용자 정의 STEEL**(P_TYPE 2, E = 2.06e8 kN/m², ν 0.3, γ 78.5)로 입력. 강도는 앱(cnSteel)이 가짐. `BC1:12-GB(S)`·`JTG D64-2015(S)`는 Q355를 받지만 기준이 달라 미사용 |
| 2 | 층 데이터 `db/STOR` + `ope/STOR` | ✅ 15필드 수용, 층 다이어프램, 우발편심 자동 산정 | story 앱 방식 그대로 |
| 3 | 바닥하중 `FBLD`+`FBLA` (강재 보, 양방향) | ✅ **LL 반력 합 2496.0 kN = 계산 2496 kN(오차 0%)** | Gen 바닥하중 분배 사용 |
| 4 | 질량 `STYP`(자중→질량) + `LTOM`(DL 1.0 + LL 0.5) | ✅ 층 질량 997.3 t, 층중량 9780 kN(DL+0.5LL 반력 9837 kN, 1층 기둥 하반부 차이 0.6%) | |
| 5 | 고유치 Lanczos 12, 스펙트럼 `SPFC` CH2010(네이티브), `SPLC` RX 0°·RY 90° CQC + 우발편심 | ✅ 해석 9 s. 1층 RS 전단 RX 706.7 kN·RY 614.4 kN | story CN 페이로드 재사용 |
| 5′ | 주기 표 `EIGENVALUEMODE` | ❌ **이 빌드에서 항상 `Unknown Error`**. 기둥 1개 최소 모델에서도 실패하므로 빌드 문제로 판단(story에서는 10-12까지 정상). `PARTICIPATIONVECTORMODE`(모드형상)는 정상 | MIDAS에 보고. 그동안 주기·유효질량은 모드형상과 질량으로 앱에서 산정하거나 표시 보류 |
| 6 | 층 결과 표 (RS 케이스) | ✅ `STORY_DRIFT_X/Y`, `STORY_DISPLACEMENT_X`, `TORSIONAL_IRREGULARITY_X`, `STIFFNESS_IRREGULARITY_X`, `STORY_SHEAR_FORCE_COEFFICIENT`, `OVERTURNING_MOMENT`, `STORY_MASS`, `STORYWEIGHT`, `STORY_SHEAR_FORCE_RATIO`, `ope/STORYPROP` | 주의점은 아래 참고 |
| 6′ | 층 수평내력 급변, 안정계수(P-Δ) 표 | ❌ 후보 이름 전부 `error creating utbl` | **앱에서 계산** (층 전단·변위·층중량 표에서) |
| 7 | 조합 `LCOM-GEN` (ST + RS 혼합) | ✅ `E1 1.3GE+1.4RX(CB)` 부재력 회수 | 앱에서 조합 생성(공장 앱 방식). `ope/LCOM-STEEL` 자동 생성은 `Unknown Error` |
| 8 | GB50017-17 강재 설계 API | ⚠ `db/DSTL` `GB50017-17`은 수용. 하지만 `/DESIGN/STEEL/`에는 `KDS-41-30-2022`만 있음(404). `post/STEELCODECHECK`는 빈 응답과 함께 **Gen 오류 대화상자를 띄워 API 전체를 멈춤** | **앱 자체 계산만**(공장 앱 CN과 동일). STEELCODECHECK 호출 금지 |
| 9 | Gen 공유 사용 | 시험 시작 시 빈 문서 | 백업 `C:/temp/sf_backup_*.mgbx` |

## 층 표 주의점
- `STORY_DRIFT_X/Y`는 RS 케이스에서 **최상층 행이 빠진다**(4개 층 중 3행). 허용값은 0.00182(1/550, RC 기본)이다. 그래서 층간변위각은 `STORY_DISPLACEMENT_X/Y`(5행 전부)에서 앱이 계산하고, 강구조 한계 1/250(GB 50011 5.5.1)으로 판정한다.
- `STIFFNESS_IRREGULARITY`의 강성비·판정은 `STORY_STIFFNESS_METHOD`에 따라 달라진다(전단/변위: 4F −0.485 Irregular, 1/변위각: 0.625). GB 50011 3.4.3(인접층 70%·상위 3층 평균 80%)과 정의가 달라 **값(층 전단·층간변위)만 쓰고 판정은 앱**에서 한다.
- 시험 결과 층간변위각 최대 약 1/2800(RS, 0.00036)이고 1층 전단중량비 0.072(X)·0.063(Y)이다. 7도 0.10g의 최소값 0.016 이상이다(가새 골조라 강성이 큼).

## 새로 확인한 API 동작 (공장·RC 앱에도 해당)
- **`DELETE /db/<DB>` 본문에 `Assign:{n:{}}`을 넣어도 DB 전체가 지워진다**(MATL·ELEM에서 확인). 하나만 지우려면 `DELETE /db/<DB>/<id>`를 쓴다.
- `post/STEELCODECHECK`(설계 결과 없음)를 호출하면 "No Load Combination exists for Checking" 모달 창이 뜨고 이후 API가 멈춘다. 창을 닫으면 대기 중이던 요청이 이어서 진행된다.
- 재료·요소를 바꾸면 해석 결과가 무효가 된다("no analysis result"). 표를 회수하는 중간에 DB를 변경하지 않는다.
- 공개 엔드포인트 중 `/OPE/STORY`는 404이고, `/OPE/UTBLTYPES`는 빈 메시지를 돌려준다.

## 결론
예제 모델의 형상·재료(사용자 정의)·층·바닥하중·질량·RS·조합은 API로 입력·해석되고, 층 지표 표도 회수된다 → **단계 1 진행 가능**.
남은 제약은 두 가지다.
1. Gen DB 재료 `GB50017-17(S)` Q355를 쓸 수 없다. 사용자 정의 재료로 대체한다.
2. 주기 표 `EIGENVALUEMODE`가 이 빌드에서 깨져 있다. MIDAS에 보고하고, 앱 측 대체를 정한다.
