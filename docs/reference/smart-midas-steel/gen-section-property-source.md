# Gen NX 기준 단면 성질 전환

> 기술 참고 · v2.3.4 기준 문서 정리(2026-10-19). 아래 버전별 수치·시험 기록은 해당 시점의 결과입니다. 현재 지원 상태는 [현황](../current-status.md), 남은 과제는 [로드맵](../roadmap.md)을 우선 확인하세요.

2026-10-18 · v2.3.2

## 결정과 적용 범위

표준단면의 기준은 Gen NX다. 국가별 DB·단면명으로 조회한 동일한 총단면 성질을 웹 부재/접합 검토, 자중/지진중량, 처짐, 물량, 자동 최적화 및 수동 보완 후보에 사용한다. 단면 성질을 맞추는 변경이며 웹의 국가별 강도 검토식을 Gen 설계 엔진으로 바꾸는 것은 아니다.

- 기준 데이터: `src/data/gen-section-properties.json`.
- 808개 등록 단면 중 기존 미해결 이상값 8개는 제외 유지, 800개 사용 가능.
- TW CNS2020, CN GB-YB05/GB50018-02, KR KS21. DB 파일 전체 SHA-256과 추출 시점 기록.
- 국가가 다르면 이름이 같아도 다른 레코드다. 예: `P 60.5x2.3` 면적 TW 421 / KR 420.5 mm². 이름만으로 국가를 추측하지 않는다.
- 등록되지 않은 직접 입력은 치수 기반 계산으로 표시하고, Gen 등록 또는 계산 적합성을 보장하지 않는다. 등록된 제외 단면은 계산 진입 시 오류로 차단한다.

## 출처별 성질

| 앱 성질 | 기준 |
|---|---|
| A, Ix, Iy, J | API Area, Iyy, Izz, Ixx (MM) 및 SECTIONALL 독립 표현 대조 |
| Sx, Sy | API Iyy/Izz를 양측 연단 거리 중 큰 값으로 나눔 |
| Zx, Zy (H·강관) | 설치된 Gen SDB에 저장된 소성단면계수, cm³ → mm³ |
| Cw (H·립 C) | 실제 Gen 계산 API Iw; MM/CM 전환에서 길이 6제곱 배율 확인 |
| rx, ry | 동일한 Gen I/A로 산출 |
| 외주 길이 | API Peri:O; 도장 면적에 사용 |
| 판 두께·국부좌굴용 판 치수 | 기존 단면명 기반 형상 정의 유지 |

냉간성형은 **총단면** 성질을 Gen 값으로 맞춘다. 유효폭·유효단면·단면형상변형 등 국가별 웹 계산은 기존 예비검토 범위를 유지한다. 립 C의 Z 필드는 소성값이 없으므로 탄성값을 사용하며 계산서 열은 `Zx / Sx(CC)`로 구분한다. 모든 설계 성질이 Gen API에서 직접 나온다고 표시하지 않는다.

### SDB 추가 성질 추출 검증

이번 설치본은 608-byte page / 152-byte float32 record 구조다. 단면명 색인에 있는 page·item으로 접근하며 레코드 번호를 배열 순서로 추정하지 않는다. SDB index 26/27의 소성계수는 cm³이고 7자리 유효숫자로 보존한다. 주소·원 DB 해시와 함께 저장한다.

해당 매핑을 채택하기 전에 **808개 전부**의 면적·전단면적 2개·관성/비틀림 3개·연단 거리 4개를 API 값과 상대오차 2e-6 이내(float32/출력 반올림 고려)로 대조했다. 공개 API의 소성계수 직접 재조회는 없으므로, Z값의 출처는 API가 아닌 설치 SDB임을 명시한다. DB 형식·해시가 바뀌면 자동 발행하지 않는다.

`Iw` 응답의 단위 문자열은 신뢰하지 않는다. M 단위 응답은 작은 값이 0으로 반올림되므로 채택하지 않았고 MM/CM의 실제 수치 배율로 확인했다. API Iw와 SDB 저장 Iw가 다른 경우 실제 Gen API 값을 사용한다.

고정점: KR `H 600x200x11/17`

- A = 13,440 mm²; Ix = 776,000,000 mm⁴; Iy = 22,800,000 mm⁴.
- Zx = 2,980,000 mm³; Zy = 361,000 mm³.
- 실제 API Cw = 1,924,353,642,016.6328 mm⁶.
- 기존 직각 모서리 근사 면적은 13,026 mm²였다. 자중·물량·지진하중 및 강도비가 달라지는 것은 전환의 실제 영향이다.

## 실제 설치 Gen과의 불일치 차단

`sendModel`에서 DB readback 이후 `SECTIONALL`을 MM 단위로 조회해 사용한 표준단면의 A·Ix·Iy·J를 기준 스냅샷과 비교한다. 표 누락·단위 불명·ID 중복·불일치면 `S.built`를 확정하지 않으며 복원 지점을 남긴다. 수치 허용치는 응답 반올림 수준이며 기존 0.5%/10% 검토 분류를 허용오차로 쓰지 않는다.

이 검사는 주요 4개 성질의 런타임 대조다. 설치 파일의 전체 해시 또는 Z·Cw를 런타임에 모두 검증하는 것은 아니다. 전체 해시는 배포 데이터 발행 시 확인한다.

## UI·계산서

- 사용 가능한 표준단면은 이름 옆 `성질 검토` 반복 표시를 제거하고 선택 아래 `Gen NX DB 성질 적용 · DB명`을 표시한다.
- 목록 밖 값·치수 계산·냉간 예비검토는 별도 안내한다.
- 계산서는 단면별 출처, 전체 스냅샷 시각 및 DB 해시 앞자리를 기록한다.
- 기존 비교 보고서 `section-catalog-audit.json`은 당시 **근사식 대비 차이**의 역사적 증거로 보존한다. 런타임 선택 목록은 실제 Gen 성질을 적용한 단면을 `normal/gen-db`로 해석한다.

## 재현과 검증

```powershell
node --import tsx scripts/capture-gen-section-source.ts
node --import tsx scripts/publish-gen-section-source.ts output/gen-section-source-<timestamp>
node --import tsx scripts/verify-gen-section-source.ts
node --import tsx scripts/live-gen-section-baseline.ts
npm run verify
npm run build
```

캡처 스크립트는 열린 문서를 별도 백업하고 808개 조사 scratch를 열어 MM/CM API·표·JSON export를 읽은 다음 원본을 복원한다. 기준 모델 갱신 스크립트는 세 국가 모두 실제 해석·반력 검증·복원 성공 후에만 fixture를 교체한다. 키는 `.env` 또는 환경변수에서 읽고 산출물에 저장하지 않는다.

원시 증거 (Git 제외):

- `output/gen-section-source-2026-10-18T06-39-27-120Z/`: 전체 재조회·MM/CM 스케일 검증 입력·복원 12 DB 해시 일치.
- `output/gen-section-live-2026-10-18T06-45-37-229Z/`: 세 국가 기준 모델 재해석·이전/새 fixture·비교 기록.
- `output/gen-section-source-ui.png`: 모델링 화면 표시.

### 기본 모델 실제 재해석 결과

같은 기본 스펙으로 새 하중을 생성해 Gen 해석·전체 결과를 회수했다. EX/EY 반력은 새 지진력, LR 반력은 면적×활하중과 상대오차 1e-4 이내로 대조했다. 세 경우 모두 기존·새 부재/사용성 NG는 0이며 현재 구현된 접합 검토의 최대비도 1 이하다. 이는 기본 모델의 회귀 검증이며 Gen 자체 국가별 설계 결과와의 독립 비교 또는 최종 시공 승인이라는 뜻은 아니다.

| 코드 | 치수 근사 강재량(t) | Gen 면적 강재량(t) | 변화 | 이전 → 새 부재 최대비 |
|---|---:|---:|---:|---:|
| TW | 46.9597 | 47.1355 | +0.3745% | 0.912207 → 0.874606 |
| CN | 57.3382 | 58.2465 | +1.5841% | 0.868899 → 0.858340 |
| KR | 45.4611 | 46.3215 | +1.8926% | 0.849319 → 0.846102 |

기존 fixture를 정답 숫자만 바꾸는 `--update`로 덮어쓰지 않았다. 실제 새 부재력·반력·변위와 단면 성질 출처를 다시 캡처했으며 이전 압축 fixture는 위 증거 폴더에 보존했다. 원래 문서의 12 DB 해시 일치를 확인한 뒤에만 세 fixture를 갱신했다.

## 공식 참조

- [MIDAS Section Properties – Value](https://support.midasuser.com/hc/en-us/articles/35839753881497-Section-Properties-Value): I·연단 거리·Iw·설계 Zyy/Zzz의 필드 의미.
- [MIDAS Section Properties Calculation Results](https://support.midasuser.com/hc/en-us/articles/35994769341081-Section-Properties-Calculation-Results): `/ope/SECTPROP` API.
- [MIDAS Section Properties – DB/User](https://support.midasuser.com/hc/ko/articles/35809067039513-Section-Properties-DB-User): DB명·단면명과 치수 입력의 구분.
