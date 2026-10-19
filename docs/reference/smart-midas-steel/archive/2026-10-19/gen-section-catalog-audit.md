# Gen NX 단면 카탈로그 API 대조

> 아카이브 · 2026-10-19 정리. 과거 계획·구현·검증 기록입니다. 당시 미완료 항목이 모두 완료됐다는 뜻은 아닙니다. 현재 상태는 [현황](../../current-status.md), 남은 과제는 [로드맵](../../roadmap.md)을 우선 확인하세요.

> 2026-10-18 업데이트: 이 문서의 차이 분류는 당시 치수 근사식과의 대조 기록이다. 현재 표준단면 계산은 [Gen NX 기준 단면 성질](../../reference/gen-section-property-source.md)로 전환했다. 800개는 Gen 출처로 사용하며 미해결 8개는 제외 유지한다.

검증일: 2026-10-17 (한국 시간). 대상: 앱이 현재 보유한 TW·CN·KR 후보 카탈로그 808개.

## 1. 조회 경로 확인

- `GET /db/SECT`: 현재 열린 모델에 정의된 단면. 최초 조회는 6개였으며 설치된 전체 단면 DB 목록이 아니다.
- `GET /ope/SECTPROP`: 현재 모델의 단면 ID별 계산 성질. 최초 조회도 6개였다.
- `GET /info/db/SECT`: 입력 JSON Schema. `DB_NAME`·`SECT_NAME`을 지정하는 필드는 있지만, 국가별 DB명이나 규격명을 열거하는 카탈로그 응답은 없었다.
- `POST /post/TABLE`, `TABLE_TYPE: SECTIONALL`: 현재 모델에 정의된 단면의 표. 전체 **모델 단면**이라는 뜻이며 전체 **설치 카탈로그**가 아니다.
- 확인한 공식 공개 문서·SDK·라이브 응답 범위에서는 설치된 전체 카탈로그를 직접 열거하는 API를 찾지 못했다. 비공개 경로까지 없다고 단정하지 않는다.

공식 [API 매뉴얼](https://support.midasuser.com/hc/en-us/articles/33016922742937-MIDAS-API-Online-Manual)은 `/db`를 모델 파일에 저장된 데이터로 설명한다. 성질 조회는 [Section Properties Calculation Results](https://support.midasuser.com/hc/en-us/articles/35994769341081-Section-Properties-Calculation-Results)를 따른다.

## 2. 실제 등록 검증

현재 모델을 고유 이름으로 `C:/temp/sms_catalog_backup_*.mgbx`에 저장한 뒤 새 검증 문서를 만들었다. 기존 앱 프로필의 DB명·규격명·형상으로 40개씩 등록하고 이름·DB·형상 readback 및 양수 단면 성질을 확인했다.

| 코드 | 단면 DB | 후보 수 | 등록·성질 조회 성공 |
|---|---|---:|---:|
| TW | CNS2020 | 235 | 235 |
| CN | GB-YB05 / GB50018-02 | 346 | 346 |
| KR | KS21 | 227 | 227 |
| 합계 | | 808 | 808 |

**전체 설치 DB의 모든 형상을 조사한 결과는 아니다.** 앱이 이미 가진 H·립 C·원형강관 등의 후보를 조사했다. 설치 DB 파일 4개의 SHA-256은 `src/data/section-catalog-audit.json`에 기록했다. 다른 Gen 설치·DB 버전에 같은 결과를 자동 보장하지 않는다.

## 3. 성질 대조와 재확인

- 검증 문서 단위는 `KN / MM`. m 단위에서 소수점 6자리 응답을 쓰면 작은 관성모멘트가 0으로 반올림될 수 있어 MM으로 변경했다.
- 비교: 단면적 A, 강축 Ix, 약축 Iy, 비틀림 J, 전체 높이 d, 전체 폭 bf.
- 축 대응: 앱 Ix = Gen Iyy, 앱 Iy = Gen Izz, 앱 J = Gen Ixx. 좌표축 이름을 그대로 비교하지 않았다.
- `/ope/SECTPROP` 최초 조회와 저장 문서 재개방 후 재조회가 **808개 모두 동일**했다.
- 독립 응답 형식인 `/post/TABLE SECTIONALL`의 A·Iyy·Izz·Ixx도 **808개 모두 일치**했다. 표 출력 소수 4자리 반올림은 절대오차 0.000051 및 큰 수 표현의 상대오차 1e-12로 처리했다.
- Gen 응답의 일부 부가 성질 단위 표기가 일관되지 않아 Iw/Cw·전단면적·단면계수는 이번 일치 판정에 넣지 않았다. 따라서 ‘모든 단면 성질이 검증되었다’고 표시하지 않는다.

### 선택 목록용 분류

차이는 `(앱 − Gen) / Gen`. 아래 0.5%·10%는 **검토 우선순위를 나누는 프로젝트 정책**이며 설계규정 허용오차가 아니다.

| 코드 | 0.5% 이내 `normal` | 차이 검토 `review` | 우선 제외 `quarantine` |
|---|---:|---:|---:|
| TW | 40 | 194 | 1 |
| CN | 227 | 114 | 5 |
| KR | 64 | 161 | 2 |
| 합계 | 331 | 469 | 8 |

- `normal`: 비교한 6개 값 모두 0.5% 이내. 구조적 적합 판정과 별개다.
- `review`: 0.5% 초과, 10% 이하 차이. H형강은 앱의 필렛 생략·박판 비틀림 근사, 립 C형강은 중심선·모서리 반경 생략 등의 영향이 있다. 개별 차이의 원인을 모두 확정한 것은 아니다.
- `quarantine`: 하나라도 10% 초과, 등록/파서 미지원, 또는 구현 가능한 재료 조합이 없는 경우 일반 선택 목록에서 제외한다. 이번 8개는 모두 성질 차이 기준에 해당했다.

### 우선 제외 8개

최대 상대차이 항목만 기재. A는 mm², Ix·Iy는 mm⁴.

| 코드 | 단면 | 항목 | 앱 값 | Gen 값 | 차이 |
|---|---|---|---:|---:|---:|
| TW | RH 918x303x19x37 | Iy | 172,027,532.83 | 1,720,000,000 | −90.00% |
| CN | HN 550x200x10/16 | A | 11,580 | 14,925 | −22.41% |
| CN | HW 344x348x10/16 | A | 14,256 | 16,465 | −13.42% |
| CN | HW 344x354x16/16 | A | 16,320 | 14,401 | +13.33% |
| CN | CC 100x50x15x2.5 | Iy | 189,516.45 | 171,900 | +10.25% |
| CN | P 108x5.5 | Ix | 2,332,613.65 | 1,333,200 | +74.96% |
| KR | LH 125x125x3.2/4.5 | Iy | 1,465,160.51 | 147,000 | +896.71% |
| KR | LH 150x150x3.2/4.5 | Iy | 2,531,635.02 | 253,000 | +900.65% |

일부 값은 자릿수 차이 또는 DB 값 이상 가능성이 있어 제조사/원 규격표 대조가 필요하다. **Gen DB의 오류라고 확정하거나 앱 계산을 Gen 값으로 덮어쓰지 않았다.** CN 립 C의 10.25%는 근사 차이의 연장일 수도 있으나 동일한 제외 정책을 적용했다.

## 4. 선택 목록 데이터와 조회 함수

### v2.3.1 모델링 화면 연결 (2026-10-18)

- `PlanCard`의 기본 위저드·자유골조·최종 확인에 공통 `SectionPicker`를 연결했다. 기둥·지붕보·퍼린·거트·스트럿·풍주·가새 7개 역할의 목록을 설계기준·실제 적용 재료별로 제공하고 형상별로 묶는다.
- 재료를 먼저 표시한다. CN/KR 퍼린·거트는 주골조 재료가 아닌 `secondaryMaterial`을 적용하며, 생략된 기존 스펙은 Gen 전송과 같은 CN Q235B / KR SS275를 사용한다. TW는 주재료를 적용한다.
- 성질 차이 검토·냉간 예비검토는 후보와 현재 선택에 표시한다. 등록 여부를 설계 합격으로 표시하지 않는다. 계산 성질·최적화 알고리즘은 바꾸지 않는다.
- 재료 변경 시 기존 단면은 자동 교체하지 않는다. 선택 목록 밖 값도 현재값으로 유지하고 확인 안내를 표시한다. 기존 직접 입력은 접힌 고급 입력으로 유지하며 기존 구문 검증을 적용한다. 직접 입력 경로에 카탈로그 등록 확인을 보장하지 않는다.
- `verify-catalog-audit.ts`에서 TW/CN/KR × 7개 역할 × 기본/자유골조 입력의 변경값이 모델 및 Gen 단면 페이로드에 전달되는지, 기본값 유지·재료 분리·옛 스펙 fallback을 검증한다. 이번 변경의 검증은 오프라인 및 브라우저 검토이며, Gen 등록 증거는 위의 기존 808개 조사다.

- `src/data/section-catalog-audit.json`: 808개 전체 등록 결과, 성질별 상대차이, 분류, 역할, 재료별 구현 범위, DB 해시.
- `src/domain/sectionCatalog.ts`: `sectionCatalogOptions(code, role, material, includeReview)`.
  - 국가·부재 역할·재료로 목록을 고른다.
  - 우선 제외 8개 및 해당 재료가 구현 범위를 벗어나는 조합은 반환하지 않는다.
  - `includeReview=false`이면 비교값 0.5% 이내 항목만 반환한다.
  - 기본값은 검토 항목도 반환하되 `selectionStatus`·차이·사유를 유지한다. 향후 선택 UI에서 경고를 함께 표시해야 한다.
- 재료별 범위는 현재 계산 함수에 기준 길이 1000 mm를 넣어 구현 여부·명시적 한계를 확인한 것이다. 실제 부재 길이·하중·내진 시스템·접합부의 적합성은 프로젝트 설계 검토에서 다시 확인한다.
- 냉간성형은 `preliminary`를 유지한다. 예비검토를 완전 지원으로 승격하지 않는다.
- 계산용 `sectionProps`·기존 최적화 후보·현재 단면 직접 입력 UI는 이 조사에서 변경하지 않았다. 이 함수는 다음 단면 선택 UI에 연결할 준비 데이터다. 기존 경로가 자동으로 이 제외 목록을 적용한다고 해석하면 안 된다.

## 모델 복원

검증 및 재확인 모두 원래 문서의 UNIT/MATL/SECT/NODE/ELEM/CONS/FRLS/STLD/LCOM-GEN/BODF/BMLD/CNLD 12종을 작업 전후 SHA-256으로 대조해 일치를 확인했다. 새 모델 생성·검증 단면은 별도 scratch 파일에 보존했다. 현재 열린 문서는 검증 전 내용을 저장한 백업 사본이며, 원래 파일 이름으로 자동 덮어쓰지 않았다. 해석 재실행은 하지 않았다.

## 재현 및 산출물

키는 기존 `scripts/mapi-key.ts`로 stdin → 환경변수 → `.env` 순서로 읽으며 출력·저장하지 않는다.

```powershell
# 조회만 수행
node --import tsx scripts/audit-gen-catalog.ts
# 백업 후 별도 모델에서 전체 후보 등록·조회·복원
node --import tsx scripts/audit-gen-catalog.ts --register
# 위 명령이 출력한 폴더를 지정하여 별도 표 조회 및 재조회
node --import tsx scripts/confirm-catalog-audit.ts output/catalog-audit/<run>
# 오프라인 대조·선택 목록 생성
node --import tsx scripts/publish-catalog-audit.ts output/catalog-audit/<run>
node --import tsx scripts/verify-catalog-audit.ts
```

라이브 원시 증거: `output/catalog-audit/2026-10-17T04-44-02-124Z/` (Git 제외).

- `inspection.json`: 최초 읽기 조회 및 입력 Schema.
- `registered-sections.json`, `section-properties-mm.json`: 등록 readback·성질.
- `section-table.json`, `section-properties-repeat.json`: 별도 표·재조회.
- `comparison.json`, `comparison.csv`: 전체 수치 비교.
- `recovery.json`, `confirmation-recovery.json`: 백업·scratch 위치 및 복원 해시.

스크립트의 기본 백업 경로 `C:/temp`는 **Gen 실행 PC 기준**이다. 다른 PC/설치에서 재현할 때 해당 폴더 존재와 Gen 연결을 먼저 확인한다.
