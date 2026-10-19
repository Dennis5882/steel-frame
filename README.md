# 스틸구조물 Agent (Steel Frame Agent)

MIDAS Gen NX Open API로 **다층 강구조 골조(모멘트골조·가새골조)** 를 자동 모델링·해석하고, 층 검토 지표와 부재 검토를 보여주는 웹 도구. Smart MIDAS Steel(문형 공장 앱)의 자매 앱이다.

- 기획: [docs/steel-app-plan.md](docs/steel-app-plan.md) — 1차 기준 CN(GB), 기준 예제 4층 강 가새골조(`钢支撑框架分析设计操作例题-GEN NX`)
- 출발점: [Smart MIDAS Steel](https://github.com/Dennis5882/smart-midas-steel) v2.4.5를 복제(방식 A′). 현재 코드는 공장 앱 셸 그대로이며, 공장 전용 코드 정리·다층 형상은 단계 1~2에서 진행한다.
- 참고 자료
  - [docs/reference/smart-midas-steel/](docs/reference/smart-midas-steel/) — 공장 앱 CLAUDE.md(라이브 확인 사항)·구현 문서·로드맵
  - [docs/reference/story/](docs/reference/story/) — RC구조물 Agent(story)의 MAPI 조사(`MAPI_FINDINGS.md`)·층 관련 API 매뉴얼(`_man_STOR*.json`)

## 개발

```bash
npm install
npm run dev       # 개발 서버
npm run verify    # 오프라인 회귀 (Gen·키 불필요) — 커밋 전 실행
npm run build     # 릴리즈 검사 + 타입체크 + 빌드
npm run release -- patch|minor|major   # 버전·릴리즈 노트 열기
```

- 스택: Vite + TypeScript + React + Tailwind v4 + shadcn/ui
- 브라우저가 로컬 MIDAS Gen NX의 MAPI를 `midas-nx` SDK로 직접 호출한다. MAPI-Key는 메모리에만 보관하며 코드·커밋에 넣지 않는다.
- 배포: GitHub `main` → Vercel 자동 배포
