# Gen NX MAPI 주의사항 — 앱 공통

스틸구조물 Agent의 단계 0 라이브 시험(2026-10-19, Gen NX 2026 로컬, kN·m)에서 확인한 동작이다. 같은 Gen을 쓰는 공장 앱(smart-midas-steel)과 RC 앱(story)에도 해당한다.
시험 과정과 증거는 [gate-0-report.md](gate-0-report.md)와 [scripts/gate/](../scripts/gate/)에 있다.

> Gen을 업데이트한 뒤에는 4번(고유치 표)과 5번(GB50017-17 재료)을 다시 확인한다. 빌드에 따라 달라지는 항목이다.

## 요약

| # | 주의사항 | 심각도 | 공장 앱 | RC 앱(story) |
| --- | --- | --- | --- | --- |
| 1 | `DELETE` 본문의 `Assign` 번호는 무시되고 DB 전체가 지워짐 | 높음(모델 손상) | 사용 없음 | `lcom-gen`·`SSEIS` 전체 삭제 — 의도와 일치 |
| 2 | `post/STEELCODECHECK`가 설계 결과 없이 호출되면 Gen 모달 창 → API 전체 멈춤 | 높음(세션 정지) | `scripts/live-kr.ts --gen-check`에서 사용 | 사용 없음 |
| 3 | 해석 후 DB를 바꾸면 결과가 무효화됨 | 중간 | 확인 필요 | 확인 필요 |
| 4 | `EIGENVALUEMODE` 표가 **간헐적으로** `Unknown Error` | 중간(재시도·대체 필요) | 사용 없음 | **영향 있음** — 주기·검토 지표 4곳 |
| 5 | `GB50017-17(S)` DB 재료 PUT 전부 거부 | 중간 | CN은 `GB03(S)`라 영향 없음 | 해당 없음 |

## 1. DELETE는 번호를 URL에 넣는다

```
DELETE /db/MATL  { "Assign": { "9": {} } }   → 재료 전체 삭제 (번호 무시)
DELETE /db/MATL/9                            → 재료 9만 삭제
```
- MATL·ELEM에서 확인했다. story에서 확인된 `lcom-gen`과 같은 동작이다(2026-10-12).
- 실제 사례: 시험 재료 하나를 지우려다 재료가 전부 지워졌다. 가새만 지우려던 호출로는 기둥·보까지 324개 요소가 모두 지워졌다. 이후 해석은 "Material has not been defined", "Analysis is not allowed"로 실패했다.
- **규칙**: 일부만 지울 때는 반드시 `DELETE /db/<DB>/<id>`를 쓴다. 본문을 넣은 DELETE는 DB 전체를 비우려는 경우에만 쓴다.

## 2. 모달 창을 띄우는 호출은 API를 멈춘다

- `POST /post/STEELCODECHECK {Argument:{}}`를 강재 설계 결과가 없는 상태(GB50017-17처럼 API 설계가 없는 코드)에서 호출했다.
  - HTTP는 빈 메시지로 끝난다.
  - Gen에는 `Error Checking Result : No Load Combination exists for Checking.` 창이 남는다.
  - 이후 모든 요청은 응답 없이 대기한다.
- 창을 닫으면 대기 중이던 요청이 그대로 이어진다.
- 창을 닫는 방법:
  - 창 제목이 `midas Gen NX`인 작은 창(메인 창과 별도)이다.
  - `PostMessage(WM_CLOSE)`로 닫혔다. `SendMessage(BM_CLICK)`와 `WM_COMMAND IDOK`는 듣지 않았다.
  - 직접 '확인'을 눌러도 된다.
- 기존에 알려진 같은 유형: 저장 안 된 문서로 `doc/new`나 `doc/anal`을 하면 저장 확인 창이 떠서 API가 멈춘다. 그래서 항상 `doc/saveas`를 먼저 한다.
- **규칙**:
  - STEELCODECHECK는 `CODE-ANAL`이 성공한 뒤에만 호출한다(공장 앱 KR `--gen-check`).
  - CODE-ANAL이 실패하거나 시간 초과되면 STEELCODECHECK를 건너뛴다.
  - 요청이 오래 멈추면 먼저 Gen 창 목록에서 대화상자가 떠 있는지 확인한다.

## 3. 결과를 읽는 중에는 모델을 바꾸지 않는다

- 해석 후 MATL 하나를 PUT·DELETE하면 모든 표가 `Cannot generate table data as there is no analysis result.`가 된다.
- **규칙**: 결과 표는 모두 회수한 뒤에 모델을 수정한다. 수정했다면 재해석한다.

## 4. `EIGENVALUEMODE` 표 (간헐적 실패)

- `POST /post/TABLE {TABLE_TYPE:"EIGENVALUEMODE"}`가 항상 `Unknown Error`를 낸다.
  - 기둥 1개 + 절점질량 + Lanczos 최소 모델에서도 같다.
  - `UNIT` 유무, 설계 코드·조합·RS·스펙트럼·층 데이터를 하나씩 빼 봐도 같다.
- 같은 모델에서 `PARTICIPATIONVECTORMODE`(모드형상)는 정상이다. RS 해석과 층 표도 정상이다.
- story에서는 2026-06-14부터 10-12까지 정상이었다. **같은 날 20:2x 예제 골조 실행에서는 정상 응답**(T1 1.0456 s, 참여질량 SUB_TABLES 포함)이 나와 빌드 고장이 아니라 간헐적 실패로 정정한다. 실패 조건은 아직 재현하지 못했다.
- **영향**: story의 다음 4곳에서 T₁ 회수와 주기비·유효질량 검토가 실패한다(경고만 남고 진행).
  - `story/src/actions/analysis.ts:210`
  - `codes/cnReview.ts:26`
  - `codes/krReview.ts:35`
  - `codes/twReview.ts:31`
- **조치**: 실패하면 한 번 재시도하고(`scripts/live-frame.ts`), 그래도 실패하면 주기·유효질량을 '확인 불가'로 표시한다. 재현 조건을 찾으면 MIDAS에 보고한다.

## 5. 재료 `GB50017-17(S)`

- 설치 DLL에는 규격 `GB50017-17(S)`와 DB Q235·Q355·Q390·Q420·Q460·Q345GJ가 있다.
- 그러나 API PUT은 모든 DB가 `Unknown Error`다. Q345·Q235도 같고, `CODE` 후보 11종도 모두 실패했다.
- **원인(2026-10-19 확인)**: 영문판 Gen NX 2026의 재료 대화상자 Standard 목록에 `GB50017-17(S)`·`GB19(S)`가 없다(GB 50917-13, GB12, GB03, GB, GB50018-02, JTG D64-2015 등만 있음). API로 성공한 규격은 모두 이 목록에 있고 실패한 규격은 없다 → 필드 구조 문제가 아니라 **설치본(언어/지역판)에 규격이 열려 있지 않은 것**으로 본다. 예제 docx는 중문판 Gen 기준. GB50017-17 강재 설계가 API에 없는 것도 같은 이유일 수 있다(중문판에서 재확인 필요).
- 받아들여지는 것:
  - `GB03(S)` Q235·Q345
  - `GB12(S)` Q345
  - `BC1:12-GB(S)`·`JTG D64-2015(S)` Q355 (기준이 달라 쓰지 않음)
- **우회**: 사용자 정의 강재를 쓴다(아래). 강도 검토는 앱이 하므로 Gen에는 탄성 성질만 있으면 된다.
  ```
  { TYPE:'STEEL', NAME:'Q355', DAMP_RAT:0.02,
    PARAM:[{ P_TYPE:2, ELAST:2.06e8, POISN:0.3, THERMAL:1.2e-5, DEN:78.5, MASS:78.5/9.806 }] }   // kN·m
  ```

## 참고: 이번에 정상으로 확인한 것 (강재 다층 골조)
- `db/STOR` + `ope/STOR`(층 다이어프램·우발편심)
- `FBLD` + `FBLA`(강재 보 양방향 분배, LL 반력 합 오차 0%)
- `STYP` + `LTOM`
- `SPFC` CH2010 네이티브 스펙트럼
- `SPLC` XY 0°/90° + 우발편심
- `LCOM-GEN`(ST + RS 혼합)
- 층 표: `STORY_DRIFT_*`, `STORY_DISPLACEMENT_*`, `TORSIONAL_IRREGULARITY_*`, `STIFFNESS_IRREGULARITY_*`, `STORY_SHEAR_FORCE_COEFFICIENT`, `OVERTURNING_MOMENT`, `STORY_MASS`, `STORYWEIGHT`, `STORY_SHEAR_FORCE_RATIO`
  - 단, RS 케이스의 `STORY_DRIFT`는 최상층 행이 빠진다.

## 6. 공장 앱 φb 식 (코드 버그, 공장 앱 해당)

- GB 50017-2017 附录 C.0.1 식은 2019 勘误에서 끝항이 `εk` → **`εk²`** 로 정정됐다.
- 공장 앱 `src/codes/cnSteel.ts` `cnCapacity()`의 φb는 `* eps`(εk)를 써서 Q345에서 φb를 과대평가한다(비보수).
- 스틸 프레임 앱은 `src/codes/cnFrameSteel.ts` `phiBeam()`에서 εk²로 구현하고 예제 Gen 결과(0.912)로 확인했다. 공장 앱 수정은 별도 작업이다.

## 7. Gen 측 MAPI 중계 502

- 2026-10-19 20:24경 `moa-engineers.midasit.com` 중계가 모든 요청에 `502 Proxy Error`를 냈다(`/mapikey/verify` 포함). Gen 프로세스와 창은 정상이었다.
- 다른 프로그램이 같은 Gen·키를 쓰는 중일 수 있으므로, 라이브 검증 전에 확인하고 그런 경우 사용자에게 먼저 묻는다(CLAUDE.md 규칙).

## 8. 화면 캡처 (`/view/CAPTURE`, `/view/RESULTGRAPHIC`) — 라이브 2026-10-20

- `/view/CAPTURE`는 응답에 이미지를 싣지 않는다(`command complete`만). PNG 는 `EXPORT_PATH`(Gen PC 경로)에만 쓴다. 웹 앱이 읽으려면 같은 PC 에서 사용자가 그 폴더를 골라 허용해야 한다(File System Access, Chrome·Edge) — `src/lib/genFolder.ts`.
- 같은 호출에 `ANGLE`(평면 H 0·V 90, 정면 H 0·V 0, 측면 H 90·V 0), `ACTIVE`(`Identity`+`STORY` 층 하나, `Active`+`E_LIST`·`N_LIST` 골조선), `SET_HIDDEN`(은선 입체), `SET_MODE` pre/post, `ZOOM_LEVEL 100`(전체 맞춤)을 넘길 수 있다.
- 결과 그림은 `/view/RESULTGRAPHIC` 으로 바꾼 뒤 같은 객체를 `RESULT_GRAPHIC` 에도 넘긴다. 되는 `CURRENT_MODE`: `reactionforces/moments`, `displacementcontour`(COMP `DXYZ`), `beamdiagrams`(COMP `My`·`Fx`), `beamstresses`(COMP `Combined`). `TYPE_OF_DISPLAY` 에 `LEGEND`·`CONTOUR`·`VALUES{MINMAX_ONLY}` 를 주면 예제 docx 와 같은 범례가 찍힌다. 조합은 `LOAD_CASE_COMB {TYPE:'CB', NAME}`.
- 안 되는 것: 진형도 — `VibrationModeShapes`·`vibrationmodeshapes` 에 `Mode1`/`Mode 1`/TYPE `EIGEN` 모두 'Invalid Post Mode' 또는 'second query is wrong'. `deformedshape` 는 오류 없이 변형 없음. `DISPLAY.PROPERTY.PROPERTY_NAME` 은 글자가 겹쳐 쓸 수 없다.
- 한 장 실패가 나머지를 막지 않게 장별로 잡고, 끝에 ISO 전체 보기로 되돌린다(`src/frame/run.ts captureGen`).
