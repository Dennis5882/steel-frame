# 스틸구조물 Agent — 작업 지침

다층 강골조(모멘트·가새) MIDAS Gen NX 자동화 웹 앱. 기획은 `docs/steel-app-plan.md`가 기준이다.

## 출처
- 코드는 Smart MIDAS Steel v2.4.5(`E:/AI Study/smart-midas-steel`)를 복제한 것이다. 모듈 구조·규칙·라이브 확인 사항은 `docs/reference/smart-midas-steel/CLAUDE.md`를 따른다(공장 전용 내용 제외).
- Gen MAPI 공통 주의사항(DELETE 범위·모달 정지 등): `docs/gen-api-cautions.md`.
- 층 데이터·RS·층 검토 지표는 RC구조물 Agent(`E:/AI Study/story`)를 설계 참고한다: `docs/reference/story/MAPI_FINDINGS.md`, `_man_STOR*.json`. 코드 복사가 아니라 설계 참고.
- 공장 앱·RC 앱의 동작은 바꾸지 않는다. 공통 모듈(기획서 3.2절)을 고치면 공장 앱에도 반영이 필요한지 기록한다.

## 구조 (v1.1.0~)
- 화면은 골조 전용: `src/components/frame/*`(작업 흐름·8단계 모델링·3D·결과), 상태 `src/frame/state.ts`, 작업 `src/actions/frame.ts`. App 셸·헤더·연결·JobBar·로그는 공장 앱 것을 그대로 쓴다.
- 엔진 `src/frame/*`(형상·하중·Gen 페이로드·결과 회수·층 검토·부재 검토), 규준 식 `src/codes/cnFrameSteel.ts`. 평면 형상은 뺀 패널 번호(`spec.removed`)로 저장하고 편집 규칙은 `src/frame/plan.ts`.
- Gen 단계(전송·해석·회수)는 `src/frame/run.ts` 하나를 화면과 `scripts/live-frame.ts`가 같이 쓴다. 순서를 바꾸면 둘 다 바뀐다.
- 산출물: 계산서 HTML `src/frame/report.ts` → 공장 변환기 `report/pdf.ts`·`report/docx.ts`(그 변환기가 읽는 태그만 사용), 도면 `src/frame/drawings.ts`(공장 `drawing/dxf.ts`로 DXF·SVG 동시). 단면 최적화 `src/frame/optimize.ts`(순수) + `actions/frame.ts optimizeFrame`(Gen 재생성 반복). 회귀 `scripts/verify-frame-report.ts`.
- 계산서 문구에 새 글자를 넣으면 `python scripts/subset-fonts.py <Noto CJK OTF 폴더>`로 글꼴을 다시 만든다(verify 가 누락 글자를 잡는다). 아래첨자 숫자(₀₁)는 Noto 에 없어 계산서에서 보통 숫자로 바꾼다.
- 공장 앱 화면·도메인 코드(`domain/*`, `components/` 공장용, 관련 verify)는 아직 남아 있다(회귀용). 화면에서는 쓰지 않는다. 정리는 별도 단계.
- Gen 자동 저장 파일은 `sf_` 접두(`sf_backup_*`, `sf_model_*`, 스크립트 `sf_frame_*`).

## 규칙 (공장 앱과 동일)
- 버전은 `npm run release -- patch|minor|major`로만 연다. `package.json` 버전과 `src/data/releases.json`·4개 언어 노트가 어긋나면 빌드 실패.
- UI 문구는 `t('key')`로만. `dict/en.ts`가 키 기준, 나머지 언어는 타입으로 누락 검출. zh-CN은 대륙 용어.
- 커밋 전 `npm run verify`(오프라인 회귀). 구조가 바뀌는 단계는 Gen NX 라이브로 검증.
- 식은 테스트 안에서 원문대로 독립 재구현한다. 결과는 'OK' 단정 대신 검토 등급(`domain/status.ts`).
- MAPI-Key·`.env*`는 커밋 금지. Gen 라이브 시험 PUT은 확인 후 DELETE로 원복.
- 라이브 검증 전: Gen NX를 다른 프로그램이 쓰고 있는지(창 제목의 열린 문서가 `C:/temp/sf_*`가 아님, `/mapikey/verify` 실패·502, 다른 라이브 스크립트 실행 중) 확인하고, 그렇다면 사용자에게 먼저 묻는다.
- `docs/*.docx` 예제 원본은 로컬 전용(gitignore).

## 배포
- GitHub `Dennis5882/steel-frame` `main` → Vercel 프로젝트 `steel-frame` 자동 배포.
