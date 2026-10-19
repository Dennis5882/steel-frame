# Taiwan Factory Steel Structure Wizard 개발 기획서

> 아카이브 · 2026-10-19 정리. 과거 계획·구현·검증 기록입니다. 당시 미완료 항목이 모두 완료됐다는 뜻은 아닙니다. 현재 상태는 [현황](../../current-status.md), 남은 과제는 [로드맵](../../roadmap.md)을 우선 확인하세요.

문서 버전: v0.1  
작성일: 2026-06-15  
대상 기술 스택: React + Vite + TypeScript + shadcn/ui  
대상 해석/설계 연동: MIDAS Gen NX API  
개정: 2026-10-15 — 현재 코드(v0.6.0)·라이브 검증 사실과 맞춤 (MAPI 브라우저 직접 호출, Vercel Functions, 자체 설계 검토, 표2-1 縣市/鄉鎮 조회, 가새 위치, 하중 케이스, 범위 규칙)  
대상 구조물: 대만 공장형 철골 구조물

---

## 1. 제품 정의

**Taiwan Factory Steel Structure Wizard**는 대만 공장형 철골 구조물을 대상으로 하는 대화형 구조 모델링 위저드이다.

사용자는 복잡한 구조 입력 화면을 한 번에 작성하지 않는다. 대신 위저드가 간단한 질문을 하나씩 던지고, 사용자가 클릭, 선택, 숫자 입력 방식으로 답하면 시스템이 내부적으로 다음 항목을 생성한다.

- 프로젝트 기본 정보
- 대만 적용 기준 세트
- 공장 유형
- 대표 횡단면 템플릿
- 종방향 Bay Layout
- 재료
- 단면
- 경계조건
- 하중조건
- 풍하중 및 내진해석 조건
- MIDAS Gen NX API 기반 모델
- 설계 검토용 데이터
- 도면 초안
- 계산서 초안
- 물량산출 초안

이 제품은 Gen NX 전문가를 대체하지 않는다. Gen NX를 잘 모르는 사용자가 **공장형 철골 기본 모델을 빠르게 생성**하도록 돕는 것이 목적이다.

---

## 2. 핵심 제품 철학

### 2.1 한 화면 입력폼을 만들지 않는다

이 위저드는 일반적인 구조설계 프로그램처럼 모든 입력 항목을 한 화면에 노출하면 안 된다.

피해야 할 방식:

```text
Project Info
Geometry
Material
Section
Load
Seismic
Wind
Boundary
Design
Report
Quantity
```

권장 방식:

```text
Question
→ User Answer
→ State Update
→ Engineering Intent Inference
→ Next Question
→ Preview
→ Confirm
→ Generate Model
```

사용자는 “구조설계 프로그램을 조작한다”기보다 “구조설계 어시스턴트와 대화한다”고 느껴야 한다.

### 2.2 쉬운 것은 Wizard가 처리한다

Wizard가 처리할 항목은 다음과 같다.

| 항목 | 처리 수준 |
|---|---|
| 공장 유형 선택 | 자동 |
| 대표 횡단면 선택 | 자동 |
| 단일 경간 박공지붕 | 자동 |
| 다경간 박공지붕 | 자동 |
| 단경사 지붕 | 자동 |
| 종방향 Bay 반복 생성 | 자동 |
| H형강 주골조 | 자동 |
| Purlin / Girt | 자동 또는 등가하중 |
| 기본 Bracing | 자동 |
| 기본 하중 | 자동 |
| 위치 기반 풍하중/내진 조건 기본값 | 자동 또는 추천 |
| Gen NX API 모델 생성 | 자동 |
| 계산서 초안 | 자동 |
| 물량산출 초안 | 자동 |

### 2.3 복잡한 것은 Gen NX 전문가 영역으로 남긴다

Wizard에서 처리하지 않을 항목은 다음과 같다.

| 제외 항목 | 제외 이유 |
|---|---|
| 비정형 곡면 지붕 | 템플릿 기반 자동화 범위 초과 |
| 복잡한 플랜트 구조 | 공장형 건축 철골 범위 초과 |
| 복잡한 접합 상세설계 | 전문가 검토 필요 |
| 특수 내진 시스템 상세설계 | 별도 고급 모듈 필요 |
| 고층 복합 철골건물 | 공장형 Wizard 범위 초과 |
| 완전한 Shop Drawing 자동화 | 제작도 시스템 영역 |
| 모든 크레인 이동하중 위치 조합 | MVP 범위 초과 |
| 불규칙 평면, 비직교 그리드 | Wizard 단순화 원칙 위반 |

복잡한 조건이 감지되면 다음과 같은 안내를 제공한다.

```text
이 구조는 자동 위저드 범위를 초과합니다.
Gen NX에서 직접 모델링하는 것을 권장합니다.
```

---

## 3. 대만 공장형 Steel 모델링 방식

### 3.1 RC 모델링과 다른 점

RC 건물 위저드는 일반적으로 층, 평면 그리드, 벽체, 기둥, 보, 슬래브를 중심으로 모델을 생성한다.

공장형 Steel 위저드는 접근이 다르다.

```text
대표 횡단면 선택
→ 횡단면 Geometry 확정
→ 종방향 Bay 수와 간격 입력
→ Frame 반복 복제
→ Purlin / Girt / Bracing 자동 배치
→ 하중 분배
→ Gen NX API 모델 생성
```

따라서 이 제품의 중심 입력은 “층별 평면”이 아니라 **대표 횡단면**이다.

### 3.2 기본 모델 생성 흐름

```text
Factory Template
→ Cross Section Nodes
→ Main Frame Elements
→ Longitudinal Replication
→ Secondary Member Generation
→ Bracing Generation
→ Boundary Generation
→ Load Generation
→ Seismic / Wind Setup
→ MIDAS Gen NX JSON Mapping
```

---

## 4. 대만 공장형 구조 템플릿

### 4.1 MVP 1: 단일 경간 박공지붕 공장

Template ID:

```text
single_span_gable_factory
```

대만 UI 명칭:

```text
單跨雙坡門式鋼構廠房
```

개념:

```text
          Ridge
            ▲
           / \
          /   \
         /     \
        /       \
   Column       Column
     │             │
     │             │
─────┴─────────────┴─────
```

주요 입력값:

| 입력 항목 | 설명 |
|---|---|
| Span Width | 좌우 기둥 중심 간 거리 |
| Eave Height | 처마 높이 |
| Ridge Height | 용마루 높이 |
| Roof Slope | 지붕 경사 |
| Bay Spacing | 종방향 Bay 간격 |
| Bay Count | 종방향 Bay 개수 |
| Column Base | Pin / Fixed / Wizard Default |
| Haunch Option | 처마부/용마루부 Haunch 적용 여부 |

MVP 1의 핵심 템플릿으로 설정한다.

### 4.2 MVP 2: 천장크레인 포함 공장

Template ID:

```text
crane_gable_factory
```

대만 UI 명칭:

```text
含天車鋼構廠房
```

개념:

```text
             Ridge
              ▲
             / \
            /   \
           /     \
      ┌───┐     ┌───┐
      │CR │=====│CR │  ← 天車梁 / Crane Runway Beam
      └─┬─┘     └─┬─┘
        │         │
        │         │
────────┴─────────┴────────
```

추가 입력값:

| 입력 항목 | 설명 |
|---|---|
| Crane Capacity | 5 ton, 10 ton, 20 ton, 직접 입력 |
| Crane Span | 크레인 주행 폭 |
| Runway Elevation | 天車梁 높이 |
| Hook Height | Hook clear height |
| Crane Beam Section | 자동 추천 또는 직접 입력 |
| Bracket Type | 牛腿 / Bracket |
| Crane Load Mode | 기본값 / 보수적 / 직접 입력 |

### 4.3 MVP 3: 다경간 박공지붕 공장

Template ID:

```text
multi_span_gable_factory
```

대만 UI 명칭:

```text
多跨雙坡門式鋼構廠房
```

주요 입력값:

| 입력 항목 | 설명 |
|---|---|
| Span Count | 경간 수 |
| Span Widths | 각 경간 폭 |
| Internal Columns | 내부 기둥 배치 |
| Roof Valley | 골 지붕 배수 위치 |
| Gutter Location | 배수로 위치 |
| Expansion Joint | 신축이음 여부 |

### 4.4 후속 템플릿

| Template ID | 대만 UI 명칭 | 설명 |
|---|---|---|
| mono_slope_factory | 單坡鋼構廠房 | 단경사 지붕, 증축형 공장, 캐노피 |
| mezzanine_factory | 含夾層廠辦鋼構 | 공장 + 중이층 / 사무공간 |
| warehouse_factory | 倉儲鋼構廠房 | 창고 / 물류창고 특화 |

---

## 5. 대만 관련 구조설계 코드 체계

대만 공장형 철골 구조물 Wizard는 아래 기준들을 코드 엔진에 매핑해야 한다.

### 5.1 코드 적용 원칙

이 Wizard는 법적 인허가용 최종 설계 도구가 아니라 **기본 모델 생성 및 검토 초안 생성 도구**이다. 따라서 코드 적용 수준은 다음처럼 구분한다.

| 적용 수준 | 의미 |
|---|---|
| Required | Wizard 모델 생성과 해석 조건에 반드시 반영 |
| Recommended | 결과 검토 및 리포트에 참조 |
| Reference | 사용자가 전문가 모드에서 확인하거나 후속 검토 |

### 5.2 대만 코드 목록

| 구분 | 대만 기준명 | 적용 수준 | Wizard 반영 위치 |
|---|---|---:|---|
| 상위 구조 기준 | 建築技術規則建築構造編 | Required | 프로젝트 기본 기준, 구조안전, 하중 기본 원칙, 도면/계산서 요구사항 |
| 철골 설계 | 鋼構造建築物鋼結構設計技術規範 | Required | 강재, 부재 설계, 접합 개념, 제작/설치/품질관리, 내진 관련 철골 요구사항 |
| 허용응력 설계 | 鋼結構容許應力設計法規範及解說 | Optional | ASD 방식 선택 시 적용 |
| 극한설계 | 鋼結構極限設計法規範及解說 | Recommended | 기본 설계 방식으로 우선 고려 |
| 내진 설계 | 建築物耐震設計規範及解說 | Required | 지진하중, 정적/동적 해석, 구조시스템 조건, 내진 상세 요구 판단 |
| 내풍 설계 | 建築物耐風設計規範及解說 | Required | 설계풍력, 지붕/벽체 외장재 풍압, 층간변위 검토 |
| 기초 설계 | 建築物基礎構造設計規範 | Recommended | 기초 반력, 지점 조건, 베이스 플레이트/앵커 검토 연계 |
| 철골 시공 | 鋼構造建築物鋼結構施工規範 | Reference | 용접, 고장력볼트, 제작, 설치, 도장, 품질관리, 검측 체크리스트 |
| SRC 혼합 구조 | 鋼骨鋼筋混凝土構造設計規範與解說 | Reference | 공장+사무실, RC 코어, SRC 기둥 등이 포함될 때만 참조 |
| 재료 표준 | CNS / ASTM / JIS 재료 규격 | Recommended | 강재 DB, 볼트 DB, 사용자 정의 재료값 |

### 5.3 공식 출처 요약

- `鋼構造建築物鋼結構設計技術規範`은 허용응력 설계법과 극한설계법을 모두 포함하며, 하중, 재료, 인장재, 압축재, 휨재, 조합력, 합성부재, 접합설계, 제작/설치/품질관리, 내진설계 장을 포함한다.  
  Source: https://www.nlma.gov.tw/ch/legislation/regsearch/7176

- `建築物耐震設計規範及解說`은 정적해석, 동적해석, 비구조재/설비의 지진력, 구조시스템 상세요구, 내진품질관리 등을 포함한다. 2024-03-01 수정 이력이 있다.  
  Source: https://glrs.moi.gov.tw/LawContent.aspx?id=GL000180

- `建築物耐風設計規範及解說`은 건축물 설계풍력, 국부 구성재와 외장재 풍압, 층간변위각, 최고 거주층 횡가속도, 풍동시험 관련 규정을 포함한다.  
  Source: https://www.nlma.gov.tw/ch/legislation/regsearch/166

- `建築物基礎構造設計規範`은 2023-06-20 수정, 2024-01-01 시행 자료가 확인되며, 일반 건축물의 지반조사, 기초 설계, 시공 관련 안전 요구사항을 다룬다.  
  Source: https://www.nlma.gov.tw/ch/legislation/regsearch/962

- `鋼構造建築物鋼結構施工規範`은 재료, 제작, 용접, 고장력볼트, 표면처리/도장, 운송, 설치 및 정밀도, 임시지지, 품질관리와 검수를 포함한다.  
  Source: https://www.nlma.gov.tw/ch/legislation/regsearch/157

### 5.4 코드 엔진 설계 방향

코드 기준은 UI에 하드코딩하지 않는다. 별도 코드 어댑터로 분리한다.

```text
TaiwanCodeEngine
├─ TaiwanBuildingStructureRuleAdapter
├─ TaiwanSteelDesignCodeAdapter
├─ TaiwanSeismicCodeAdapter
├─ TaiwanWindCodeAdapter
├─ TaiwanFoundationCodeAdapter
└─ TaiwanConstructionSpecAdapter
```

각 Adapter는 다음 역할을 담당한다.

| Adapter | 역할 |
|---|---|
| TaiwanBuildingStructureRuleAdapter | 프로젝트 기본 설계 원칙, 구조안전 체크, 리포트 요구사항 |
| TaiwanSteelDesignCodeAdapter | Steel 설계법, 재료, 부재검토, 하중조합, 접합 개념 |
| TaiwanSeismicCodeAdapter | 위치 기반 지진조건, 정적/동적 해석 요구, 질량, 층간변위 검토 |
| TaiwanWindCodeAdapter | 설계풍력, 지붕/벽체 풍압, 외장재 검토용 하중 |
| TaiwanFoundationCodeAdapter | 지점조건, 기초반력, 기초 검토 리포트 연계 |
| TaiwanConstructionSpecAdapter | 제작/용접/볼트/설치/도장/QC 체크리스트 |

### 5.5 코드 설정 데이터 예시

```ts
export type TaiwanCodeSet = {
  jurisdiction: "TW";
  buildingStructureRule: "建築技術規則建築構造編";
  steelDesignCode: "鋼構造建築物鋼結構設計技術規範";
  steelDesignMethod: "ASD" | "LSD";
  seismicCode: "建築物耐震設計規範及解說";
  windCode: "建築物耐風設計規範及解說";
  foundationCode?: "建築物基礎構造設計規範";
  constructionSpec?: "鋼構造建築物鋼結構施工規範";
  materialStandard: "CNS" | "ASTM" | "JIS" | "USER_DEFINED";
};
```

### 5.6 MVP에서 코드 자동화 수준

| 코드 항목 | MVP 자동화 수준 |
|---|---|
| 적용 기준명 저장 | 자동 |
| 설계법 ASD/LSD 선택 | 사용자 선택 또는 기본값 |
| 풍하중 계수 전체 자동 계산 | 초기에는 위치 기반 기본값/보수값으로 제한 |
| 지진하중 계수 전체 자동 계산 | 초기에는 위치 기반 기본값/보수값으로 제한 |
| Steel 부재 강도 상세검토 | 웹 자체 구현 (`src/codes/twSteel.ts`·`src/domain/design.ts`, LRFD 원문식) — Gen NX 설계 API(`post/STEELCODECHECK`·`DESIGN/STEEL/<code>/CODE-ANAL`)는 KDS 만 지원하고 TWN-LSD90/ASD90 은 404. Gen NX 는 해석 결과(`BEAMFORCE` 등)만 제공 |
| 접합 상세 설계 | 구현됨 (v0.6.0) — 주각·처마 단부판·마루·가새 볼트, 13.7.2 용량 설계 (`src/codes/twConnection.ts`·`src/domain/connections.ts`). Wizard 는 이 결과를 그대로 사용 |
| 기초 상세 설계 | 반력 출력 및 후속 검토용 데이터 제공 |
| 계산서 | 기준명, 입력값, 해석 결과, 부재 요약 중심 초안 |

---

## 6. React + Vite + TypeScript + shadcn/ui 아키텍처

### 6.1 권장 전체 구조

```text
Frontend: React + Vite + TypeScript + shadcn/ui + Tailwind CSS
Backend: Vercel Functions (`api/*.ts`, Web 표준 `export function GET(req: Request)`) — 고정
Analysis Connector: MIDAS Gen NX API (브라우저에서 직접 호출)
Storage: Project JSON / Template JSON / Result JSON
Deploy: main → Vercel 자동 배포 (https://steel.midasapi.space)
```

MIDAS Gen NX 는 **사용자 PC 에서 실행되는 로컬 프로그램**이므로 Vercel 서버는 Gen 에 접근할 수 없다. 따라서 MAPI 호출은 Backend Proxy 를 거치지 않고 **브라우저가 직접** 한다 (`src/mapi/client.ts`).

MAPI-Key 는 사용자가 MAPI 드로어에 입력하고 **브라우저 메모리(state)에만** 보관한다 — 서버·코드·커밋·저장소에 저장하지 않는다.

```text
React Frontend (Wizard)
→ src/mapi/client.ts (브라우저, 메모리 속 MAPI-Key)
→ 로컬 MIDAS Gen NX API
→ src/actions/results.ts (결과 회수·파싱)
→ React Result View
```

Backend(`api/`)는 Gen 과 무관한 일(단면·재질 라이브러리, 설계 검토 계산, 보고서 생성 등)만 맡는다.

### 6.2 Frontend 폴더 구조

Wizard 는 **기존 구조(CLAUDE.md "구조")에 얹는다**. 새 `features/`·`services/`·`app/routes.tsx` 트리를 만들지 않는다 — 형상·하중·페이로드 생성기를 따로 만들면 `gen.ts`·`loads.ts`·`twLateral.ts` 와 두 갈래 진실이 생긴다.

```text
src/
  components/            화면 (story 셸 app.css 클래스)
    PlanCard.tsx         스펙 편집 카드 — Wizard 질문 카드가 같은 스펙을 채운다
    Wizard.tsx           (신규) 질문 카드·진행 표시·요약
    Panels.tsx·View3D.tsx 결과·3D 미리보기 (기존)

  agent/                 GUIDE·대화 명령 (기존)
    wizard.ts            (신규) 질문 정의(데이터)·다음 질문 결정·답 → 스펙 변환

  domain/                순수 엔지니어링 로직 (기존 — 재사용)
    types.ts             스펙 타입 = Wizard 상태의 최종 결과
    portal.ts            형상(프레임·2차부재·풍주·가새)
    gen.ts               Gen NX 페이로드 (순수)
    loads.ts             하중 케이스·조합
    design.ts·connections.ts·optimize.ts·schedule.ts
    scope.ts             (신규) Wizard 범위 규칙 (14장)

  codes/                 기준 프로필 (기존 — 재사용)
    tw.ts                재료(Gen 매핑 포함)·하중조합
    twLateral.ts·twSites.ts·twWindCC.ts·twSteel.ts·twConnection.ts

  actions/               Gen 호출 순서 (기존 — build.ts·analysis.ts·results.ts·design.ts·optimize.ts·outputs.ts)
  mapi/client.ts         브라우저 직접 MAPI 호출 (기존)
  report/·drawing/       계산서·DXF (기존)
```

Wizard 의 새 코드는 **질문 → `Spec`(domain/types.ts) 변환**과 **범위 규칙**뿐이다. 모델 생성 이후는 기존 `공장 생성 → 해석 → 설계 검토 → 단면 최적화 → 계산서/도면` 파이프라인을 그대로 호출한다.

### 6.3 UI와 엔지니어링 로직 분리 원칙

```text
UI Component
≠ Wizard Logic
≠ Engineering Rules
≠ MIDAS JSON Generator
≠ API Connector
```

각 레이어의 책임은 명확히 분리한다.

| 레이어 | 책임 |
|---|---|
| UI Components | 질문 표시, 버튼, 입력창, 미리보기 |
| Wizard Engine | 다음 질문 결정, 상태 업데이트, 분기 처리 |
| Engineering Rules | 공장 템플릿, 단면 추천, 하중 기본값, Bracing 규칙 |
| MIDAS Mapper | 기존 `src/domain/gen.ts` (순수) — 새로 만들지 않음 |
| API Service | 브라우저에서 로컬 Gen NX 에 직접 MAPI 호출 (`src/mapi/client.ts`) |

---

## 7. Wizard 상태 모델

### 7.1 기본 상태 구조

```ts
export type WizardProjectState = {
  project: {
    country: "Taiwan";
    // 지진: 표2-1(327 鄉鎮)·표2-6(b)·臺北盆地 조회 (src/codes/twSites.ts) → SDS·SD1·SMS·SM1 자동
    // 스펙 필드 spec.seismic.county / town / soil 과 같다. 도시 enum 으로는 계수를 정할 수 없다.
    county?: string;   // 縣市 — counties()
    town?: string;     // 鄉鎮市區 — townsOf(county)
    soil?: 1 | 2 | 3;  // 第一~三類地盤
    mode: "concept" | "proposal" | "basic_design" | "gen_pre_model";
  };

  codeSet: TaiwanCodeSet;

  factory: {
    category?: "general" | "warehouse" | "crane" | "mezzanine" | "canopy";
    templateId?:
      | "single_span_gable_factory"
      | "multi_span_gable_factory"
      | "mono_slope_factory"
      | "crane_gable_factory"
      | "mezzanine_factory";
  };

  geometry: {
    spanWidth?: number;
    spanCount?: number;
    spanWidths?: number[];
    eaveHeight?: number;
    ridgeHeight?: number;
    roofSlope?: number;
    baySpacing?: number;
    bayCount?: number;
    totalLength?: number;
  };

  crane: {
    enabled: boolean;
    capacityTon?: number;
    runwayElevation?: number;
    hookHeight?: number;
    craneSpan?: number;
  };

  material: {
    mode: "wizard_default" | "cns" | "astm" | "jis" | "custom";
    // 코드 프로필(src/codes/tw.ts)의 재료 키만 허용 — 자유 문자열 금지.
    // Gen db/MATL 은 등급 접미사(SN400B)를 거부하므로 프로필 gen 매핑(SN400B → CNS(S) SN400)을 거쳐 전송한다.
    steelGrade?: "SN400B" | "SN490B" | "SM490A";
    fy?: number;
    fu?: number;
    elasticModulus?: number;
  };

  sections: {
    mode: "auto" | "light" | "safe" | "custom";
    mainColumn?: string;
    rafter?: string;
    purlin?: string;
    girt?: string;
    brace?: string;
    craneBeam?: string;
  };

  boundary: {
    baseCondition?: "pinned" | "fixed" | "wizard_default" | "custom";
  };

  loads: {
    deadLoadMode?: "auto" | "custom";
    liveLoadMode?: "factory_default" | "warehouse" | "custom";
    windLoadMode?: "location_default" | "conservative" | "custom";
    seismicLoadMode?: "location_default" | "conservative" | "custom";
    craneLoadMode?: "none" | "default" | "conservative" | "custom";
  };

  outputs: {
    generateMidasModel: boolean;
    generateDrawing: boolean;
    generateCalculationReport: boolean;
    generateQuantityTakeoff: boolean;
  };

  scope: {
    isWithinWizardScope: boolean;
    warnings: string[];
    excludedReasons: string[];
  };
};
```

### 7.2 상태 업데이트 원칙

사용자가 답변하면 다음 순서로 처리한다.

```text
User Answer
→ updateProjectState()
→ validateCurrentState()
→ inferDesignIntent()
→ checkWizardScope()
→ decideNextQuestion()
→ renderNextStep()
```

---

## 8. 질문 정의 방식

질문은 컴포넌트에 하드코딩하지 않고 데이터로 관리한다.

```ts
export type WizardQuestion = {
  id: string;
  title: string;
  description?: string;
  type: "single_choice" | "multi_choice" | "number" | "text" | "confirm";
  options?: {
    label: string;
    value: string;
    description?: string;
  }[];
  condition?: (state: WizardProjectState) => boolean;
  onAnswer: (state: WizardProjectState, answer: unknown) => WizardProjectState;
  next: (state: WizardProjectState) => string;
};
```

예시:

```ts
export const factoryTypeQuestion: WizardQuestion = {
  id: "factory_type",
  title: "이 프로젝트는 어떤 구조물인가요?",
  type: "single_choice",
  options: [
    { label: "일반 공장", value: "general" },
    { label: "창고 / 물류창고", value: "warehouse" },
    { label: "천장크레인이 있는 공장", value: "crane" },
    { label: "공장 + 사무실 / 중이층", value: "mezzanine" },
    { label: "단순 캐노피 / 증축 구조", value: "canopy" }
  ],
  onAnswer: (state, answer) => ({
    ...state,
    factory: {
      ...state.factory,
      category: answer as WizardProjectState["factory"]["category"]
    },
    crane: {
      ...state.crane,
      enabled: answer === "crane"
    }
  }),
  next: (state) => {
    if (state.factory.category === "crane") return "crane_capacity";
    return "factory_template";
  }
};
```

---

## 9. Wizard 전체 흐름

### Phase 0. 프로젝트 유형 판단

질문:

```text
이 프로젝트는 어떤 구조물인가요?
```

선택지:

```text
A. 일반 공장
B. 창고 / 물류창고
C. 천장크레인이 있는 공장
D. 공장 + 사무실 / 중이층
E. 단순 캐노피 / 증축 구조
```

### Phase 1. 프로젝트 목적 판단

질문:

```text
이 모델은 어떤 용도에 가깝나요?
```

선택지:

```text
A. 빠른 개략 모델 생성
B. 입찰 / 제안용 구조 검토
C. 기본설계 수준의 구조 모델
D. Gen NX 상세 모델링 전 초기 모델
```

내부 매핑:

| 선택 | Wizard Mode |
|---|---|
| A | concept |
| B | proposal |
| C | basic_design |
| D | gen_pre_model |

### Phase 2. 위치 / 기준 선택

질문:

```text
프로젝트 위치를 선택해주세요.
```

선택지:

```text
1단계 縣市 선택 (예: 臺北市 / 新北市 / 臺中市 / 臺南市 / 高雄市 … 전체 목록)
2단계 鄉鎮市區 선택 (선택한 縣市의 목록)
3단계 지반 분류 (第一類 / 第二類 / 第三類, 모르면 第二類 권장 안내)
```

선택 즉시 `siteCoef(county, town, soil)` 로 SDS·SD1·SMS·SM1 을 채운다 (PlanCard 와 같은 동작). 臺北市·新北市 는 각각 별도 값이며 臺北盆地 鄉鎮 은 微分區 계수, 근단층 鄉鎮 은 경고를 표시한다.

질문:

```text
대만 풍하중/내진 조건은 어떻게 설정할까요?
```

선택지:

```text
A. 위치 기반 기본값 사용
B. 보수적으로 설정
C. 엔지니어가 직접 입력
```

### Phase 3. 공장 횡단면 선택

질문:

```text
공장 단면은 어떤 형태에 가깝나요?
```

선택지:

```text
A. 단일 경간 박공지붕
B. 다경간 박공지붕
C. 단경사 지붕
D. 천장크레인 포함
E. 중이층 포함
```

### Phase 4. 횡단면 치수 입력

질문은 한 번에 묻지 않는다.

```text
Q1. 공장 폭은 얼마인가요?
Q2. 처마 높이는 얼마인가요?
Q3. 지붕 경사는 어떻게 설정할까요?
Q4. 기둥 하부는 어떤 방식에 가깝나요?
```

### Phase 5. 종방향 Bay 확장

질문:

```text
공장 길이는 어떻게 정할까요?
```

선택지:

```text
A. Bay 간격과 Bay 개수로 입력
B. 전체 길이만 입력하고 자동 분할
```

내부 변환:

```ts
const frameCount = bayCount + 1;
```

### Phase 6. 크레인 옵션

크레인이 없는 프로젝트에서는 자동으로 Skip한다.

질문:

```text
천장크레인 용량은 얼마인가요?
```

선택지:

```text
A. 5 ton
B. 10 ton
C. 20 ton
D. 직접 입력
```

### Phase 7. 재료 선택

질문:

```text
강재 재료는 어떻게 설정할까요?
```

선택지:

```text
A. 대만 일반 공장 기본 강재
B. CNS 계열
C. ASTM 계열
D. JIS 계열
E. 직접 입력
```

### Phase 8. 단면 선택

질문:

```text
주요 부재 단면은 어떻게 설정할까요?
```

선택지:

```text
A. 위저드 추천 단면 사용
B. 전체적으로 가볍게 설계
C. 안전 측으로 크게 설계
D. 직접 단면 입력
```

### Phase 9. 하중 설정

질문:

```text
지붕과 벽체 재료는 무엇인가요?
```

선택지:

```text
A. 일반 烤漆浪板
B. Sandwich Panel
C. 기타
```

질문:

```text
활하중은 어떻게 설정할까요?
```

선택지:

```text
A. 일반 공장 기본값
B. 창고 하중 고려
C. 설비하중 있음
D. 직접 입력
```

### Phase 10. 최종 확인

요약 화면:

```text
Project Summary
- Country: Taiwan
- Site: 高雄市 前鎮區 · 第二類地盤 (SDS·SD1 자동)
- Factory Type: Crane Factory
- Template: Single Span Gable Frame
- Width: 24 m
- Eave Height: 8 m
- Bay: 6 m x 10
- Crane: 10 ton
- Main Frame Section: Auto
- Material: Taiwan Default Steel
- Load Mode: Taiwan Default
- Output: Gen NX Model + Report Draft + Quantity Draft
```

버튼:

```text
[Gen NX 모델 생성]
[상세 설정 수정]
[Wizard 범위 확인]
```

---

## 10. 모델 생성 엔진

### 10.1 내부 모델 타입

```ts
export type StructuralModel = {
  nodes: NodeModel[];
  elements: ElementModel[];
  materials: MaterialModel[];
  sections: SectionModel[];
  boundaries: BoundaryModel[];
  loads: LoadModel[];
  loadCombinations: LoadCombinationModel[];
  metadata: {
    codeSet: TaiwanCodeSet;
    templateId: string;
    generatedAt: string;
  };
};
```

### 10.2 생성 순서

```text
1. generateFactoryTemplate()
2. generateCrossSectionNodes()
3. generateMainFrameElements()
4. generateLongitudinalReplication()
5. generatePurlinsAndGirts()
6. generateBracing()
7. generateCraneMembers()
8. generateMaterials()
9. generateSections()
10. generateBoundaryConditions()
11. generateLoads()
12. generateLoadCombinations()
13. mapToMidasGenJson()
```

### 10.3 Generator 책임 분리

위 순서는 **이미 기존 모듈이 수행한다** — Wizard 용 generator 를 새로 만들지 않는다. 크레인(MVP 2)·다경간(MVP 3)은 아래 모듈을 확장한다.

| 책임 | 기존 모듈 |
|---|---|
| Frame별 Node·Element (기둥·지붕보·퍼린·거트·스트럿·풍주·가새) | `src/domain/portal.ts` |
| 단면 (CNS2020 이름 그대로) | `src/domain/types.ts` 기본값 · `src/domain/catalog.ts` |
| 지점조건·단부해제 | `src/domain/gen.ts` |
| 하중 케이스·조합 (풍·지진·13장) | `src/domain/loads.ts` · `src/codes/tw.ts` · `src/codes/twLateral.ts` |
| Gen NX API 페이로드 (순수) | `src/domain/gen.ts` |
| 전송·해석 (자동 저장 포함) | `src/actions/build.ts` · `src/actions/analysis.ts` |

---

## 11. Bracing 자동 배치 규칙

공장형 Steel에서는 Bracing이 매우 중요하다.

MVP에서는 다음 자동 배치만 처리한다.

| 위치 | 자동 배치 |
|---|---|
| 끝에서 두 번째 Bay (양쪽) | Roof X-Bracing |
| 양 측면 벽체 | Wall Vertical Bracing |
| Longitudinal Direction | Tie Member |
| Crane 포함 시 | Crane Runway 방향 보강 옵션 |

기본 규칙:

```ts
// Bay 번호 1..bayCount. 기존 src/domain/portal.ts braceBays 와 같은 규칙.
// 끝 Bay 는 박공 프레임(풍주 지지)과 내부 프레임의 처짐 차로 가새에 중력 축력이 생긴다
// (라이브 샘플 187 kN) → Bay 가 4 개 이상이면 끝에서 두 번째 Bay 에 둔다.
bracingBays = bayCount >= 4
  ? [2, bayCount - 1]
  : [...new Set([1, bayCount])];   // 짧은 건물은 끝 Bay 외 선택지 없음

if (crane.enabled) {
  addCraneLongitudinalBracing = true;
}
```

상세 Bracing 최적화는 MVP에서 제외한다.

---

## 12. 하중 생성 범위

### 12.1 MVP 하중 케이스

케이스 이름·내용은 **기존 `src/domain/loads.ts`(라이브 검증, 15 케이스·55 조합)를 그대로 쓴다**. Wizard 는 케이스를 새로 정의하지 않고 입력값만 채운다.

| Load Case | 설명 |
|---|---|
| D | 자중(BODF) + 지붕·벽 마감 (퍼린·거트·스트럿 선하중) |
| LR | 지붕 활하중 (建築技術規則 構造篇 26조 면적별 표) |
| WX1~WX4 | 횡방향 풍 (MWFRS 표2.4·2.5, 지붕 GCp high/low × 내압 ±GCpi 표2.17) |
| WY1·WY2 | 종방향 풍 (박공벽 풍상·풍하, 내압 ±) |
| WLX·WLY | 횡풍향 풍 2.10 (0.87(L/B)·W_D) |
| WT | 비틀림 풍 2.11 (0.28·max(B·W_D)) |
| EX·EY | 정적 등가 지진 (V = c·W, V_M·V* 하한 포함) |
| ETX·ETY | 우발 비틀림 2.14 (0.05·B⊥·V) |
| CR_V·CR_L·CR_B | 크레인 연직·횡·제동 (MVP 2, 신규) |

조합은 LRFD 2.2(2.2-1~2.2-6) + 풍 2.12(0.841·W_D + 0.7(W_L ± W_T)) + 내진 13장 E′ 조합(13.3-1·13.3-2)·중력 조합(13.6.1). 내압 부호 하나만 가진 단일 `WL_X` 로는 지배 조합을 놓친다. 이름 `WL_X` 는 횡풍향 `WLX` 와 혼동되므로 쓰지 않는다.

### 12.2 하중 입력 UX 원칙

사용자에게 하중 계수를 직접 먼저 묻지 않는다.

먼저 쉬운 질문을 한다.

```text
지붕과 벽체는 일반적인 철판 계열인가요?
```

```text
창고처럼 적재하중이 큰 건물인가요?
```

```text
크레인이 있나요?
```

그 후 내부적으로 기본 하중 세트를 생성한다.

### 12.3 사용자 직접 입력 조건

다음 조건이면 Advanced Mode를 열어준다.

- 설비하중이 큰 경우
- 창고 적재하중이 큰 경우
- 특수 Crane Load가 있는 경우
- 풍하중/지진하중을 엔지니어가 직접 지정하려는 경우
- 프로젝트 인허가 계산서용으로 정확한 법규 계수 입력이 필요한 경우

---

## 13. 결과물 생성 범위

### 13.1 Gen NX API 모델

생성 대상:

- Node
- Element
- Material
- Section
- Boundary
- Load Case
- Load Combination
- Analysis Setting

### 13.2 도면 초안

MVP 도면 범위:

| 도면 | 수준 |
|---|---|
| 대표 횡단면도 | 자동 생성 |
| 종방향 Frame Layout | 자동 생성 |
| Bracing Layout | 자동 생성 |
| 주요 부재명 표기 | 자동 생성 |
| 접합 상세 | 자동 (주각·처마·마루, DXF 기존 시트) |

### 13.3 계산서 초안

MVP 계산서 범위:

| 항목 | 수준 |
|---|---|
| 프로젝트 개요 | 자동 |
| 적용 기준 | 자동 |
| 구조 시스템 | 자동 |
| 재료 및 단면 | 자동 |
| 하중 조건 | 자동 |
| 해석 결과 요약 | 자동 |
| 부재 검토 요약 | 자동 |
| 상세 접합 계산 | 자동 (기존 계산서 접합부 장 — 주각·처마 13.7.2·마루·가새) |
| 단면 최적화 전후 | 자동 (최적화 실행 시) |

### 13.4 물량산출 초안

MVP 물량 범위:

| 항목 | 수준 |
|---|---|
| Main Column 중량 | 자동 |
| Rafter 중량 | 자동 |
| Brace 중량 | 자동 |
| Purlin / Girt 중량 | 자동 또는 옵션 |
| Crane Beam 중량 | 옵션 |
| Roof Cladding 면적 | 자동 |
| Wall Cladding 면적 | 자동 |
| 총 강재 중량 | 자동 |

---

## 14. Scope Rule 예시

Wizard 범위를 벗어나는 조건을 감지하기 위한 규칙이다.

```ts
export function checkWizardScope(state: WizardProjectState): WizardProjectState["scope"] {
  const warnings: string[] = [];
  const excludedReasons: string[] = [];

  const g = state.geometry;
  // 단경간은 spanWidth, 다경간은 spanWidths — 둘 다 검사. 미입력은 범위 밖이 아니라 '미완료'.
  const spans = g.spanWidths?.length ? g.spanWidths : g.spanWidth != null ? [g.spanWidth] : [];
  if (spans.length === 0) {
    warnings.push("Span width not entered yet.");
  } else if (spans.some((w) => !(w > 0))) {
    excludedReasons.push("Span width must be positive.");
  } else if (spans.some((w) => w > 60)) {
    excludedReasons.push("Span width exceeds MVP wizard range (60 m per span).");
  }

  if (state.factory.category === "canopy") {
    excludedReasons.push("Canopy (open structure) has no wizard template.");
  } else if (state.factory.category && !state.factory.templateId) {
    warnings.push("Template not selected yet.");
  }

  if (state.geometry.bayCount && state.geometry.bayCount > 30) {
    warnings.push("Large bay count. Gen NX expert review is recommended.");
  }

  if (state.factory.templateId === "mezzanine_factory") {
    warnings.push("Mezzanine design requires additional floor load and connection review.");
  }

  if (state.crane.enabled && state.crane.capacityTon && state.crane.capacityTon > 20) {
    warnings.push("Heavy crane load should be reviewed by a structural engineer.");
  }

  return {
    isWithinWizardScope: excludedReasons.length === 0,
    warnings,
    excludedReasons
  };
}
```

---

## 15. MVP 개발 우선순위

### MVP 1: Single Span Gable Factory

포함 기능:

```text
1. 위치 선택
2. 공장 타입 선택
3. 단일 경간 박공지붕 선택
4. 폭 / 처마높이 / 지붕경사 입력
5. Bay 간격 / Bay 개수 입력
6. 기본 H형강 단면 추천
7. 기본 Purlin / Girt 생성
8. 기본 Bracing 생성
9. 기본 하중 생성
10. Gen NX API JSON 생성
11. 물량산출 초안
```

### MVP 2: Crane Factory Option

추가 기능:

```text
1. 크레인 용량 입력
2. Crane Runway Beam 생성
3. Crane Bracket 개념 반영
4. Crane Load 생성
5. Crane Beam 물량산출
```

### MVP 3: Multi Span Factory

추가 기능:

```text
1. 다경간 입력
2. 내부 기둥 생성
3. Valley / Gutter 위치
4. 다중 지붕면 하중 분배
```

---

## 16. 개발자가 반드시 기억해야 할 문장

```text
이 제품은 모든 철골 구조물을 자동 설계하는 프로그램이 아니다.
```

```text
이 제품은 대만 공장형 철골 구조물의 대표 횡단면을 대화형으로 확정하고,
이를 종방향 Bay로 반복 확장하여 Gen NX API 모델을 생성하는 Wizard이다.
```

```text
쉬운 것은 Wizard가 처리하고,
복잡한 것은 Gen NX 전문가의 영역으로 남긴다.
```

```text
사용자에게는 쉬운 질문을 던지고,
내부에서는 구조설계 파라미터로 변환한다.
```

---

## 17. 후속 개발 산출물 제안

다음 단계에서는 이 문서를 기준으로 아래 산출물을 추가 작성하는 것이 좋다.

1. `src/agent/wizard.ts` 상세 질문 목록 (데이터, 문구는 i18n 키 — 4개 언어)
2. 질문 답 → `Spec`(`src/domain/types.ts`) 변환 규칙
3. `src/domain/scope.ts` Wizard 범위 규칙 (14장)
4. `src/components/Wizard.tsx` 화면 (story 셸 app.css 클래스)
5. 크레인 확장: `portal.ts` 런웨이 보·브래킷, `loads.ts` CR_V·CR_L·CR_B
6. 다경간 확장: `portal.ts` 내부 기둥·골, `loads.ts` 지붕면 하중 분배
7. 물량산출 Excel 내보내기 (`src/domain/schedule.ts` 기반)

이미 있는 것 (새로 만들지 않음): 노드·요소 생성(`portal.ts`), 대만 코드 매핑(`codes/tw*.ts`), Gen 페이로드(`gen.ts`), 계산서(`report/report.ts`), DXF(`drawing/`).
