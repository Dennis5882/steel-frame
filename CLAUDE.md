# 스틸구조물 Agent — 작업 지침

다층 강골조(모멘트·가새) MIDAS Gen NX 자동화 웹 앱. 기획은 `docs/steel-app-plan.md`가 기준이다.

## 출처
- 코드는 Smart MIDAS Steel v2.4.5(`E:/AI Study/smart-midas-steel`)를 복제한 것이다. 모듈 구조·규칙·라이브 확인 사항은 `docs/reference/smart-midas-steel/CLAUDE.md`를 따른다(공장 전용 내용 제외).
- 층 데이터·RS·층 검토 지표는 RC구조물 Agent(`E:/AI Study/story`)를 설계 참고한다: `docs/reference/story/MAPI_FINDINGS.md`, `_man_STOR*.json`. 코드 복사가 아니라 설계 참고.
- 공장 앱·RC 앱의 동작은 바꾸지 않는다. 공통 모듈(기획서 3.2절)을 고치면 공장 앱에도 반영이 필요한지 기록한다.

## 규칙 (공장 앱과 동일)
- 버전은 `npm run release -- patch|minor|major`로만 연다. `package.json` 버전과 `src/data/releases.json`·4개 언어 노트가 어긋나면 빌드 실패.
- UI 문구는 `t('key')`로만. `dict/en.ts`가 키 기준, 나머지 언어는 타입으로 누락 검출. zh-CN은 대륙 용어.
- 커밋 전 `npm run verify`(오프라인 회귀). 구조가 바뀌는 단계는 Gen NX 라이브로 검증.
- 식은 테스트 안에서 원문대로 독립 재구현한다. 결과는 'OK' 단정 대신 검토 등급(`domain/status.ts`).
- MAPI-Key·`.env*`는 커밋 금지. Gen 라이브 시험 PUT은 확인 후 DELETE로 원복.
- `docs/*.docx` 예제 원본은 로컬 전용(gitignore).

## 배포
- GitHub `Dennis5882/steel-frame` `main` → Vercel 프로젝트 `steel-frame` 자동 배포.
