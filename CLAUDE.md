# 스틸구조물 Agent — 작업 지침

다층 강골조(모멘트·가새) MIDAS Gen NX 자동화 웹 앱. 기획은 `docs/steel-app-plan.md`가 기준이다.

## 출처
- 코드는 Smart MIDAS Steel v2.4.5(`E:/AI Study/smart-midas-steel`)를 복제한 것이다. 모듈 구조·규칙·라이브 확인 사항은 `docs/reference/smart-midas-steel/CLAUDE.md`를 따른다(공장 전용 내용 제외).
- Gen MAPI 공통 주의사항(DELETE 범위·모달 정지 등): `docs/gen-api-cautions.md`.
- 층 데이터·RS·층 검토 지표는 RC구조물 Agent(`E:/AI Study/story`)를 설계 참고한다: `docs/reference/story/MAPI_FINDINGS.md`, `_man_STOR*.json`. 코드 복사가 아니라 설계 참고.
- 공장 앱·RC 앱의 동작은 바꾸지 않는다. 공통 모듈(기획서 3.2절)이나 공통 문구 키(`gen_changed`·`job_cancelled*` 등 공통 `actions/*`가 쓰는 키)를 고치면 기획서 3.2절 '공통 모듈 변경 기록' 표에 한 줄 적는다(반영 권장 / 필요 없음 / 반영 금지).

## 구조 (v1.1.0~)
- 화면은 골조 전용: `src/components/frame/*`(작업 흐름·8단계 모델링·3D·결과), 상태 `src/frame/state.ts`, 작업 `src/actions/frame.ts`. App 셸·헤더·연결·JobBar·로그는 공장 앱 것을 그대로 쓴다.
- 엔진 `src/frame/*`(형상·하중·Gen 페이로드·결과 회수·층 검토·부재 검토), 규준 식 `src/codes/cnFrameSteel.ts`. 평면 형상은 뺀 패널 번호(`spec.removed`)로 저장하고 편집 규칙은 `src/frame/plan.ts`.
- Gen 단계(전송 `sendFrame`·해석 `analyze(req, P, save)`·회수)는 `src/frame/run.ts` 하나를 화면(`actions/frame.ts`)과 라이브 스크립트(`live-frame`·`live-sync`·`live-cad`·`live-detail`)가 같이 쓴다. 단계 순서는 `actions/frame.ts`가 아니라 `run.ts`에서 바꾼다.
- 산출물: 계산서 HTML `src/frame/report.ts` → 공장 변환기 `report/pdf.ts`·`report/docx.ts`(그 변환기가 읽는 태그만 사용), 도면 `src/frame/drawings.ts`(공장 `drawing/dxf.ts`로 DXF·SVG 동시). 단면 최적화 `src/frame/optimize.ts`(순수) + `actions/frame.ts optimizeFrame`(Gen 재생성 반복). 회귀 `scripts/verify-frame-report.ts`.
- 상세 계산서(Gen NX 캡처): 캡처 목록 `src/frame/captures.ts`, 실행 `run.ts captureGen`, 폴더 읽기 `src/lib/genFolder.ts`, 라이브 `scripts/live-detail.ts`·탐색 `scripts/live-capture.ts`. 캡처 PNG 는 Gen 이 저장 폴더에 쓰고 앱은 사용자가 허용한 폴더에서 읽는다(`gen-api-cautions.md` 8). 공용 변환기 `report/docx.ts`·`pdf.ts` 에 `<img>` data URL 그림 지원을 추가했다(공장 계산서는 SVG 만 써서 영향 없음).
- 물량 산출서 값 `src/frame/quantities.ts`(순수), 시트 `src/frame/quantitySheet.ts`(공장 `report/xlsx.ts` 작성기). 검토 결과 시트 `src/frame/checkSheet.ts`(같은 작성기, CSV·XLSX 공통).
- 평면도 DXF → 축망: 엔진 `src/frame/cad/*`(순수, 화면이 늦게 불러옴), 화면 `components/frame/CadImport.tsx`(轴网 단계), 기준 문서 `docs/cad-import.md`, 회귀 `scripts/verify-cad-grid.ts`, 라이브 `scripts/live-cad.ts`(도면 → 스펙 → Gen 전송·해석·검토·동일성). `decodeDxf.ts`·`drawingScale.ts`와 축 인식 규칙은 StruXureAI(`E:/AI Study/StruXureAI`)에서 가져왔다(고치면 그쪽 반영 여부 기록). 파서는 `dxf`(MIT). DWG는 받지 않는다. 샘플 도면은 `samples/cad/`(gitignore).
- 산출물 선행 조건은 `state.ts outputBlocker` 하나(단계 안내·카드·모든 내보내기 공통). 새 산출물·조건은 `OUTPUT_RULES` 에 추가한다.
- 계산서 문구에 새 글자를 넣으면 `python scripts/subset-fonts.py <Noto CJK OTF 폴더>`로 글꼴을 다시 만든다(verify 가 누락 글자를 잡는다). 아래첨자 숫자(₀₁)는 Noto 에 없어 계산서에서 보통 숫자로 바꾼다.
- 공장 앱 화면·도메인 코드(`domain/*`, `components/` 공장용, 관련 verify)는 아직 남아 있다(회귀용). 화면에서는 쓰지 않는다. 정리는 별도 단계.
- Gen 자동 저장 파일은 `sf_` 접두(`sf_backup_*`, `sf_model_*`, 스크립트 `sf_frame_*`).

## 규칙 (공장 앱과 동일)
- 버전은 `npm run release -- patch|minor|major`로만 연다. `package.json` 버전과 `src/data/releases.json`·4개 언어 노트가 어긋나면 빌드 실패.
- UI 문구는 `t('key')`로만. `dict/en.ts`가 키 기준, 나머지 언어는 타입으로 누락 검출. zh-CN은 대륙 용어.
- 커밋 전 `npm run verify`(오프라인 회귀). 구조가 바뀌는 단계는 Gen NX 라이브로 검증. `tsc`·verify는 `scripts/`를 검사하지 않으므로 고친 라이브 스크립트는 실행(또는 `npx esbuild <파일> --log-level=error > /dev/null`로 구문 확인)해 본다.
- 식은 테스트 안에서 원문대로 독립 재구현한다. 결과는 'OK' 단정 대신 검토 등급(`domain/status.ts`).
- MAPI-Key·`.env*`는 커밋 금지.
- 라이브 시험으로 바꾼 Gen 값은 확인 후 원복한다: 고친 항목은 바꾸기 전에 GET한 값을 PUT, 새로 넣은 항목만 `DELETE /db/<DB>/<id>`(본문 `Assign`을 넣은 DELETE는 DB 전체를 지움 — `gen-api-cautions.md` 1).
- 라이브 검증 전: Gen NX를 다른 프로그램이 쓰고 있는지(창 제목의 열린 문서가 `C:/temp/sf_*`가 아님, `/mapikey/verify` 실패·502, 다른 라이브 스크립트 실행 중) 확인하고, 그렇다면 사용자에게 먼저 묻는다. `404 client does not exist`는 Gen의 API 연결이 끊긴 것이다(Gen에서 다시 연결해야 함).
- 라이브 스크립트는 Gen을 건드리기 전에 입력(스펙·도면)을 다 확인하고 맞지 않으면 백업 전에 끝낸다. 백업 뒤 실패하면 백업 경로를 출력한다(`live-frame`의 try 참고).
- Gen 응답 형태는 라이브로 확인한 것만 믿는다: `expectOk`(완료 메시지)는 명령 호출에만 맞고, `ope/STOR`처럼 표를 돌려주는 명령이나 PUT은 돌려준 항목 수로 확인한다. 동일성 비교(`FRAME_SYNC_DBS`)에 DB를 넣을 때는 Gen이 다시 쓰는 필드가 없는지 라이브로 보고 `frameSyncPayload`에서 뺀다.
- `docs/*.docx` 예제 원본은 로컬 전용(gitignore).

## 배포
- GitHub `Dennis5882/steel-frame` `main`에 푸시한 뒤 `npx vercel deploy --prod --yes`(Vercel 프로젝트 `steel-frame`). Git 자동 배포는 연결돼 있지 않다(Vercel GitHub 앱 권한 없음).
