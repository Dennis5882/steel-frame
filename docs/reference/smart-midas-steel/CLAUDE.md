# CLAUDE.md — Smart MIDAS Steel

## 소통
- **한국어**로 소통. 코드 식별자·API 키워드는 영어 유지.

## 개요
문서 시작점은 `docs/README.md`다. 현재 지원 상태는 `docs/current-status.md`, 미완료 작업은 `docs/roadmap.md`의 R01~R11로 관리한다. `docs/reference/`는 기술 참고·현재 기능의 상세 규칙(추가 구조 1~6단계·NG 보완·크레인 구간 포함), `docs/archive/2026-10-19/`는 완료·대체된 계획/구현/시험 기록이다. 아카이브의 미완료 목록이나 과거 수치를 현재 상태로 재사용하지 않는다. 사용자 제공 구조 확장 원안은 `docs/reference/gen_nx_factory_structural_modifier_architecture.md`에 원문 그대로 보존한다.

**v2.3.9 크레인 입력 간소화**: `crane.manufacturer`(빈칸=미정)는 생성을 막지 않고 scope 경고 `craneAssumed`(전문가 검토)로 남긴다. 출처 문구는 선택, 확인 체크는 크레인 전체(하중·위치·주행보) 하나 — 주행보 source/confirmed 는 검증하지 않는다(`craneInput.ts`). **API 서버**: 간체 zh-CN 은 `moa-engineers.midasit.cn`, 그 외 `.com` 기본(`store.BASE_URLS`·`syncBaseUrl` — 기본값일 때만, 연결 중·직접 입력 주소는 유지).

최신 크레인 운행 구간: 아래 초기 구현의 4/8베이 제한은 제거했다. 기본값은 건물 전체이며 `crane.travel`의 시작·끝 베이(0부터, 양끝 포함)로 일부 구간을 지정한다. 건물 형상 및 차륜 샘플은 유지한다. 결과 회수는 표 크기에 따라 분할한다. `verify-crane-travel.ts`, `live-crane-travel.ts` 참조. 공통 오프라인 검증은 현재 27종이다.

추가 구조 1~4단계(v2.0.0)는 `docs/reference/factory-additions-phases-1-4.md`, 5단계(v2.1.0)는 `docs/reference/factory-additions-phase-5.md` 참조. `FactorySpec.additions` → `applyAdditions` → Gen/하중 컴파일 흐름이며 출처 확인 후 **예비검토**로 제공한다. 요소 분할 시 `physicalKey`·`designLength`를 보존한다. 추가 부재는 `Element.addition`으로 지붕/벽 하중·기존 접합·주골조 단면 변경에서 분리한다. `crane.runway`는 기둥 축상 경간별 단순보·실제 차륜 절점 재하·처짐 검토. `wallOpening`은 측벽 한 베이의 닫힌 문만 지원하며 가새 베이를 차단한다. 제거 거트는 `removedGirts`에 남겨 폐쇄 외피 하중만 컴파일하고, `loadOnly`로 강재 자중·물량에서 제외한다. 가상 거트의 하중 ID를 실제 Gen으로 보내지 않는다. 주행보 중간 절점은 실제 지지점·횡지지로 간주하지 않는다. 지진중량은 정적 등가하중에 한 번만 포함하며 NMAS/모달해석은 아직 추가하지 않았다. 풍·지진+크레인 동시 조합·피로·국부지압·횡전단/비틀림·브래킷 상세·문 개방 시 내압·접합·기초는 별도 검토.  `verify-phase5.ts`, `verify-additions.ts`, `live-additions.ts --phase5`로 검증하며 라이브는 원본 저장·복원 12 DB 해시 일치 확인 필수.

6단계(v2.2.0)는 `docs/reference/factory-additions-phase-6.md` 참조. `roofCollectors`는 닫힌 지붕 덮개 하중만 보강보로 전달하고 가상 강재를 Gen에 보내지 않는다. `floorOpening`은 플랫폼 내부 작은보와 빈 면적의 하중·질량을 제외한다. 연결부는 웹 이동·이격·받침 검토 및 확인된 6성분 반력 인터페이스만 지원한다. 분리형은 연결하지 않으며 일체형은 생성 차단한다. 외부 건물·연결교 형상이나 ELNK를 자동 생성하지 않는다. 지붕 처짐은 웹 단순보 추정으로 명시하고 연결부 사용성의 값·한계는 mm로 표시한다. `verify-phase6.ts`, `live-additions.ts --phase6`로 검증한다.

v2.3.0 NG 진단·수동 단면 보완은 `domain/remediation.ts` → `actions/remediation.ts` → `RepairPanel.tsx`(설계 검토/최적화 단계)다. 국가·역할·재료별 감사 카탈로그에서 동일 형상/면적·Ix·Iy 증가 후보를 표본 탐색한다. 기둥–지붕보와 스트럿–가새를 쌍으로 검토하고 추가 부재 단면은 독립 경로로 변경한다. 기존 부재력·강성비 예상값과 Gen 재해석 확인값을 구분하며 추가 접합·기초 및 전문가 검토 한계를 유지한다. 계획은 Built/Results/Design/Connections 참조가 모두 같은 경우만 유효; 적용 전 확인 후 재검사·Gen 동일성 GET → 백업·재생성·해석·전체 결과 회수/검토 → 비교 저장. 실패/취소는 `lastFail.repair`로 복원 안내를 표시하며 일반 최적화 재시도로 바꾸지 않는다. `verify-remediation.ts`, `live-additions.ts --phase6 --repair-test`로 검증한다. 상세 기록은 `docs/reference/ng-section-remediation.md`.

MIDAS Gen 강구조물 자동 모델링 웹앱. 제품 개요·실행은 README.md, 미정 사항·남은 작업은 `docs/roadmap.md`.
참고 프로젝트: `E:/AI Study/story` (Gen NX RC 에이전트 — 같은 스택·MAPI 직접 호출 방식).

## 스택
Vite 8 + TypeScript + React 19 + Tailwind v4 + shadcn/ui(new-york) + **Vercel Functions 백엔드(`api/`)**.
- MAPI(로컬 MIDAS Gen) 호출은 **브라우저가 직접**(`midas-nx` SDK) — Vercel 서버는 사용자 PC의 Gen에 접근 불가.
- 백엔드(`api/*.ts`)는 단면·재질 라이브러리, 설계 검토 계산, 보고서 생성 등 Gen과 무관한 일을 담당. 핸들러는 Web 표준 `export function GET(req: Request)` 형식.

## 구조 (2026-10-15 story 셸로 재구성)
현재 모델링 UX는 `docs/reference/modeling-additional-structures-ux.md`의 7단계가 우선이다. `modelingFlow.ts` 단계 상수·오류 이동, `StructureEditor` 카드별 입력, `StructureSummary` 하중/최종 요약을 사용한다. 최초 `ScopeBox` 기능 체크는 제거했고 판정만 남긴다. 다경간은 횡단면에서, 연결부는 추가 구조에서 설정한다. 공통 지역/하중 변경은 추가 구조의 출처 확인을 해제하지 않는다. 형상/간격/재료/단면 변경은 해제한다. 기본·자유골조 모두 같은 카드 입력을 쓴다. `verify-modeling-flow.ts`를 공통 검증에 추가, 총 27종. v2.3.2 release.
화면 = story 와 같은 레이아웃·클래스명: 헤더(언어·기준·연결 pill·⚙) / [GUIDE 사이드바 + 대화형 작업 로그 | 분할선 | 로그·모델·3D·결과 탭] / 하단 바(버전·테마 navy/light/cyber) / MAPI 드로어.
- `src/styles/app.css` — story `shared/app.css` 사본 + 강구조 3D 토큰(`--p-col/raf/pur/girt/strut`). 색은 전부 테마 토큰. Tailwind(`index.css`)는 유지하되 화면은 app.css 클래스로 그린다.
- `src/state/store.ts` — story 식 mutable `S` + `notify()`/`useStore()`. `ui.ts` — log·addMsg·addPlanMsg·thinking·tab·previewSpec·draw3D.
- `src/agent/` — `guide.ts`(GUIDE 섹션, 문구 키 `g_<sec>_<n>`·`_cmd`), `parse.ts`(로컬 명령 ko/en/zh, 간체→번체 정규화), `session.ts`(send·testConn·setTheme·setCode·runCmd).
- `src/actions/` — `build.ts`(자동저장 → doc/new → 모델·단부해제·하중 PUT → DSTL), `analysis.ts`(자동저장 → doc/anal → 반력 합계), `results.ts`(M2 결과 회수), `design.ts`(M3·M4 실행), `optimize.ts`(단면 최적화 반복), `outputs.ts`(M5 계산서 HTML·M6 DXF).
- `src/domain/` — `portal.ts`(형상: 프레임·2차부재·박공 풍주/거트·X-가새), `gen.ts`(Gen 페이로드), `loads.ts`(하중·조합), `weights.ts`·`sections.ts`(단면 성질), `design.ts`(부재·사용성 검토), `connections.ts`(접합부 자동 산정), `schedule.ts`(물량), `catalog.ts`(CNS2020 후보 단면)·`optimize.ts`(단면 제안, 순수).
- `src/report/report.ts` 계산서, `src/drawing/` DXF(R12) 작성기·시트.
- `src/components/` — Header·Footer·Drawers·Guide·Chat·PlanCard(스펙 편집 카드, 디바운스 3D 미리보기)·Panels(로그·모델·결과)·View3D(Plotly 동적 import).
- `src/mapi/client.ts` — `mapi(method, path, body, note)` 호출·실패를 활동 로그에 기록. `verifyConn()`.
- `api/` — Vercel 서버리스 함수 (`/api/health` 등), `src/lib/api.ts` — 프론트 호출 헬퍼
- `src/components/ui/`·`src/lib/utils.ts` — shadcn(현재 미사용)
- 경로 별칭 `@/` = `src/`
- **자동 저장으로 Gen 확인 창 방지** (`src/actions/save.ts`): `doc/new` 직전(`sms_backup_*`)과 `doc/anal` 직전(`sms_model_*`)에 항상 `doc/saveas {Argument:"<S.saveDir>/sms_<tag>_<YYYYMMDD_hhmmss>.mgbx"}`. 저장 안 된 문서로 해석하면 실패 + Gen 대화상자가 남아 **API 전체가 응답 없음**(2026-10-15 관찰). 폴더 기본 `C:/temp`(Gen PC 기준, 드로어에서 변경, 없으면 "잘못된 경로" 창), 시각을 파일명에 넣어 덮어쓰기 창 회피. 라이브: 생성→해석 연속 2회 창 없이 각 ~10s. 해석 1회당 C:/temp 에 ~10MB(.GAX1) 누적.

## 설계기준·다국어
- **v2.3.2 Gen 성질 기준 전환(2026-10-18)**: `docs/reference/gen-section-property-source.md`가 아래 옛 근사식 설명보다 우선한다. `sectionProps(name, code)`는 국가별 `gen-section-properties.json`(808개 중 800 사용, 8 제외)의 API A/I/J/Cw·SDB 소성계수를 사용한다. 이름이 같은 TW/KR 강관도 DB값이 다르므로 생산 계산에서 code를 생략하지 않는다. `dimensionSectionProps` 및 code 생략은 비표준/독립 손계산·도형용이다. 냉간 유효단면은 별도 웹 예비검토. `sendModel`은 SECTIONALL MM의 A/I/J를 기준값과 대조해 불일치 시 완료를 차단한다. `section-catalog-audit.json`은 과거 근사식 비교 증거로 보존하고 선택 함수에서 Gen 출처 상태를 해석한다. v2.3.2 release. `capture-gen-section-source` → `publish-gen-section-source`, `live-gen-section-baseline`은 원본 저장/12 DB 복원 필수. 세 국가 fixture는 2026-10-18 실제 재해석으로 갱신했다. `verify-gen-section-source`를 공통 검증에 추가했다.
- **Gen 단면 카탈로그 조사(2026-10-17)**: `docs/archive/2026-10-19/gen-section-catalog-audit.md`. 앱 후보 TW235/CN346/KR227 = 808개 라이브 등록·성질 조회 성공, 독립 SECTIONALL 표 및 재조회 808개 일치. 0.5% 근접331/차이 검토469/10% 초과 우선 제외8. `src/data/section-catalog-audit.json`과 `domain/sectionCatalog.ts`가 다음 선택 UI용 분류·역할/재료 필터를 제공한다. 기존 직접 입력/최적화에는 아직 연결하지 않음. Gen DB값과 앱 근사를 동일값/설계OK로 표시하지 말 것. 냉간 예비검토·재료별 한계 유지. `verify-catalog-audit.ts`를 공통 회귀에 추가. 라이브는 `audit-gen-catalog.ts --register`→`confirm-catalog-audit.ts <folder>`→오프라인 `publish-catalog-audit.ts <folder>`. 백업·복원 12DB 해시 일치, 원시증거 output/catalog-audit(ignored).
- **v2.3.1 모델링 단면 선택**: 위 카탈로그를 `PlanCard` → `SectionPicker`에 연결했다(기본/자유골조/읽기전용 확인 공통). `modelingSectionChoices`는 Gen의 역할별 실제 재료와 legacy secondary fallback을 사용한다. 재료 변경 시 현재 단면을 유지하고 목록 밖 값·성질 차이·냉간 예비검토를 안내한다. 직접 입력은 접힌 고급 입력으로 보존하며 카탈로그 등록을 보장하지 않는다. 계산용 성질과 자동 최적화는 그대로다. `verify-catalog-audit.ts`가 3개 코드·7개 역할·2개 모드의 모델/페이로드 전달을 검증한다.
- **v1.9.1 숫자 휠 입력**: `NumericInput`은 선택한 숫자 칸에서만 native non-passive wheel 이벤트를 받아 화면 스크롤을 막고 값을 증감한다. 단위별 증분은 `planFields.numericStep`, 개별 베이는 0.1 m. 방향키 ↑↓도 지원하며 min/양수 하한·빈칸/NaN 유지. 텍스트·단면명·목록 문자열은 제외하고, 읽기전용/잠금 및 Ctrl 휠 확대는 보존한다.
- 기본 모델링 길이·베이: 등간격/개별 간격을 선택한다. `planFields`의 `individual` 인자로 자유골조와 독립적으로 목록 입력·검증을 사용한다. `BaySpacingEditor`는 칸별 입력·추가·삭제, 빈칸 유지 및 검증을 제공한다. 베이 수·총길이는 목록에서 계산하고 도식은 실제 누적 위치를 표시한다. `verify-input.ts`가 TW/CN/KR 목록·등간격 전환·빈칸 차단을 검증한다.
- **v1.7.1 글꼴**: `public/fonts/ui-fonts.css`의 언어별 `--font-ui`·`--font-mono`를 앱과 HTML 계산서에서 공유. 한국어 Pretendard Variable 1.3.9 공식 dynamic subset 92개를 자체 배포(라이선스 포함), 영어 IBM Plex Sans·번체 Noto Sans TC·간체 Microsoft YaHei UI→Microsoft YaHei→Noto Sans SC. 버튼·설명·표 라벨은 UI, 수치/단면/로그는 `.mono` 등으로 지정. PDF의 지역별 Noto 내장 방식은 유지. Plotly도 CSS의 현재 언어별 mono 스택을 읽음.
- **v1.7.0 (2026-10-17)**: 대만 제공 냉간성형 원문 반영 기록은 `docs/reference/taiwan_cold_formed_review.md`. `twDistortional.ts`는 TW 전용(6.2.3·7.3), KR 수식과 분리. TW 인장·휨 두 연단 검토, CF 치수·Fy 한계 차단, 열간 LRFD 부록1 Qs·Qa 반영. 약축 유효폭·편심 비틀림·웨브 지압·클리트 등은 남아 냉간 예비검토 유지. 미지원 세장 H 휨·상한 초과 강관은 `sectionRange` blocked. 골조 최적화 후보는 주각·무릎·마루 접합도 통과해야 하며 접합 NG는 수렴으로 표시하지 않음. `decodeResults`는 원시 fixture를 복사해 B2 재계산으로 캡처값이 변하지 않게 한다. 신규 `verify-tw-coldformed.ts` 22개, 공통 19개 묶음.
- **v1.6.0 (2026-10-17)**: 다경간 처짐은 `roofDeflection.ts` 경간별 지지점 보간 기준. `FactorySpec.restraints`의 flyBraces/sagRods/braceCrossing은 assumed(생략 시 기본)/confirmed/none; CN 가새는 전 길이라 crossing 입력 없음. 가정은 전문가 등급, 없음은 검토 길이·새그로드 약축 보정 해제. `validity.ts`의 blocked 이슈(KR B2>1.5·CF 표 한계)는 실패 등급, 최적화 유효안 제외, 산출물 전체 게이트에 연결. 신규 `verify-review-fixes.ts` 회귀 포함. CN 접합 보강은 `cnConnection.ts` 및 `cnConnections.ts`이며 실제 상세·기초 전문가 검토는 유지. TW Q/냉간성형 원문 대조는 사용자가 준비 중이므로 이번 변경에서 유보.
- **v0.19.0 프로젝트 기준**: 상단은 언어·Gen 연결만 제공. Workspace 시작 화면의 설계기준 카드 → 건물 유형 순서. 편집기에는 현재 기준과 변경 진입점 표시. `session.setCode`는 작업/확인 중 차단하고 기존 입력이 있으면 확인 후 유효 형상·간격·적용범위를 유지, 나머지는 새 코드 기본값으로 초기화하여 새 편집기를 연다. Gen 모델·결과는 유지하되 draft와 다른 결과의 후속 실행·출력은 기존 stale 게이트로 차단한다.
- **v0.19.1**: 설계기준은 드롭다운. 국가지역명 대신 `GB 51022`(4개 언어 공통, 사용자 결정 2026-10-19 — 이전 `GB 50017-2017`). 선택 라벨일 뿐이고 부재·접합 검토 근거는 프로필 `checkLabelKey`(CN `GB 51022-2015 · GB 50017-2017 · GB/T 50018-2025` — 门式刚架 규정은 GB 51022, 부재 강도·안정은 GB 50017(51022 7장 미구현, 로드맵 R11), 냉간 C형강 GB/T 50018. 상태 카드·계산서 '설계 검토'), 모델 탭·계산서 머리는 `basisLabelKey`(판본 포함 `GB 51022-2015 · GB 50017-2017 · GB/T 50018-2025`) / `LRFD · 鋼結構極限設計法規範` 표시(대만 규범에 GB식 번호를 만들지 않음). 새 탭의 기준은 간체 `CN`, 그 외 `TW`이며 이전 `sms_code` 저장값은 사용하지 않는다. 입력 시작 전 언어 변경은 기본값을 갱신하고, activePlan/built가 있으면 언어만 바뀐다. 수동 드롭다운 선택은 계속 허용.
- **중국(CN) 추가(2026-10-15)**: 전체 흐름 및 적용 제한은 `docs/reference/china_code_implementation.md` 참조. 중국 전용 구현은 `codes/cn*.ts`, `domain/cn*.ts`. 현재 GB 55001/55002 하중계수, GB 50009 풍·적설, GB/T 50011 수평지진, GB 50017-2017 및 GB/T 50018-2025 검토. 공개 Gen 설계 API는 구판이므로 CN에서 DSTL을 보내지 않는다. 모델의 `spec.code`로 검토·출력을 분기하고, 선택 변경 시 새 입력 카드만 해당 국가 기본값으로 초기화한다. TW 수치식·입력 항목을 CN에 적용하지 않는다.
- 국가별 문구는 `tc(code, key)`로 `_CN` 키를 선택한다. UI 언어는 국가와 독립적이다 — **예외(사용자 결정 2026-10-16, 같은 날 갱신)**: 새 작업의 기준은 **언어 우선** — 번체(zh-TW) TW · 간체(zh-CN) CN · 한국어(ko) KR, 예전에 고른 기준(`sms_code`)보다 먼저. 영어만 고른 기준 유지(없으면 현재값). 작업 중(activePlan/built) 언어를 바꾸면 기존 기준 유지. 간체에서 새 작업은 CN 만 선택 가능, 그 밖 언어는 드롭다운으로 다른 기준 수동 선택 가능(언어를 바꿀 때만 재적용 — 수동 선택은 되돌리지 않음). 언어 규칙에 따른 변경은 `setCode(…, {auto})` 로 저장 안 함. 규칙은 `store.codeForLang`(회귀 verify-workspace). CN 오프라인 회귀: `node --import tsx scripts/verify-cn.ts`. **GB 51022-2015 门式刚架 반영(2026-10-16)**: 풍 μw·β(1.1 주골조/1.5 외장재)·끝 구역 2a (`codes/cnPortal.ts`, GB 50009 μs·βz 대체 — 입력 βz 제거), 적설 표 4.3.2(쌍坡 0.75/1.25 모든 경사·다경간 골 1.4/2.0 SV1·SV2·반경간 SH 는 1.3D+1.5S 만, 지진 조합은 SN 만), 8·9도 수직지진 EV(4.4.2-3, 이전 차단 해제), 변위 h/60·거트 L/100·풍주 L/250, 세장비 180/220/400, 흔들림 기둥 η(A.0.6), γRE 0.85/0.90, 내진 상세 3.4.3, 隅撑 축력 8.4.2(계산서). 기본 모델 케이스 17·조합 87. 하중계수는 GB 55001 유지. 문서 `docs/reference/china_code_implementation.md`. 라이브(2026-10-16): 케이스 17·조합 87 수용, API 오류 0, 반력 = 오프라인 하중 합(LR 432·SN 259.2·SH 129.6·WX1 FX 96.364·FZ 343.157), 기본 단면 최대 0.869 NG 0 → 최적화 3회 57.34 → 47.51 t NG 0 최대 0.930(접합 0.988), CN 정답 세트 재캡처. verify-pdf 에 CN 계산서 글자 검사 추가. 라이브: `scripts/live-cn.ts`(키는 stdin, 파일에 저장 금지).
- **한국(KR) 추가(2026-10-16, 1·2단계)**: 흐름·가정·검증은 `docs/reference/korea_code_implementation.md`. `codes/kr*.ts`, `domain/kr*.ts`. KDS 41 30 10 → KDS 14 31 10/15 (LRFD, 유효길이법 + 가상하중 0.002Y), 하중 KDS 41 12 00 (조합 1.7.1, 풍 5장 G_D·G_pe·표 5.7-1/5.7-4·5.13.1 풍직각, 적설 4장), 지진 KDS 41 17 00 (R 3 일반규정 강구조, 범주 D 직교 30%, 우발비틀림) + KDS 17 10 00 (2024, KB 추가 2026-10-16) 표 4.2-1 지진구역(입력 `korea.region` 행정구역 → 구역·S 자동, 강원 시·군별)·표 4.2-2 Z·S = Z × 2.0 하한 80%. V0·Sg 는 지도뿐(표 없음) → 수동 입력. 사용자 결정: **부재 검토는 앱 자체 계산, Gen KDS 설계(post/STEELCODECHECK)는 라이브 대조용만**(`live-kr.ts --gen-check`). 2단계(2026-10-16 모두 구현, `krPhase` 경고 제거): **외장재 풍하중** 5.4.2·5.8 `codes/krWindCC.ts`+`domain/krSecondary.ts`(표 5.8-2~5.8-4 그래프를 원문 그림에서 직접 읽음, 피크 Cpi = 표 5.7-4 × 2, A_C = 경간 × 부담폭) · **접합부** 14 31 25 `codes/krConnection.ts`+`domain/krConnections.ts`(F10T·마찰·지압·필릿 L−2s·지압 φc 0.65·패널존·국부휨 50%·스티프너, 단부판·베이스판은 KDS 식 없음 → AISC DG4 두꺼운 판·DG1, 앵커 콘크리트 정착은 메모 `krFoundation` = 전문가 검토) · **냉간성형 립 C** 41 30 30 `codes/krColdFormed.ts`(AISI S100-16 번역 — twColdFormed 유효폭 재사용 + φb 0.90·단면형상변형·4.6 조합식) · **지진력저항시스템** 표 6.2-1 `korea.systemX`(general|OMF)·`systemY`(general|OCBF), R>3 이면 14 31 60 상세 + 증폭지진 조합 `A5…`/`A7…`(comboKind amplified — 일반 부재 검토 제외; 라이브 2026-10-16 조합 62 수용·최적화 40.46 t NG 0·처마 0.996, Gen 대조 기둥 0.916/0.926·지붕보 0.901/0.901 — 처마 4E 8본 고정이 OMF 1.1RyMp 의 한계). H ≥ 20 m·편지붕 > 30° 는 block. 계산서 글꼴에 없는 글자 주의(～·糙 → 회귀가 잡음). **KS21 에 립 C형강 45개 있음** (`LC-150x65x20x3.2`, SHAPE `CC`·재료 `SSC275` 라이브 수용 2026-10-16 — 처음 추출 때 하이픈 이름을 놓쳐 '없음'으로 잘못 기록했었음). KR 기본 퍼린 LC-200x75x20x3.2·거트 LC-150x75x20x3.2·2차 재료 SSC275. Gen KDS 강재 검토는 립 C 를 검토하지 않음(410 중 246). Gen 연동명(KS22(S)·KS21·LH SHAPE H·STLD USER)은 DLL 문자열에서 찾음 — **라이브 확인(2026-10-16, 박공·편경사·다경간, API 오류 0)**. 라이브에서 고친 Gen 규칙(TW·CN 에도 해당): **TRUSS 요소에 보 하중 불가**(가새 가상하중 → 양 끝 절점), **한 절점에 같은 케이스 CNLD 항목이 둘이면 하나만 남음**(합산해 보냄), **조합 이름 ≤ 20자**(KR 이름은 `1.7-5 +EX+T+0.3EY` — `KDS ` 접두사 없음). KDS 강재 설계 코드는 `DESIGN/STEEL/DSTL`(구 db/DSTL 아님) — 모델 생성 때 안 보내고 `--gen-check` 에서만: DSTL → `db/LCOM-STEEL`(STRENGTH, 없으면 CODE-ANAL `failed:LoadCombination`) → 길이 맞춤(`krLengths` → `KDS-41-30-2022/LENG` LY·LZ·LB + KFAC 1 + DCTL + DCO LAT_BRACE false + MBTP, `--gen-default` 면 생략) → **autoSave** → `doc/anal` 재해석(안 하면 'Please perform analysis.') → CODE-ANAL → STEELCODECHECK → CODE-TABLE(Gen 이 쓴 Lb 확인). 맞춘 뒤 대조: 기둥 앱 0.8483/Gen 0.8477·지붕보 0.8345/0.8288. **라이브 검증은 해석 전 항상 자동 저장(C:/temp) — raw doc/anal 금지(Gen 저장 창, 사용자 요청 2026-10-16). 같은 Gen 을 다른 작업(gen_rc_temp_*)이 쓰는 중이면 라이브를 멈춘다.** Gen 기본 설정 대조(--gen-default, LH 퍼린 시절): 기둥 앱 0.856/Gen 0.819·지붕보 0.842/0.807·풍주 0.577/0.553 (앱이 ~4% 보수적), 퍼린·거트 Gen 2.4·3.2 = Gen 기본 Lb = 부재 길이 6 m(앱은 새그로드 반영 2 m — φMn 비 3.9), 스트럿·가새 앱 값 = KL/r(Gen RAT 에 세장비 미포함). 라이브 최적화: 박공 46.96 → 41.33 t NG 0 최대 0.920, 편경사 기본 NG 74(골조 1.79) → 62.08 t NG 0 최대 0.857, 다경간 24+24 기본 NG 10(거트 KL/r 1.19) → 86.92 t NG 0 최대 0.961. 대칭 골조의 거울상 조합은 생략(xSym·ySym). 기준 모델 정답 세트 `fixtures/kr-sample.json.gz`(라이브 2026-10-16, `verify-golden.ts --code KR` — npm run verify 포함, 캡처 `capture-tw-golden.ts --code KR`). 오프라인 회귀 `verify-kr.ts`(794, 합성 결과 `scripts/kr-synth.ts`). 계산서 글꼴에 없는 아래첨자 숫자(₀₁₂)는 쓰지 않는다(Noto CJK 에 없음 — V0·R1).
- **코드 프로필** `src/codes/` — `CodeProfile`(재료·하중조합·Gen 연동명). UI 언어와 독립. 기준 추가 = `<id>.ts` + `PROFILES` 한 줄 + `CodeId`. 기준 의존 로직은 `profileOf()`를 거친다.
- **다국어** `src/i18n/` — ko/en/zh-TW/zh-CN. 사전 `dict/en.ts`가 키 기준, 나머지는 `Dict` 타입이라 **키 누락·인자 불일치는 컴파일 오류**. UI 문구는 `t('key')`로만 (인라인 다국어 객체 금지). 언어 추가 = `types.ts` `LANG_DEFS` 한 줄 + 사전 파일.
- 중국어 용어: zh-TW는 대만 규범 용어(屋樑·檁條·牆樑), zh-CN은 대륙 용어(屋面梁·檩条·墙梁). 참고 오라클은 story CLAUDE.md의 i18n 절.

## 원문·Gen NX 참조 자료
- 국가 코드 원문 KB: `E:/MIDAS PROGRAM/COde/{TW,CN,KR,US}/knowledge/` (조항 단위 `chunks.jsonl`). 대만 강구조: `TW/knowledge/steel-design-technical-code`(ASD/LRFD), `steel-construction-code`(施工), `seismic-design-code`, `wind-load-2014`, `building-technical-rules-structure`(冷軋型鋼 포함).
- 하중조합: LRFD 2.2 (2.2-1~2.2-6) 반영 완료.
- Gen NX 설치 폴더에는 강구조 설계 코드 문서 없음 → 위 KB가 원문 출처.
- **Gen NX 라이브 확인(2026-10-14, 대만)**: 설계 코드 `db/DSTL` = `TWN-LSD90`(LRFD)·`TWN-ASD90`; 단면 DB `CNS2020`(최신)·`CNS91` — H형강 `RH 400x200x8x13`(압연)·`BH`(용접), 립 C형강 `CC 150x65x20/3.2`(치수/두께), 각형강관 `B`·`BB`, 원형강관 `P`; 재료 `db/MATL` STEEL `CNS(S)`/`CNS06(S)` DB = SS400·SM400·SM490·SM490Y·SM520·SM570·SN400·SN490 (**SN400B 같은 등급 접미사는 거부** → 프로필 `gen` 매핑).
- **M1 전송 라이브 검증(2026-10-14)**: 샘플 공장(절점 189·요소 332·단면 5·지지 14) UNIT→MATL→SECT→NODE→ELEM→CONS→DSTL 전부 수용, GET 개수 일치, 이후 DELETE 로 원복. 립 C형강 `SHAPE` = `CC`(`C`·`LC` 거부). `db/CONS` `GROUP_NAME` 은 미리 정의된 경계 그룹만 허용 → 생략. 형상→페이로드는 `src/domain/gen.ts`(순수), 전송은 `src/actions/build.ts`. 알려진 단순화: 퍼린 국부축은 경사 지붕 정렬 생략(beta 0), 거트 beta 90.
- **M1.5 하중 라이브 검증(2026-10-14)**: `src/domain/loads.ts` — 케이스 `D`(자중 BODF + 지붕/벽 마감을 퍼린·거트·처마/마루 스트럿에 BMLD)·`LR`(지붕 활하중, 建築技術規則 26조 면적별 표). 조합은 케이스가 있는 것만 생성(현재 2.2-1·2.2-2, 풍·지진 케이스 정의 후 나머지). 해석 `POST doc/ANAL` 성공, 반력표(`post/table` REACTIONG)로 평형 확인: LR 합 847.3 kN = 0.9807×24×36, D 합 492.1 kN ≈ 자중 ~310 + 마감 ~182. 마감 하중 `roofDead` 0.15·`wallDead` 0.10 kN/m² 은 **가정값**. 활하중 면적 저감은 퍼린 기준(≤20 m² → 100 kgf/m²)만 적용 → 프레임에는 보수적.
- **횡하중 라이브 검증(2026-10-15)**: 식 `src/codes/twLateral.ts`(story tw.ts 원문 대조판 기반 + 강구조 값). 지진 = 정적 등가 V = c·W, T = 0.085hn^¾(X 모멘트골조)·0.050hn^¾(Y 가새), hn = 처마+rise/2, R 표1-3(Rx 3.2 部分韌性 鋼 h≤12m, Ry 2.0 同心斜撐 h≤12m), αy 1.0(LRFD 2.2). W = 절점 무게(단면명 치수로 면적 계산 `weights.ts` + 마감) — Gen D 반력 492.12 vs 오프라인 492.68 kN(0.1%). 2.11 분배 w·h → `db/CNLD`. 풍 = MWFRS p = qGCp − q_i(GCpi), 표2.4 벽·표2.5 지붕(θ<10° 이면 h = 처마높이, θ 0~10 은 직선보간, ≤0.3 행의 +0.2/−0.9 두 값 → high/low)·표2.17 ±GCpi → WX1~4, 퍼린·거트에 GX·GZ 선하중. 반력 합 EX 98.552·EY 122.555·WX1~4 FX/FZ 전부 계산값과 일치. 조합 18개(E ±, W 는 케이스가 변형).
- **횡하중 미구현**: 종방향 풍(용마루 평행, 박공벽)·우발편심(2.14)·수직지진(2.18)·대북분지/VM·工址 SDS/SD1 표 조회(현재 샘플 0.6/0.35). W ±(반대 방향)은 대칭 구조라 미러로 대체 — 비대칭 모델이면 추가 필요.
- Gen 오류 메시지는 허용 값 목록을 주지 않는다 — 정확한 문자열은 설치 폴더 `Dbase/*.sdb`·DLL 문자열에서 찾아 시험 PUT 후 DELETE로 원복.

## 전체 프로세스 (2026-10-15 완료, 라이브 검증)
화면 명령 순서: `공장 생성`(스펙 카드 → 실행) → `해석` → `설계 검토` → `계산서` / `도면`. 샘플 1회 전체 ≈ 26 s.
- **모델**: 절점 219·요소 410 (풍주 30·박공 거트 32·가새 16 TRUSS). 퍼린·거트·스트럿 양단 핀(FRLS My·Mz), 풍주 상단 핀. TRUSS 단면은 `USE_WARPING_EFFECT:false` 필수(아니면 "7th DOF" 오류). 가새는 끝에서 두 번째 베이(끝 베이는 박공 프레임 처짐 차로 중력 축력 187 kN 발생 — 라이브).
- **하중**: WY1·2(종방향 풍: 박공 풍상 0.8q(z)·풍하 Cp(L/B)·측벽 −0.7·지붕 −0.7) 추가 → 케이스 10·조합 22. 반력 합 전부 계산값 일치(D 586.4 vs 오프라인 584.7).
- **M2 결과**: `BEAMFORCE`(조합 `(CB)`, PARTS I·1/4·2/4·3/4·J, 410 요소 × 22 조합 ≈ 4.3만 행 11 s), `TRUSSFORCE`, 조합별 반력 합·처마 변위(B2), 사용 하중 변위.
- **M3 부재 검토** `src/codes/twSteel.ts`(LRFD 4.4·4.5·5·6.2·7.2·7.3·8.2 원문식, tf·cm) + `domain/design.ts`. 강축 = 국부 `Moment-y`/`Shear-z`. 교과서 대조: 정렬도 K, Cb(1.667·1.136), φMp. 샘플 최대 0.90(거트), 사용성: 풍 변위각 0.24·지붕보 처짐 0.64.
- **M4 접합부** `src/codes/twConnection.ts`(LRFD 10장: F10T 표10.3-2/3, 앵커 0.75Fu/0.40Fu, 지압 10.9, 필릿 표10.2-5) + `domain/connections.ts`(주각 DG1, 4E 단부판 DG4, 패널존, 스티프너 J10, 가새 볼트). 샘플: 주각 8-M24·PL45 0.97, 처마 8-M22·PL25 + 스티프너 0.98, 마루 8-M20·PL19 0.95.
- **Gen 설계 API**: `post/STEELCODECHECK`·`DESIGN/STEEL/<code>/CODE-ANAL` 은 KDS 만 — TWN 404 → 설계 검토는 자체 구현.
- **M5 계산서**: 10장 HTML(화면 언어), 새 창 → 인쇄 PDF. **M6 DXF**: R12 5시트, ezdxf 검증 오류 0. 문자 ASCII 만.

## 모델링 방식 — 기본 모델링 / 자유골조 (2026-10-15, story 와 같은 구분)
- **v0.18.0 클릭형 3~5단계**: `TaskNav`의 모델링·해석·설계 검토·최적화(선택)·산출물 메뉴와 `TaskStage` 화면이 공통 `state/taskFlow.ts`로 상태·실행 조건을 표시한다. 메뉴 이동은 실행하지 않으며, 입력 편집기는 숨긴 채 유지한다. `draftSpec`/`draftInvalid`로 미리보기를 닫아도 이전 결과 판정을 유지한다. 잘못된 입력·Gen 변경·선행 단계 미완료 상태는 `executeAction` 및 모든 출력 진입점에서 차단한다. 모델 생성 후 해석 화면으로 이동한다. `NoticeCenter`는 오류·경고를 확인 전까지 유지한다. `ActivityHistory`는 작업·실패·취소·알림·출력 요청을 보존하며 API 로그와 분리한다. 모델 개정과 결과 개정을 출력 요청에 기록하고, 실제 디스크 저장 완료로 표시하지 않는다. 이력·입력은 탭 메모리에만 보관한다. 검증: `verify-task-flow.ts`, `verify-workspace.ts`, `npm run verify`.
- **v0.17.0 클릭형 작업 화면(1~2단계)**: `Workspace.tsx`가 시작 화면과 한 개의 `S.activePlan` 편집기를 표시한다. 입력창·타이핑 애니메이션·인사 메시지는 제거했다. `Guide` 및 `Workflow` 버튼은 `executeAction(Intent)`를 직접 호출하며 번역된 명령문을 파싱하지 않는다. `send`/`runCmd`는 텍스트 호출 호환용으로만 남긴다. `addPlanMsg`는 대화에 카드를 쌓지 않고 현재 편집기를 설정한다. 시작 화면에서는 편집기를 숨겨 잘못된 원시 입력·진행 단계를 포함한 React 상태를 유지한다. 같은 유형 재선택은 현재 편집을 재개한다. 유효한 마지막 입력은 `draftSpec`에 유지한다. 진행·취소·기존 Workflow·최근 작업 알림은 그대로 제공한다. 전체 업무 메뉴 통합 및 이력 화면은 후속 3~4단계. 검증: `scripts/verify-workspace.ts` 및 브라우저에서 입력·단계 유지 확인.
- **기본 모델링**(`mode 'template'`, v0.13.0): GUIDE 템플릿 → `PlanCard`/`ModelWizard`의 시작·범위 → 횡단면 → 길이·베이 → 재료·단면 → 지역·하중 → 최종 확인 6단계. 단계 이동 시 값 유지, 최종 확인에 전체 입력 펼치기·단계별 수정. 상하단 고정, 본문 스크롤. 템플릿(`domain/templates.ts`)은 형상만 바꾸고 기준별 재료·지역·하중은 유지한다. 양수·최솟값·정수·단면 성질·선택값 검증 후 다음 단계, 최종 단계에서만 `buildFactory`. 잘못된 입력 또는 범위 밖이면 미리보기는 마지막 유효 형상을 유지한다. 횡단면·베이 SVG 개념도와 실시간 3D 미리보기. 큰 스팬은 생성 후 설계 검토 → 단면 최적화.
- **자유골조**(`mode 'free'`): 처음부터 편집 카드, 베이 수·간격 대신 **베이별 간격 목록** `spec.bayList`. 명령 `자유골조 공장 생성` 또는 `공장 생성 베이 6,6,7.5,7.5,6`(목록이 있으면 자유골조).
- 불균등 베이: `normalizeBays`가 `bays = 길이`, `baySpacing = 최댓값`(퍼린·거트 경간 등 설계값 — 보수적), 모두 같으면 `bayList` 제거. 형상 `portalGeometry().spans`·누적 y, 지붕 활하중 면적은 최소 베이(면적 작을수록 하중 큼). 길이 표기 `lengthText`(결과 탭·계산서·DXF 치수). 오프라인: 6+6+7.5+7.5+6+6 LR 적용 합 917.9 = q×24×39, TW 기본 15/55·CN 13/51 유지. **Gen 라이브 미검증.**

## 검토 상태 등급·계산 주체 표시 (2026-10-15, 평가 보고서 A단계)
- `src/domain/status.ts`(순수): 등급 `fail`(NG) > `expert`(전문가 검토 필요: TW 처마 rotTest, CN gb* 상세) > `prelim`(예비검토: 냉간성형 `CC` 단면 — TW AISI 유효폭 원문 미대조, CN 근사) > `reinforced`(보강 후 통과: 스티프너·더블러) > `pass`. 사유는 모두 보존, 등급 = 가장 나쁜 사유. **'모두 OK' 문구 금지** — 채팅(`design_done`·`opt_done`)·결과 탭 `StatusCard`·계산서 상단 상태 상자 모두 등급 요약.
- 계산 주체: "해석 = Gen NX 선형 정적 / 설계 검토 = 앱 자체 계산 (Gen 설계 API: TW 미지원·CN 구판)" 을 결과 탭·계산서에 표기.
- 지진 계수 출처 `siteSource`(twSites): 입력값 = 표2-1·2-4 값이면 '자동값', 다르면 '사용자 입력 — 표값 …', 표에 없으면 '표에 없음'. CN 은 '프로젝트 입력'. 편집 카드·모델 탭·계산서 3장에 표시. 등급 문구는 `gr_*`/`gr_*_d`/`rs_*` 키.
- TW 샘플은 처마 접합 rotTest 때문에 전체 등급이 항상 `전문가 검토 필요` — 의도된 동작(회전 능력은 시험 근거 필요, 13.6.1).

## 적용범위 게이트 (2026-10-15, 평가 보고서 B단계)
- `src/domain/scope.ts`(순수) `checkScope(spec)`: **block**(실행 막음 — 크레인·메자닌·다경간 체크, 스팬 0~60·처마 ≤18·경사 0~1 밖, CN 큰 개구부, CN `validateCnSpec` 실패 메시지) / **warn**(실행 가능 — TW 큰 개구부(부분 밀폐 권고), 베이 간격 비 > 1.5, 베이 > 9 m, TW 길이 > 90 m, TW 평균 높이 > 12 m(표1-3 R 조건)).
- 건물 특성 답은 `spec.features`(크레인·메자닌·다경간·큰 개구부). 스펙 카드 맨 위 `ScopeBox`(체크 + 판정), block 이면 [실행] 비활성 + `buildFactory` 도 거부. warn 은 결과 상태를 최소 `전문가 검토 필요`로 올리고 결과 탭·계산서 상태 상자에 남김.
- 템플릿 4종은 TW·CN 모두 범위 안(물류창고 처마 11 m — 평균 높이 11.9 m).

## 계산서 그림·도면 (2026-10-15, C단계 1)
- 계산서 HTML 에 SVG 로 직접 그림 (캡처·라이브러리 없음, 인쇄/PDF 벡터 유지): 1장 3D 모델(`drawing/iso.ts` 등각 정투상, 3D 탭 iso 카메라 방향, 부재 종류 색 + 지점), 6장 강도비 분포(3D 탭 BANDS 와 같은 경계), 부록 도면 S1~S5.
- 도면은 DXF 와 한 코드: `Dxf` 가 시트별로 그리기 명령을 기록(`beginSheet`) → `toSvgSheets`. `drawSheets()` 하나로 `buildDxf`(문자열)·`buildDrawingSvgs`(계산서) 둘 다. 도면을 고치면 양쪽 반영.
- 대만 라이브: `printf '<key>
' | node --import tsx scripts/live-tw.ts --optimize --out <접두사>` (키는 stdin 만) → html·dxf·-summary.json. 계산서 양식만 고칠 땐 `scripts/report-from-summary.ts <summary.json> <out.html> [lang]` 로 Gen 없이 재생성. 2026-10-15 라이브: 해석 15 케이스·55 조합, 기본 최대 0.912 NG 0, 최적화 2회 46.96→42.58 t 최대 0.917, API 오류 0, A4 14쪽.
- 확인: 헤드리스 Chrome `--print-to-pdf` 로 A4 13쪽, 도면은 부록에서 새 페이지 시작. S2 아래 주석이 테두리 밖이던 것(시트 `below` 여백)·S5 접합 일람 비율 열 겹침 수정 — DXF 에도 적용.

## 계산서 PDF·물량 (2026-10-15, C단계 2·3)

### v2.4.0 계산서 Word(.docx)

- `report/docx.ts`가 PDF와 같은 계산서 HTML을 `docx`(9.8.1, 지연 로딩 청크)로 변환한다. h1→Title, h2~h4→Heading1~3, 본문 Normal, 캡션 Caption, 목록 글머리표 — Word 기본 스타일 id라 회사 양식 스타일을 덮으면 그대로 적용된다. 표는 Word 표(머리글 반복, 넓은 표는 PDF와 같은 열 분할), 그림은 표시 크기(최대 600 px)×2.5 PNG — 도면 SVG viewBox 가 mm 단위(폭 44 000)라 viewBox 크기로 그리면 캔버스 한도 초과로 빠진다. 글꼴: ko 맑은 고딕·zh-TW 微軟正黑體·zh-CN 微软雅黑·en Calibri. 머리글 = 제목, 바닥글 = 쪽 번호(임시) — **회사 표준 양식(.docx/.dotx) 적용은 양식 파일 수령 후**(jszip 으로 styles·header/footer·sectPr 합치기 예정). 회귀는 `verify-pdf.ts`가 같은 24개 계산서로 Word 도 검사(스타일·표·그림 수·글꼴·글자 누락, 그림은 1×1 PNG 스텁). 브라우저 실물 확인: Word COM 으로 열어 PDF 내보내기.

### v2.4.3 산출물 카드·도면 PDF

- 산출물 화면 = `TaskStage` `OUTPUTS` 카드 3개(계산서 PDF·Word·HTML / 도면 DXF·PDF / 물량 CSV) — 형식 선택(ARIA radio, 방향키) 후 추출, 카드별 형식은 localStorage `sms_format_<id>`. 작업 종류 `docx`·`dwgpdf` 분리(`FILE_JOBS` — 결과 개정 유지). 도면 PDF `report/pdf.ts drawingsPdfDefinition`: DXF 와 같은 SVG 시트를 A3 가로 한 장씩, vector-effect 대신 선 굵기·점선을 pt 환산, 글꼴은 PDF 표준 Helvetica(도면 글자는 `dxf.toAscii` 로 ASCII — × → x, · → . 등, 예전 '?' 깨짐 수정). 명령 '도면 PDF'(계산서 단어가 있으면 계산서). 시작 화면 설계기준 드롭다운만 프로필 `selectLabelKey`(간체 CN = `GB 51022-2015 门式刚架轻型房屋钢结构技术规范`). 물량 산출서 CSV·XLSX: 행은 `report/quantitySheet.ts`(순수, 두 형식 공통), XLSX 는 `report/xlsx.ts` 최소 OOXML 작성기(jszip, 외부 엑셀 라이브러리 없음 — 숫자 칸·제목/머리 굵게), 명령 '엑셀/xlsx'. BASE URL 은 드롭다운(`baseUrlOptions` — 언어 기본 서버 먼저 + 직접 입력, v2.4.2).

### v0.12.0 보완

- PDF는 `actions/outputs.ts`의 `downloadReportPdf()` → `report/pdf.ts`로 직접 파일을 생성한다. pdfmake/pdf-lib는 지연 로딩하며 보고서 데이터는 서버로 전송하지 않는다. 글꼴은 계산서 언어별 축소본 `public/fonts/report-{kr,tc,sc}.otf`(Noto Sans CJK OFL, 앱 소스 글자 2034자만, 각 ~0.8 MB — 원본 16 MB) 중 하나만 로드: 번체 TC·간체 SC·그 밖 KR(한자 자형이 지역별로 다름). 문구에 새 글자가 생기면 `python scripts/subset-fonts.py <원본 OTF 폴더>` 재실행 — `verify-pdf.ts` 가 계산서 글자가 글꼴에 모두 있는지 확인(없으면 실패). 표·SVG를 벡터로 저장하고 넓은 표는 식별열을 반복해 분리한다. 실제 PDF의 페이지 수·크기를 확인한 뒤 다운로드 시작을 알린다. 취소 시 PDF 생성 완료 후 파일 다운로드를 중단한다.
- 새 TW/CN 접합 결과의 `parts`에 판재 치수·수량과 볼트/앵커 치수를 숫자로 전달한다. `quantities.ts`는 이를 사용하고 구형 결과만 문자열 파서로 복원한다. 전단키와 소수 치수 스티프너를 포함하며 추정 치수 표시는 유지한다.
- 설정은 네이티브 `dialog.showModal()`로 표시한다. 닫힌 대화상자는 접근성 트리에서 제외되고 배경은 inert가 된다. 최초 포커스, Tab 순환, Esc 및 열기 버튼으로 포커스 복귀를 처리한다. 접힌 가이드는 inert/aria-hidden이다.
- 검증: `scripts/verify-quantities.ts`, `scripts/verify-pdf.ts`(4개 언어 PDF를 `output/pdf/`에 생성). 생성 PDF와 PNG는 Git에서 제외한다.
- PDF: `printReport()` — 숨긴 iframe(srcdoc)에 계산서를 넣고 바로 인쇄 창(대상 'PDF로 저장'). 새 창이 아니라 팝업 차단과 무관, 벡터·글자 선택 유지, 문서 제목 = `steel_report_<날짜>` → 파일명. 계산서 `@page A4`. 서버 PDF 엔진은 쓰지 않음(사용자 결정). 'HTML 열기'(새 창) 는 보조.
- 물량 `src/domain/quantities.ts`(순수): 부재(schedule) + 접합 판재(dims 문자열 'PL B×N×t'·'n-M d'·'2-PL b×t'·더블러) × 개소(주각·처마 = 2×골조, 마루 = 골조, 가새 = 요소×2) + 볼트·앵커 + 용접(추정: 플랜지 CJP 2bf + 웨브 필렛 2h) + 도장 면적(H 외곽 둘레, CC 양면, P 외면) + 로스(가정 부재 5%·판 10%) → 발주 중량. 추정(*) = 스티프너·더블러·거셋 크기, 용접. 계산서 9장 표 + `downloadQuantities()` CSV(UTF-8 BOM). 명령 `계산서 PDF`·`물량`, 결과 탭 버튼.
- 대만 샘플(라이브 결과): 부재 42.58 t + 판재 3.50 t = 순 46.08 t, 발주 48.56 t, 도장 1527 m², 볼트 M24 앵커 112·M27 112·M20 120.

## 작업 진행·취소·중복 실행·전송 확인 (2026-10-15, 평가 보고서 D단계, 라이브 검증)

### 결과·백업·하중 무결성 보완 (v0.11.2)

- `domain/resultValidation.ts`: TW/CN의 부재·모든 조합·5개 검토 위치·가새·층 안정 입력·사용성 변위 및 유한 수치 검증. 누락은 `ResultValidationError`로 검토 중단. 원시 표는 위치 라벨(I/J 포함)로 정렬하고 중복을 거부한다. 후보 단면 검토는 해당 역할의 부재력을 검증한다.
- `save.ts`: HTTP 성공과 정확한 `MIDAS GEN NX command complete` 응답을 확인해야 다음 단계로 진행한다. 저장 실패·알 수 없는 응답은 중단하며 취소는 그대로 전달한다. 백업 실패 시 `doc/new`를 호출하지 않는다.
- 전송 후 11개 DB(MATL/SECT/NODE/ELEM/FRLS/CONS/STLD/LCOM-GEN/BODF/BMLD/CNLD)의 개수·대상 ID를 확인한다. 하중은 보낸 필드를 수치 허용오차 1e-9로 비교한다. ITEMS는 ID로 대응하며 Gen이 추가한 기본 필드·배열 순서 변경은 허용한다. 응답 형식을 확인할 수 없으면 실패한다. **비교기는 `domain/genSync`(diff·dbDifferences) 하나** — 전송 확인(11개 DB 전 필드)과 Gen 동일성 검사(13개)가 같은 규칙(허용오차·ELEM NODE 0 채움·ITEMS ID 대응·중복 ID 거부). 라이브 2026-10-16 TW(최적화 재전송 포함)·CN 통과.
- 재해석·재검토·최적화 시작 시 이전 설계·접합·최적화 결과를 비운다. 검토 결과가 없는 계산서는 통과 등급을 표시하지 않는다.
- 오프라인: `node --import tsx scripts/verify-results.ts`(TW/CN 누락·오염·순서·중복 및 이전 결과 제거), `scripts/verify-job.ts`(백업 실패와 하중 변조 포함). 기존 `verify-tw.ts`, `verify-cn.ts`와 함께 실행한다.
- `src/actions/job.ts`: `beginJob`(busy 동기 검사 — 연속 클릭도 거부)/`endJob`, `stage(키, 예상 호출 수)`, 최적화 `setIter`. `mapi()` 가 호출 직전 `jobCall` → step++·detail, 취소 플래그면 **보내기 전에** `Cancelled`. Gen 이 처리 중인 호출(해석)은 중단 API 가 없어 끝까지 기다린다. 메시지 `failMsg` — 모델이 중간 상태면 다시 생성 안내.
- 화면 `JobBar`(입력창 위): 단계·n/N 막대(호출 수 모르면 불확정 막대)·경과 초·현재 호출·[취소]. 작업 중 결과 탭 출력 버튼·MAPI 드로어 입력 잠금, 채팅 명령 중 Gen·결과 사용 명령 거부(`BUSY_BLOCKED`), 새로고침 경고.
- `sendModel`: `doc/new` 직후 이전 결과(`S.built` 등) 비움 — 중간 실패·취소 때 이전 모델로 해석·검토하지 않게. 전송 뒤 `MATL·SECT·NODE·ELEM·FRLS·CONS·STLD·LCOM-GEN` GET 개수 = 보낸 개수 확인(다르면 실패, 응답 형식이 다르면 경고만). 라이브: 8개 일치, 생성 6.9 s.
- 오프라인 회귀 `node --import tsx scripts/verify-job.ts`(가짜 Gen = fetch 대체): 정상·개수 불일치·전송 중 취소·해석 중 취소·중복 실행 10항목.

## 대만 회귀·손계산 대조 (2026-10-15, 평가 보고서 E단계)
- `node --import tsx scripts/verify-tw.ts` (Gen·키 불필요, 479 검사): ① 손계산 55 — 원문 식을 SI 로 따로 계산해 앱(tf·cm 내부)과 대조 + 고정점(RH400x200 A 8192·Zx·φMp 271.98·φVn 406.08·φPn ≈ 700, 8.2-1a/b, Cb 1.136/1.667, K(1,1) 1.32, B2, F10T M22 209.7/111.8·표10.3-3, 앵커 M24, 필릿, 지압 상한, SaD·Fu·(SaD/Fu)m·V/W, q(z)·표2.4·2.5) ② 하중 평형 — LR 합 = q·B·L, EX/EY 절점하중 합 = V, 케이스 15·조합 55 ③ **기준 모델 정답 세트** `scripts/fixtures/tw-sample.json.gz`(라이브 Gen 결과 1.2 MB) → 설계·접합 재계산, 부재 410개 강도비·지배 조합·식, 사용성, 접합 치수·항목별 비 대조 + Gen 반력 합 = 손계산.
- 설계식을 **의도적으로** 바꾸면 `verify-tw.ts --update`(정답만 갱신, Gen 결과 유지). `DEFAULT_SPEC`·형상·하중을 바꾸면 Gen 결과가 달라지므로 `printf '<key>
' | node --import tsx scripts/capture-tw-golden.ts` 로 다시 캡처(키는 stdin). 형식은 `scripts/tw-golden.ts`.
- 손계산으로 찾은 것: 단위 상수 `MPA_TFCM2 = 0.0101972`(반올림) → `1/98.0665` — 강도가 +4e-6 과대(실무 영향 없음, 지배 조합·접합 치수 변화 없음). 변이 시험(전단 0.6→0.61)으로 회귀가 잡는 것 확인.

## 입력 검증·최적화 접합 판정 (2026-10-15, 재평가 11.4 의 2·3)
- 스펙 입력 칸 정의·검증은 `src/components/planFields.ts`(순수): `invalidFields(spec, vals, free)` 를 **기본 모델링·자유골조 공통** 적용 — 빈 값·음수·비숫자·정수 칸 소수·베이 목록(`listError`)·선택값·단면명. 잘못된 칸이 있으면 두 모드 모두 실행 불가(자유골조는 오류를 바로 표시 + [실행] 비활성). **칸 사이 충돌** `fieldConflicts`: 치수 한계(스팬 ≤ 60·처마 ≤ 18·경사 ≤ 1 — `scope.ts` `LIMITS` 공유)와 간격 과대(경사 길이·처마 높이·스팬 ÷ 간격 < 1.5 면 퍼린·거트·풍주가 하나도 안 들어감 → 최대 간격 안내)를 그 칸의 오류로 — 위저드는 해당 단계에서 막고 첫 오류 칸으로 포커스. `toSpec` 의 기존 값 대체는 미리보기용일 뿐 전송되지 않는다. 회귀 `scripts/verify-input.ts`(80).
- 최적화: 반복마다 접합부 산정(`OptIter.connMax·connNg·plateT`), 최종안 `pickBest`(domain/optimize, TW·CN 공통) = 부재·사용성·접합 NG 0 중 (부재 + 접합 판재) 최경량, 유효안이 없으면 NG 최소안을 남기고 `opt.ok = false` + 경고 문구. 결과 탭 반복 표에 접합 최대비. 회귀 `scripts/verify-opt.ts`. **Gen 라이브 미재검증.**

## Gen 모델 변경 감지·작업 흐름·품질 게이트 (2026-10-15, 재평가 11.4 의 1·5·6 — F4·F5·F7, 라이브 검증)
- **F4 Gen 동일성**: `sendModel` 이 보낸 페이로드를 `S.built.sent` 에 보관 → 해석·설계 검토·최적화 직전 `assertGenSync()`(actions/genSync) 가 13개 DB 를 GET 해 `domain/genSync` 로 비교. 보낸 필드만 같은 값인지 보고 Gen 이 붙이는 필드는 무시(라이브 형식 차이: ELEM NODE 8칸 0 채움·STYPE). 다르면 `GenChangedError` → 실행 중단 + 차이 목록(요소 단면·재료는 이름 포함, 예: `ELEM 1 SECT: 1 (RH600x200x11x17) → 2 (RH298x149x5.5x8)`). 자동 재생성은 하지 않음(Gen 수정이 지워지므로 사용자가 선택). 라이브: 확인 ≈ 0.8~1.7 s, Gen 에서 요소 단면 변경 → 해석·검토·최적화 모두 차단, 되돌리면 통과. 회귀 `verify-sync.ts`(21). 감지 후에도 해석·검토·최적화 버튼은 막지 않는다(`taskFlow.unavailable` — 각 작업 첫 단계가 다시 비교하므로 Gen 에서 되돌리면 통과·건수 0). 산출물만 `wf_stale_gen` 으로 막음.
- **F5 작업 흐름**: `state/workflow.ts`(순수) 모델 → 해석 → 설계 검토 → 출력 단계 상태 + 다음 할 일, `Workflow.tsx` 띠(입력창 위, 다음 버튼·최적화 보조). `S.genChanged`(감지 건수)·입력 카드 스펙 ≠ Gen 에 보낸 스펙(`specChanged`, 키 순서 무관)이면 이후 단계 '이전 결과' + 결과 탭 `StaleBanner`. 실패·취소(`S.lastFail`, failMsg 가 기록·beginJob 이 비움)면 해당 단계 실패 + [다시 시도]. 회귀 `verify-workflow.ts`(14). ※ v0.18 이후 흐름 띠·`workflow()` 는 제거 — 단계 상태·버튼 규칙은 `state/taskFlow.ts`(`unavailable`·`taskStatus`, 회귀 verify-task-flow), `specChanged` 도 거기.
- **F7 품질 게이트**: `npm run verify`(scripts/verify-all.mjs) — 오프라인 회귀 11종(~25 s, Gen·키 불필요). **커밋 전에 실행.** 중국 기준 모델 `fixtures/cn-sample.json.gz`(라이브 1.1 MB, 최대 0.920 NG 0) → `verify-golden.ts`(418, Gen 반력 = LR·SN·EX·EY 손계산 포함). 캡처 `capture-tw-golden.ts --code CN`. 변이 시험(좌굴곡선 b 계수)으로 검출 확인.
- 라이브 최적화(2026-10-15): 반복마다 접합 기록 — 1회 46.96 t·판재 3.52·접합 0.988 / 2회 42.58 t·3.50·0.941, ok = true.

## 브라우저 전용 오류·채팅 다국어·3D 뷰 (2026-10-15)
- **큰 배열 펼치기 금지**: `push(...arr)`·`Math.max(...arr)` 를 결과 표(TW BEAMFORCE 410×55×5 ≈ 11만 행)에 쓰면 크롬에서 'Maximum call stack size exceeded'(Node 기본 스택은 통과 → 늦게 발견). `results.ts` 는 행 단위 push. `npm run verify` 는 `--stack-size=500`(브라우저 수준)으로 실행해 재발을 잡는다.
- **결과 행 검증은 Set 조회**(배열 includes 금지 — 11만 행 × 410 요소). `validateDesignResults` 는 전체 검증을 통과한 결과 객체를 모델 형태(조합 + 요소 ID·역할)와 함께 기억(WeakMap) → 최적화 후보마다 다시 훑지 않음. 결과 객체는 회수 뒤 바꾸지 않는다.
- **실패 문구 다국어**: `ResultValidationError(table, issue, where)`·`QuantityError(where)` 는 식별자만 담고 `job.failText` 가 `rv_*`·`q_invalid` 로 번역. Gen 응답 불명은 `gen_bad_response`. 새 오류에 영어 문장 하드코딩 금지.
- **채팅 메시지 다국어**: 앱 메시지는 `addMsg('bot', lt(key, …args))`/`ltc(code, key, …)` — 키와 그 시점 인자만 저장, 그릴 때 현재 언어로(`render`). 언어를 바꾸면 지난 메시지도 바뀜. 다른 번역문이 섞인 메시지(상태 요약 포함 등)는 문자열 그대로(만든 언어 유지). 테스트는 `msgText(m)`.
- **3D 뷰**(story 정리 방식): Plotly 아이콘 도구 막대(이미지·확대·이동·회전·홈)는 story 처럼 오른쪽 위 가로·투명, 우리 막대에는 아이콘에 없는 ＋/－(원근 = 카메라 거리, 정투영 = 축 비율). **범례 = 표시 토글 한 줄**(기둥·지붕보·퍼린·거트·스트럿·풍주·가새·지점·절점, 색 견본 선·마름모·점) — Plotly 범례는 강도비 보기의 색 구간에만. 절점은 번호·좌표 hover. 생성 직후 Gen 화면을 `POST /view/ANGLE {HORIZONTAL:30,VERTICAL:15}` 로 ISO + `POST /view/CAPTURE {ZOOM_LEVEL:100}`(작은 PNG) 로 전체 맞춤 — ANGLE 은 확대를 바꾸지 않아 doc/new 직후 원점 근처가 크게 확대된 채 남음, 맞춤 전용 API 없음, view/ACTIVE All·doc/open 재열기는 효과 없음(라이브 2026-10-19, Gen 창 캡처로 확인). 웹 3D 도 생성 직후 3D 탭·ISO·카메라 재맞춤(`S.camReset`). 실패해도 생성은 성공. **해석 직후 후처리 모드**: `showReactionsInGen()`(actions/analysis) = `POST /view/RESULTGRAPHIC {CURRENT_MODE:'reactionforces/moments', LOAD_CASE_COMB:{TYPE:'CB',NAME:<첫 기본 조합>}, COMPONENTS:{COMP:'FZ'}, TYPE_OF_DISPLAY:{VALUES:{OPT_CHECK:true}}}` — Gen 이 후처리 모드로 바뀌고 반력 값 표시, [반력 확인] 버튼도 같은 호출 + 결과 탭. 후처리 모드에서도 post/TABLE 회수·설계 검토 정상(라이브 2026-10-19), **[선 | 단면]** — `drawing/solid.ts` 가 실제 단면 치수로 입체 메시(H 3상자·립 C 5상자·강관 12각, 춤 방향: 골조면·연직·지붕 법선·벽 법선 — 그리기용 근사). 정투영은 시선 방향 축 숨김 + 보이는 두 축으로 채움. `uirevision` 으로 토글 시 사용자 시점 유지. Tailwind preflight `svg{display:block}` 이 Plotly 아이콘을 세로로 쌓던 것·채팅 `.modebar` 클래스 충돌(`.composer .modebar` 로 한정) 수정. 회귀 `verify-solid.ts`.

## shadcn UI 권고 반영 (2026-10-15, docs/archive/2026-10-19/smart-midas-steel-shadcn-ui-recommendations.md — 라이브·실화면 확인)
- **Gen 모델 교체 확인·복원** (P0): [공장 생성] 전 `confirmAction`(components/ConfirmDialog — 네이티브 `<dialog>` alertdialog, 포커스 복귀, '이번 세션에서 다시 묻지 않기'). 열린 문서는 `autoSave('backup')`(경로 반환) → `doc/new` 직후 `S.restorePoint`(`sendModel` onReplaced — 이후 전송 실패·취소에도 실패 카드에서 복원). 해석은 자동 저장 성공 **뒤에** 이전 결과를 비운다. 산출물은 모델만 있으면 가능(계산서 부분판·도면/물량 부재만). 흐름 띠 [이전 모델로 복원] = `restoreBackup()`: 현재 문서 sms_model_* 저장 → `POST /doc/open {Argument: 경로}`(라이브: 응답 'MIDAS GEN NX command complete', 절점 219 → 165 로 복귀) → 앱 모델·결과 비움. 화면 없는 실행은 `setConfirmHandler(() => true)`(verify-job·results·라이브 스크립트).
- **작업 단계 목록**: `state/jobSteps.ts`(순수) — 진행 막대 아래 ✓ ● ○ (생성: 백업 → 새 문서 → 재료·단면 → 절점·요소·지점 → 하중·조합 → 전송 확인, MAPI 경로로 판정) + [로그 보기].
- **결과 탭**: `SummaryCards`(강재량·최대 강도비·NG·최적화 절감) + `MemberTable`(부재 전체 Data Table: 종류·NG 만·0.9 이상 필터, 검색, 열 정렬 aria-sort, 50행씩, CSV BOM) — 기존 NG 상위 30 표 대체. 접합부 **보강 후 만족** 문장: 최종 검토비 + 원래 최대 항목 검토비 + 보강 내용(예: 처마 0.988 ← 기둥 플랜지 휨 3.021, 스티프너·더블러).
- 남은 권고: 계산 근거 Sheet(입력 칸별 조항·출처), 베이별 예외 프레임 표, Gen 부재 선택 연동, Toast, 프리셋·최근 프로젝트(F6 보류와 연관).

## 횡단면 형식 (2026-10-16, docs/archive/2026-10-19/taiwan_china_factory_steel_cross_section_wizard.md — KDS 41 12 00 도 같은 구조 확인)
- **공통 횡단면 기술** `portalGeometry`: `eaveXs`(바깥 기둥 열)·`ridges`·`planes`(지붕면, `rising`)·`roofTrib(x)`(절점이 분담하는 면·폭)·`eaveSide`·`isEaveNode`·`isRidgeNode`·`deflXs`/`isDeflNode`(지붕 처짐 확인점)·`girtZsAt`/`gWallAt`(벽별 거트)·`endGirtZs`/`gEnd`(박공벽)·`rafterLen`·`hMean`·`symmetric`. 하중·설계·접합·도면은 `x === 0 / span / span/2` 대신 이것을 쓴다. 리팩터는 출력 스냅샷(TW·CN × 기본·템플릿·불균등 베이·고정·급경사 + 정답 세트 설계·접합·DXF·3D 메시)으로 **박공 결과 완전 동일** 확인.
- **편경사** `spec.frame = 'mono'`(없으면 박공): x = 0 낮은 처마, x = 스팬 높은 처마(처마 + 스팬 × 경사). 지붕면 1·마루 없음 → 마루 접합 없음, 지붕 처짐은 경간 중앙 절점, 지붕 가새는 중앙에서 2패널, 기둥 K·KL 은 열별 높이, 박공 프레임 기둥에 박공벽 거트 높이 절점(없으면 거트 끝이 떠서 불안정 — 라이브에서 강도비 13,895 로 발견, `verify-frames` 연결성 검사). TW: 비대칭이라 X 풍 반대 방향 WX5~8, 지진 (±E, ∓ET)·WLY ± 조합 추가(케이스 19·조합 103), θ<10° 의 h 는 평균 지붕 높이, 지붕 Cp 는 면 단위 풍상/풍하(表2.5, ASCE 7 단경사 주석 준용) → 적용범위 경고 `monoTW`(전문가 검토). CN: GB 50009 표 8.3.1 제5항(낮은 쪽 풍상 = 제2항, 높은 쪽 풍상 −0.5)이 면 단위 규칙과 일치, 적설 표 7.2.1 제1항 균일만. 높은 처마 > 18 m 는 block(`eaveHigh`)·입력 충돌(경사 칸).
- 라이브(2026-10-16): TW 편경사 절점 253·요소 468, 반력 평형 0.000%, 기본 단면 NG 3(높은 쪽 풍주) → 최적화 NG 0 최대 0.920(풍주 RH346). CN 편경사 평형 0.001%, 최대 0.964 NG 0, 마루 접합 없음. TW 박공 재확인 0.912 동일. 라이브 스크립트 `--frame mono`, 반력 평형(보낸 하중 + Gen 반력, D 제외) 출력.
- **다경간 박공** `spec.frame = 'multi'` + `spanList`(경간 폭, `normalizeSpans` → span = 합계, `frameSpans`): 형상은 `multiGeometry`(경간마다 쌍坡, 골 = 내부 기둥 열·높이 처마). 내부 기둥 = **흔들림 기둥**(사용자 결정 2026-10-16: 핀) — `Element.lean`, Gen FRLS 상단 J 핀 + CONS 기초 핀(`1110000`), 설계 면내 K = 1. 지붕보 골에서 연속, 골 줄 = 스트럿. 마루 접합은 마루마다, 주각 개수 = 기둥 열 수(물량). 스팬 한계 60 m 는 경간마다. TW 풍: **表2.8 鋸齒狀屋頂 면 순서 계수**(풍상부터 D 表2.5 풍상 · E·D′ 表2.5 풍하 · E′·D″ −0.5 · E″·D‴ −0.4 · 이후 −0.3, `loads.ts facePos/SAW_CP`) — 다경간 쌍경사에 준용(경고 `multiTW`). 박공은 D·E = 表2.5 그대로(결과 동일), 편경사 높은 쪽 풍은 E 부터. ※ 처음엔 '첫 면만 풍상'으로 구현했다가 사용자 지적으로 정정(2026-10-16) — KB `TW/knowledge/wind-load-2014` 에 表2.8 있음, 표 제목이 톱니형이라 놓쳤음. **크레인을 받는 기둥은 흔들림 기둥 금지**(강접) — 현재 크레인은 적용범위에서 전부 막음, 지원 시 이 규칙 유지(scope.ts·verify-frames). CN 풍: GB 50009 표 8.3.1 제8항(첫 경간 풍하면 −0.5, 이후 −0.4, 풍하벽 −0.4). CN 적설: 7.2.2-3 골조 = 균일, 25° 초과 다경간은 골 적설(제7항 최대 2.0) 미반영이라 block `multiSnowCN`. 공통 경고 `multi`(내부 기둥 상단 핀 접합·골 거터 상세는 범위 밖). 경간이 비대칭이면 편경사처럼 반대 방향 풍 케이스. 기존 '다경간' 적용범위 체크는 형식이 multi 면 막지 않음.
- 라이브(2026-10-16, 24 + 24 m): TW 절점 376·요소 703, 평형 0.000%, 최대 0.987 NG 0(흔들림 기둥 0.958 = KL/r, 내부 기둥 약축 비지지 8 m). CN 평형 0.000%, 기본 단면 NG 2 → 최적화 2회 NG 0 최대 0.920(접합 0.999). 회귀 `verify-frames.ts`(84: 편경사·다경간 형상·해제·지점·평형·풍·적설·적용범위·물량·입력).

## 단면 자동 최적화 (2026-10-15, 라이브 검증)
명령 `단면 최적화` (설계 검토 다음). 반복: 결과 회수 → 검토 → `proposeSections` → `sendModel`(재전송) → `analyzeCore`(재해석), 최대 5회.
- 후보 `src/domain/catalog.ts` = 설치본 `Dbase/CNS2020.sdb` 에서 추출한 이름 그대로(RH 150·CC 45·P 60~318.5 40개). 단면적 오름차순, 목표 강도비 0.95, H 세장 단면 제외.
- 2차부재(퍼린·거트·스트럿·풍주·가새)는 핀 → 부재력이 자기 단면과 무관 → 한 번에 확정. 퍼린 처짐 L/360, 가새는 종방향 변위 ∝ 1/A 로 함께 제한.
- 골조: 강도 통과 기둥 × 지붕보 쌍 중 추정 사용성(문형 라멘 횡강성 Chopra 1.3·단부 고정도 처짐식으로 현재 해석값 환산) ≤ 0.95 인 최소 강재량.
- 진동 방지(`OptControl`): 재해석 강도 NG 단면 이하 면적 금지(floors), 사용성 NG 골조 쌍 이하 금지(bans), 실제/추정 강도비로 증폭 학습(amp) → 현재보다 가벼운 후보에만 목표 target/amp.
- **라이브(샘플)**: 2회 해석으로 수렴, 38 s. 45.99 t → 41.61 t (−9.5%): 기둥·지붕보 RH600x200x11x17 → RH596x199x10x15(추정 0.93 → 재해석 0.914, 재분배 작음), 스트럿 → RH194x150x6x9, 가새 → P114.3x3.2. 새 단면명 Gen 수용(오류 0). 최대비 0.914 NG 0, 접합부 재산정 OK(주각 0.97·처마 0.97·마루 0.94).
- 종료: 수렴 / 이미 거친 조합 / 최대 반복. 최종 = 거친 상태 중 NG 0 최경량(현재가 아니면 재전송·재해석). 이후 접합부 재산정, `S.lastSpec` 갱신, 결과 탭·계산서 9장에 변경 전후 표.

## 대만 규범 보완 (2026-10-15, 라이브 검증) — Gen API 로 되는 것 / 웹에서 하는 것
1. **내진 13장** — Gen: `LCOM-GEN` 에 E′ 조합(13.3-1/2, E′ = 1.4·min(Fu,2.5)·E, 방향별 Ω)·중력 조합(13.6.1 1.2D+0.5L) 추가 → 31 조합 수용. 웹: 조합 용도 `info.comboKind`(basic/amplified/gravity) — 일반 부재 검토는 basic 만, 가새 부재·접합 13.8.4 / 주각 13.4.5(보수적으로 P·M·V 전부) 는 E′ 포함, 기둥 13.4.1 축력(Pu/φPn ≤ 0.4 면제), 처마 접합 13.7.2→13.6.1 용량 설계(Mu = 지붕보 Mp, Vu = V(1.2D+0.5L) + 2Mp/Lh ≤ V(13.3-1), θp,req = min(0.01, 1.1(R−1)θE), 공급 회전각은 시험 근거 필요 메모). 샘플 Ω X 3.00·Y 2.14, 처마 8-M27·PL28 + 스티프너 + 더블러 12.
2. **풍 2.10~2.12** — Gen: 케이스 WLX·WLY(횡풍향 0.87(L/B)W_D, 거트 선하중)·WT(비틀림 0.28·max(B·W_D), 측벽 처마 스트럿 ±Y 우력). 조합 = 순풍향 단독 + 0.841·W_D + 0.7(W_L ± W_T) (대칭 → 두 변형). 웹: W_D = 순풍향 케이스 수평 합력, 4.2 변위각도 같은 조합. 샘플 W_D,X 251 / W_L,X 146 / M_T 2535 kN·m.
3. **국부 풍압·냉간성형** — 웹만 (Gen 설계 API 는 KDS 만). `codes/twWindCC.ts`(그림 3.1 = ASCE 7-02 × 2.083, KB 전사값과 일치, 受風面積 L·max(s, L/3), 구역 폭 a, θ ≤ 10° 벽 0.9) → `domain/secondary.ts`(단순보 C&C 조합). `codes/twColdFormed.ts` = AISI S100 유효폭법(B2~B4, C3.1·C3.2·C3.3·C4·C5) — **대만 冷軋型鋼 규범 원문이 KB 에 없어 미대조**. 부압 시 자유 플랜지 LTB(새그로드 간격).
4. **보완** — 표2-1(327)·표2-6(b)·臺北盆地 → `codes/twSites.ts`(자동 생성, 縣市 병합 셀은 공식 鄉鎮 수로 배정·불일치 0), 표2-4 Fa·Fv, 스펙 `seismic.county/town/soil/SMS/SM1`, 근단층(2.4)은 경고만. V_M(2.10.2) 하한·대북분지 Ra(2-11)·V*(2-13b) → 샘플은 **V_M 지배**(X 0.221 > 0.200). 우발 비틀림 2.14 ETX·ETY(0.05·B⊥·V, 스트럿 우력, E 와 같은 부호 조합, 2.16.1 변위에 포함). 두께별 Fy `fyAt`(CNS 통상값, 원문 미대조) — 주각 PL45 → PL50.
- 라이브 결과(샘플): 조합 55·케이스 15, 기존 단면 NG 83(거트 C&C 1.23·풍주 1.17) → 최적화 2회 42.58 t NG 0 → 기본 단면 갱신(거트 CC200x75x20/3.2, 풍주 RH298x149x5.5x8).

## 배포·도메인
**https://steel.midasapi.space** (Vercel 프로젝트 `smart-midas-steel`, repo `Dennis5882/smart-midas-steel` `main` → 자동 배포). 2026-10-15: Cloudflare **DNS only** CNAME `steel` → `9dfc409e370e822e.vercel-dns-017.com` (프록시 켜면 Vercel 인증서 발급 실패 — rebar 와 같은 규칙), `smart-midas-steel.vercel.app` 은 308 → 커스텀 도메인 (Vercel 도메인 설정 `redirect`).

**언어별 공유 링크** (story 와 같은 방식): 빌드 시 `vite.config.ts` langPages 가 `dist/{ko,en,zh-TW,zh-CN}/index.html`(+ 소문자 경로) 생성 — `<title>`·og 메타 = 사전 `meta_title`/`meta_desc`(메신저 미리보기는 JS 미실행이라 정적 메타 필수), 루트 `/` = ko. 시작 언어: 링크 경로·`?lang=` > 저장값(`sms_lang`) > 브라우저. 언어를 바꾸면 주소도 `/<lang>/`(루트에서 ko 는 `/` 유지, `?lang=` 은 경로로 옮김, 해시 보존) — `src/i18n/index.ts` `langUrl`·`syncUrl`. GUIDE 기타 `링크 복사` = 현재 언어 링크를 클립보드로.

## 버전·릴리즈 노트 (사용자 규칙, 2026-10-15 — rebar-repair 와 같은 방식)
**최신 사용자 선호(2026-10-19)**: 버전을 빠르게 올리지 않는다. 일반 개선·수정은 patch로 올리고, minor 변경은 먼저 사용자와 상의한다. 이번 크레인 구간 및 화면 개선은 v2.3.4로 묶는다. 아래 기존 minor 자동 증가 규칙보다 이 선호가 우선한다.

**사용자에게 보이는 변경을 푸시할 때마다 버전을 올리고, 그 버전의 릴리즈 노트를 같은 커밋에 넣는다 — 묻지 않고 자동으로.** 커밋 전에 `npm run release -- minor`(새 기능) 또는 `patch`(수정·문구·사용자에게 보이는 문서), `major` 는 사용자가 말할 때만. **자릿수 올림(2026-10-16)**: minor·patch 는 0~9, 10 이 되면 스크립트가 자동으로 윗자리로(0.9.x minor → 1.0.0, 1.2.9 patch → 1.3.0). 2026-10-16 v0.19.x → **v1.0.0**(사용자 요청 major). 스크립트(`scripts/release.mjs`)가 `package.json`(+ lock) version 을 올리고 `src/data/releases.json` 맨 앞에 `{version,date,id,items}` 추가(**date = KST 'YYYY-MM-DD HH:mm' 날짜 + 시각**, 사용자 규칙 2026-10-16 — 이전 항목은 git 커밋 시각으로 소급, release-check 가 형식 검사), 네 사전(`src/i18n/dict/*.ts`)의 `@release-notes` 앵커 아래에 빈 키 `rn_<id>_1..N` 을 넣는다 → 노트를 ko 먼저, en·zh-TW·zh-CN 순으로 사용자 언어로 한 줄씩 채운다(항목 수는 `--items N`). `release-check`(= `npm run build` 첫 단계, Vercel 빌드에도 적용)는 package.json version ≠ 최신 항목이거나 노트가 하나라도 비면 실패 — **version·키를 손으로 고치지 말 것**. 내부 변경(테스트·리팩터·CLAUDE.md)만이면 버전업 불필요. 화면: 하단 바 `v{APP_VERSION}`(vite define, package.json 단일 출처) 클릭·GUIDE 도움말·명령 `릴리즈 노트` → `ReleaseNotes.tsx`(`.rn` 모달, `S.rnOpen`). 0.1.0~0.5.0 은 기존 커밋에 소급 번호(모두 2026-10-15).

## 명령
`npm run dev`(프론트) + `npm run dev:api`(백엔드, vercel CLI 필요) / `npm run build`(= release-check + `tsc -b` + `vite build`) / `npm run typecheck` / `npm run release -- patch|minor|major [--items N]`

## 보안·커밋 규칙
1. **MAPI-Key는 코드/커밋에 포함 금지**. 앱에서는 메모리(state)에만 보관. 라이브 스크립트용으로는 저장소 루트 **`.env` 의 `MAPI_KEY=`** 에 저장 허용(사용자 결정 2026-10-16, `.env*` gitignore) — `scripts/mapi-key.ts` 가 stdin → 환경변수 `MAPI_KEY` → `.env` 순으로 읽는다. 키를 출력·명령 인자·다른 파일에 넣지 않는다. 커밋 전 staged diff 키 검사는 그대로.
2. 커밋/푸시는 사용자가 명시적으로 요청할 때만.
