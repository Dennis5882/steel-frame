# Taiwan & China Factory Steel Cross-Section Wizard

> 아카이브 · 2026-10-19 정리. 과거 계획·구현·검증 기록입니다. 당시 미완료 항목이 모두 완료됐다는 뜻은 아닙니다. 현재 상태는 [현황](../../current-status.md), 남은 과제는 [로드맵](../../roadmap.md)을 우선 확인하세요.
## 개발 기획 문서

## 1. 목적

본 문서는 대만(Taiwan) 및 중국 본토(China Mainland)용 공장형 철골구조 위저드의 **횡단면 선택 및 자동 모델링 로직**을 정의한다.

핵심 철학은 다음과 같다.

> 공장형 철골 구조물은 일반 RC 건축물처럼 평면과 층을 먼저 만드는 방식보다,  
> **대표 횡단면(Cross Section)을 먼저 확정한 뒤 종방향 Bay로 반복 확장하는 방식**이 적합하다.

따라서 위저드는 다음 순서로 동작한다.

```text
Country / Project Context
→ Factory Cross-Section Type
→ Geometry Parameters
→ Modifiers
→ Longitudinal Bay Replication
→ Material / Section
→ Boundary
→ Load / Wind / Seismic
→ Gen NX API Model
```

## 2. 공통 모델링 철학

### RC 일반 건물

```text
Floor Plan
→ Grid
→ Story
→ Column / Beam / Wall
→ Load
→ Analysis
```

### Steel 공장형 구조

```text
Cross Section
→ Main Frame Geometry
→ Longitudinal Bay Count / Spacing
→ Frame Replication
→ Bracing / Purlin / Girt
→ Crane / Mezzanine / Side Extension
→ Load
→ Analysis
```

공장형 Steel Wizard의 기준 객체는 `Floor`가 아니라 `Frame Section`이다.

## 3. 공통 Base Template

대만과 중국은 공장형 철골구조의 기본 횡단면 자체는 크게 다르지 않다.  
따라서 Geometry Engine은 공용으로 구현하고, 국가별 기준은 Rule Pack으로 분리한다.

```text
Factory Geometry Engine
├─ Single Span Gable
├─ Multi Span Gable
├─ Mono Slope
├─ Multi Gable
├─ Truss Roof
└─ Optional Side Extension
```

## 4. Base Template 01 — Single Span Gable Portal Frame

- Taiwan UI: `單跨雙坡門式剛架`
- China UI: `单跨双坡门式刚架`

```text
              Ridge
                ▲
               / \
              /   \
             /     \
            /       \
           │         │
           │         │
───────────┴─────────┴──────────
```

적용:
- 일반 공장
- 창고
- 물류시설
- 소·중규모 제조시설

핵심 파라미터:

```ts
{
  spanWidth: number;
  eaveHeight: number;
  roofSlope: number;
  baySpacing: number;
  bayCount: number;
}
```

MVP 우선순위: `★★★★★`

## 5. Base Template 02 — Multi Span Gable Portal Frame

- Taiwan UI: `多跨雙坡門式剛架`
- China UI: `多跨双坡门式刚架`

```text
         ▲               ▲
        / \             / \
       /   \           /   \
      /     \_________/     \
     │         │         │
     │         │         │
─────┴─────────┴─────────┴─────
```

핵심 파라미터:

```ts
{
  spanCount: number;
  spanWidths: number[];
  eaveHeight: number;
  roofSlope: number;
  baySpacing: number;
  bayCount: number;
}
```

적용:
- 중대형 공장
- 대형 물류창고
- 대형 생산시설

MVP 우선순위: `★★★★★`

## 6. Base Template 03 — Mono Slope Portal Frame

- Taiwan UI: `單坡門式剛架`
- China UI: `单坡门式刚架`

```text
        High Side
           │
           │\
           │ \
           │  \
           │   \
           │    │
───────────┴────┴────────
```

적용:
- 기존 공장 옆 증축
- 소형 창고
- 설비동
- 부속동
- 캐노피

핵심 파라미터:

```ts
{
  spanWidth: number;
  highEaveHeight: number;
  lowEaveHeight: number;
  roofSlope?: number;
  baySpacing: number;
  bayCount: number;
}
```

MVP 우선순위: `★★★★☆`

## 7. Base Template 04 — Multi Span Multi Gable

- Taiwan UI: `多跨多坡門式剛架`
- China UI: `多跨多坡门式刚架`

```text
        /\        /\        /\
       /  \      /  \      /  \
      /    \    /    \    /    \
     │      │  │      │  │      │
─────┴──────┴──┴──────┴──┴──────┴────
```

특징: 각 Span별로 별도의 Ridge가 존재한다.

적용:
- 대형 제조시설
- 폭이 큰 공장
- 배수계획이 중요한 경우

MVP 우선순위: `★★★☆☆`

## 8. Base Template 05 — Truss Roof Factory

- Taiwan UI: `鋼桁架屋頂廠房`
- China UI: `钢桁架屋顶厂房`

```text
              ▲
             / \
        ____/___\____
       /\/\/\/\/\/\/\
      │              │
      │              │
──────┴──────────────┴──────
```

적용:
- 장경간 공장
- 대형 물류/정비공장
- 특수 제조시설

MVP 우선순위: `★★☆☆☆`

## 9. Modifier 개념

다음 항목은 별도 Template으로 만들지 않고 Base Template 위에 추가되는 Modifier로 구현한다.

```text
Base Template
+
Modifier
```

예:

```text
Single Span
+ Crane
+ Mezzanine
+ Right Side Extension
```

## 10. Modifier 01 — Crane System

- Taiwan UI: `天車`
- China UI: `桥式起重机 / 行车`

```text
              /\
             /  \
            /    \
           │      │
      ┌────┤      ├────┐
      │    ●======●    │
      │                 │
──────┴─────────────────┴──────
```

입력:

```ts
crane: {
  enabled: boolean;
  capacityTon?: number;
  runwayElevation?: number;
  craneSpan?: number;
  runwayBeamSection?: string;
}
```

권장 MVP 옵션:

```text
없음
5 ton
10 ton
20 ton
직접 입력
```

처리 항목:
- Crane Runway Beam
- Column Bracket / 牛腿
- Vertical Wheel Load
- Lateral Crane Load
- Longitudinal Braking Load
- 필요 시 Column Base 조건 재검토

## 11. Modifier 02 — Mezzanine

- Taiwan UI: `夾層`
- China UI: `夹层`

```text
              /\
             /  \
            /    \
           │      │
           │ ─────┤
           │      │
───────────┴──────┴────────
```

```ts
mezzanine: {
  enabled: boolean;
  side?: "left" | "right" | "both" | "custom";
  elevation?: number;
  bayRange?: number[];
}
```

## 12. Modifier 03 — Side Extension / Lean-to

- Taiwan UI: `側跨增建 / 單坡附加跨`
- China UI: `毗屋 / 侧跨`

```text
            /\
           /  \
          /    \
         │      │\
         │      │ \
─────────┴──────┴──┴────
```

```ts
sideExtension: {
  left?: {
    enabled: boolean;
    width?: number;
    eaveHeight?: number;
    roofSlope?: number;
  };
  right?: {
    enabled: boolean;
    width?: number;
    eaveHeight?: number;
    roofSlope?: number;
  };
}
```

## 13. Taiwan vs China — 횡단면 비교

결론적으로 Geometry 자체는 대부분 공용화 가능하다.

```text
공용화 가능 범위: 약 80~90%
```

| 항목 | Taiwan | China |
|---|---|---|
| Single Span Gable | 매우 일반적 | 매우 일반적 |
| Multi Span Gable | 일반적 | 매우 일반적 |
| Mono Slope | 일반적 | 일반적 |
| Multi Gable | 있음 | 매우 일반적 |
| Lean-to / Side Extension | 있음 | 매우 일반적 |
| Crane Factory | 매우 중요 | 매우 중요 |
| Mezzanine | 있음 | 있음 |
| Truss Factory | 있음 | 있음 |
| Tapered Portal Member | 사용 가능 | 특히 중요 |

## 14. 중국에서 중요한 차이 — Tapered Section

중국 공장형 Portal Frame에서는 `变截面焊接H型钢`가 특히 중요하다.

China UI:

```text
主刚架截面形式

[自动推荐]
[等截面 H型钢]
[变截面 焊接H型钢]
```

TypeScript 예시:

```ts
type PortalMemberSection =
  | {
      type: "prismatic";
      sectionName: string;
    }
  | {
      type: "tapered_welded_i";
      depthStart: number;
      depthEnd: number;
      flangeWidth: number;
      webThickness: number;
      flangeThickness: number;
    };
```

중국 버전에서는 MVP부터 고려하는 것을 권장한다.

## 15. 중국 대표 Preset 활용

중국 버전은 표준화된 대표 치수를 Preset으로 제공하기 좋다.

예:

```text
Span
[18m] [21m] [24m] [27m] [30m] [36m]

Bay Spacing
[6m] [7.5m] [9m]

Eave Height
[4.8m] [6m] [8.4m]
```

## 16. Crane Factory — 국가별 UX 차이

### Taiwan

```text
천장크레인이 있습니까?

[없음]
[있음]
```

### China

```text
是否设置桥式起重机？

[无]
[5t以下]
[5~20t]
[20t以上 → Expert Mode]
```

중국 Wizard에서는 Crane 여부에 따라 다음 항목을 별도 검토하도록 한다.

```text
Column Type
Base Condition
Runway Beam
Bracket
Horizontal Crane Load
Bracing Requirement
```

## 17. 국가별 Rule Pack Architecture

```text
Factory Wizard Core

├── Geometry Engine
│   ├── Single Gable
│   ├── Multi Span
│   ├── Mono Slope
│   ├── Multi Gable
│   ├── Truss
│   └── Side Extension
│
├── Modifier Engine
│   ├── Crane
│   ├── Mezzanine
│   └── Side Extension
│
└── Country Rule Pack
    ├── Taiwan
    └── China
```

## 18. Taiwan Rule Pack 예시

```ts
const taiwanRulePack = {
  country: "TW",
  locale: "zh-TW",

  codes: {
    steel: "鋼構造建築物鋼結構設計技術規範",
    foundation: "建築物基礎構造設計規範",
    construction: "鋼構造建築物鋼結構施工規範",
    seismic: "建築物耐震設計規範及解說",
    wind: "建築物耐風設計規範及解說",
  },

  terminology: {
    crane: "天車",
    mezzanine: "夾層",
    sideExtension: "側跨增建",
  }
};
```

## 19. China Rule Pack 예시

```ts
const chinaRulePack = {
  country: "CN",
  locale: "zh-CN",

  codes: {
    steel: "GB 50017",
    portalFrame: "GB 51022",
    seismic: "GB 50011",
    load: "GB 50009"
  },

  terminology: {
    crane: "桥式起重机",
    mezzanine: "夹层",
    sideExtension: "毗屋",
  },

  taperedSectionRecommended: true
};
```

## 20. 권장 Wizard UX

### Step 1 — Country

```text
프로젝트 지역을 선택해주세요.

[Taiwan 台灣]
[China 中国大陆]
```

### Step 2 — Base Cross Section

```text
어떤 형태의 공장입니까?

1. Single Span Gable
2. Multi Span Gable
3. Mono Slope
4. Multi Gable
5. Truss
```

### Step 3 — Modifier

```text
추가 조건이 있나요?

□ Crane
□ Mezzanine
□ Left Side Extension
□ Right Side Extension
□ None
```

Taiwan:

```text
□ 天車
□ 夾層
□ 左側增建
□ 右側增建
```

China:

```text
□ 桥式起重机
□ 夹层
□ 左侧毗屋
□ 右侧毗屋
```

## 21. 추천 TypeScript 데이터 모델

```ts
export type CountryCode = "TW" | "CN";

export type FactoryBaseType =
  | "single_gable"
  | "multi_span_gable"
  | "mono_slope"
  | "multi_gable"
  | "truss";

export interface FactoryCrossSection {
  country: CountryCode;

  baseType: FactoryBaseType;

  geometry: {
    spanCount: number;
    spanWidths: number[];
    eaveHeight: number;
    ridgeHeight?: number;
    roofSlope: number;
  };

  modifiers: {
    crane: {
      enabled: boolean;
      capacityTon?: number;
      runwayElevation?: number;
    };

    mezzanine: {
      enabled: boolean;
      side?: "left" | "right" | "both" | "custom";
      elevation?: number;
    };

    sideExtension: {
      left?: {
        enabled: boolean;
        width?: number;
        eaveHeight?: number;
      };

      right?: {
        enabled: boolean;
        width?: number;
        eaveHeight?: number;
      };
    };
  };

  longitudinal: {
    baySpacing: number;
    bayCount: number;
  };

  mainFrame: {
    sectionMode:
      | "auto"
      | "prismatic"
      | "tapered";

    columnSection?: string;
    rafterSection?: string;

    tapered?: {
      column?: {
        depthTop: number;
        depthBottom: number;
      };

      rafter?: {
        depthEave: number;
        depthRidge: number;
      };
    };
  };
}
```

## 22. Geometry → Gen NX Model Flow

```text
Wizard Answer
↓
FactoryCrossSection State
↓
generateCrossSectionNodes()
↓
generateCrossSectionMembers()
↓
replicateFramesByBay()
↓
generateLongitudinalMembers()
↓
generateBracing()
↓
applyModifiers()
↓
applyCountryRules()
↓
generateMaterials()
↓
generateSections()
↓
generateBoundary()
↓
generateLoads()
↓
mapToMidasGenNxApi()
```

## 23. 추천 코드 구조

```text
src/features/factory-steel/

├── geometry/
│   ├── singleGable.ts
│   ├── multiSpanGable.ts
│   ├── monoSlope.ts
│   ├── multiGable.ts
│   └── truss.ts
│
├── modifiers/
│   ├── crane.ts
│   ├── mezzanine.ts
│   └── sideExtension.ts
│
├── country/
│   ├── taiwan/
│   │   ├── rules.ts
│   │   ├── terminology.ts
│   │   ├── materials.ts
│   │   └── defaults.ts
│   │
│   └── china/
│       ├── rules.ts
│       ├── terminology.ts
│       ├── materials.ts
│       └── defaults.ts
│
├── generators/
│   ├── generateNodes.ts
│   ├── generateElements.ts
│   ├── generateBracing.ts
│   ├── generateBoundary.ts
│   └── generateLoads.ts
│
└── midas/
    └── mapToMidasApi.ts
```

## 24. MVP 권장 범위

### Phase 1

공통 Geometry:
```text
1. Single Span Gable
2. Multi Span Gable
3. Mono Slope
```

Modifier:
```text
1. Crane
2. Mezzanine
3. Side Extension
```

국가:
```text
Taiwan
China
```

### Phase 2

```text
Multi Gable
China Tapered Section 고도화
Crane 세부 조건
Preset Recommendation
```

### Phase 3

```text
Truss Roof
Complex Crane
Irregular Geometry
Special Industrial Loads
```

## 25. Wizard Scope Boundary

Wizard 처리:

```text
Regular Factory
Regular Portal Frame
Regular Multi Span
Regular Crane Factory
Simple Mezzanine
Simple Side Extension
Regular Bay Repetition
```

Gen NX Expert 영역:

```text
Complex Plant Structure
Irregular Roof Geometry
Space Frame
Heavy Industrial Crane
Highly Irregular Bracing
Special Seismic System
Complex Connection Analysis
Non-regular Bay Geometry
```

범위를 넘으면:

```text
이 프로젝트는 자동 Wizard 범위를 초과합니다.
Gen NX에서 직접 모델링하는 것을 권장합니다.
```

## 26. 최종 개발 원칙

1. Geometry Engine은 국가별로 나누지 않는다.
2. 국가 차이는 Rule Pack으로 처리한다.
3. Template 개수를 무한히 늘리지 않는다.
4. 중국은 Tapered Section을 높은 우선순위로 구현한다.
5. 구조는 `Shared Factory Geometry Engine + Taiwan Rule Pack + China Rule Pack`으로 가져간다.

## 27. 핵심 결론

대만과 중국 본토의 공장형 철골 구조물은 기본 횡단면 형식에서 큰 차이가 없으므로, **Geometry Engine은 공통으로 개발하는 것이 가장 효율적이다.**

국가별 차이는 다음 영역에 집중된다.

```text
Design Code
Material
Section Database
Terminology
Default Preset
Load Rule
Seismic Rule
Wind Rule
Foundation Rule
Construction Rule
```

따라서 제품 Architecture는:

> **Shared Factory Geometry Engine + Taiwan Rule Pack + China Rule Pack**

구조를 권장한다.

중국 버전에서는 특히:

> **变截面焊接H型钢 / Tapered Portal Member**

기능을 대만보다 높은 우선순위로 구현하는 것이 좋다.
