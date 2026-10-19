# 문서 안내

기준 버전: **v2.4.1** · 마지막 검토: 2026-10-19

## 먼저 읽을 문서

| 문서 | 용도 |
|---|---|
| [현재 구현 현황](current-status.md) | 구현 완료·제한적 지원·미구현 구분, 국가별 차이, 검증 근거 |
| [개선 로드맵](roadmap.md) | 앞으로 할 일의 우선순위·작업 범위·완료 기준 |
| [중국 시장·강구조 설계 개선 방향](china-market-steel-design-strategy.md) | 현지 제품 조사, 우선 고객, 내진 입력·표준 골조·크레인·산출물 개선 제안 |
| [프로젝트 README](../README.md) | 실행 방법과 제품 개요 |

현재 개발 상태는 **현황 → 로드맵 → 기술 참고** 순서로 확인한다. 아카이브의 과거 미구현 목록을 현재 작업 목록으로 사용하지 않는다.

## 기술 참고

| 문서 | 확인할 내용 |
|---|---|
| [Gen 단면 성질 기준](reference/gen-section-property-source.md) | 국가별 DB 출처, 800개 사용/8개 제외, 런타임 대조, 총단면과 유효단면 구분 |
| [모델링 업무 흐름](reference/modeling-additional-structures-ux.md) | 7단계 입력, 추가 구조 카드, 확인 해제·오류 이동, 크레인 구간 |
| [중국 기준 구현](reference/china_code_implementation.md) | CN 구현 조항·가정·제한 및 과거 검증 |
| [한국 기준 구현](reference/korea_code_implementation.md) | KR 구현 조항·Gen 대조·냉간·접합 제한 |
| [대만 냉간성형 원문 검토](reference/taiwan_cold_formed_review.md) | 반영 조항·원문 불명확점·남은 냉간 상세 |
| [추가 구조 1~4단계](reference/factory-additions-phases-1-4.md) | 설비·크레인 골조 영향·플랫폼, 실물 부재·하중 출처·지진중량 |
| [추가 구조 5단계](reference/factory-additions-phase-5.md) | 주행보 단순보·정적 차륜·닫힌 측벽 문 |
| [추가 구조 6단계](reference/factory-additions-phase-6.md) | 닫힌 지붕 보강·바닥 개구부·건물 연결부 인터페이스 |
| [NG 단면 보완](reference/ng-section-remediation.md) | 원인 진단·후보 선택·Gen 재해석·전후 비교 |
| [크레인 운행 구간](reference/crane-travel-range.md) | 전체/일부 구간, 결과 분할 회수 |
| [사용자 제공 구조 확장 원안](reference/gen_nx_factory_structural_modifier_architecture.md) | Structural Modifier 설계 원안. 원문 내용은 변경하지 않았으며 현 구현 상태표는 아님 |

기술 참고 문서에도 과거 시험 수치가 있다. 최신 fixture·지원 상태와 다른 부분은 현황 문서 및 실제 코드가 우선한다.

## 완료·대체된 기록

[2026-10-19 아카이브 색인](archive/2026-10-19/README.md)에 6개 문서를 정리했다.

- 초기 기획·UI 권고·통합 평가: 현재 흐름과 우선순위로 대체된 기록.
- 단면 카탈로그 조사·v2.3.2 라이브: 재현 근거를 보존하는 검증 기록.

아카이브 이동은 문서에 제안된 모든 확장 기능의 완료를 뜻하지 않는다. 남은 항목은 [원문 대응표](roadmap.md#기존-문서의-잔여-과제-대응표)로 추적한다. 기존 기록은 삭제하지 않았고, 이동에 따른 링크와 안내만 보정했다.

## 문서 관리 방식

1. 구현 변경 후 `current-status.md`의 상태·근거를 갱신한다.
2. 미완료 작업은 `roadmap.md`의 고정 ID로 관리한다. 완료하면 근거와 날짜를 남기고 다음 항목으로 이동한다.
3. 상세 구현 규칙은 `reference/`, 완료된 계획·시점별 검증은 날짜별 `archive/`에 둔다.
4. 새 검증 기록에는 앱 버전·코드·모델 조건·시험 종류·실패/재시도·원본 복원 여부를 함께 적는다.
5. 로컬 `output/`은 Git 제외 증거다. 문서를 옮겨도 원시 증거를 삭제하지 않는다. 배포·공유용 증거 보존 방식은 로드맵 R08에서 다룬다.
6. 문서 이동 시 README·CLAUDE·문서 간 링크를 함께 갱신한다. 문서만 바뀐 변경은 앱 버전을 올리지 않는다.
7. 버전이 올라가면 현황·로드맵 머리말의 기준 버전과 검토일을 함께 갱신한다.
