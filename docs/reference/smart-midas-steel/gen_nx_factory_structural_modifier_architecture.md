# Gen NX API 기반 Factory Steel Structural Modifier Architecture

## 1. 목적

본 문서는 공장형 철골 구조 Wizard에서 다음 기능을 Gen NX API와 연동하여 자동화하기 위한 개발 Architecture를 정의한다.

- 천장크레인
- 메자닌
- 설비층
- 다경간
- 연결동
- 큰 개구부

핵심 원칙:

> 각 기능을 별도의 특수 API로 생각하지 않고, 기본 Factory Structural Model에 적용되는 Structural Modifier로 다룬다.

```text
User Wizard
    ↓
Factory Base Model
    ↓
Structural Modifier Engine
    ├─ MultiSpanModifier
    ├─ CraneModifier
    ├─ MezzanineModifier
    ├─ EquipmentFloorModifier
    ├─ LinkBuildingModifier
    └─ OpeningModifier
    ↓
Semantic Structural Model
    ↓
Validation
    ↓
Gen NX API Compiler
    ↓
NODE / ELEM / MATL / SECT / Boundary / Load / Mass / Combination
```

## 2. 가장 중요한 설계 원칙

Wizard Answer를 바로 MIDAS API JSON으로 변환하지 않는다.

잘못된 구조:

```text
User Click
→ /db/NODE
→ User Click
→ /db/ELEM
→ User Click
→ /db/LOAD
```

권장 구조:

```text
Wizard Input
↓
Semantic Structural Model
↓
Validation
↓
Gen NX Model Compiler
↓
MIDAS API JSON
```

## 3. Base Factory Model

예:

```text
Single Gable
Span = 24 m
Eave Height = 8 m
Bay Spacing = 6 m
Bay Count = 10
```

권장 내부 모델:

```ts
interface StructuralModel {
  buildings: Building[];
  frames: Frame[];
  platforms: Platform[];
  openings: Opening[];
  cranes: CraneSystem[];
  connections: BuildingConnection[];

  nodes: StructuralNode[];
  members: StructuralMember[];

  materials: Material[];
  sections: Section[];

  boundaries: Boundary[];
  loads: StructuralLoad[];
  masses: StructuralMass[];
}
```

이후 기능은 Base Model 위에 Modifier 형태로 적용한다.

```ts
applyCraneModifier(model, craneOptions);
applyMezzanineModifier(model, mezzanineOptions);
applyOpeningModifier(model, openingOptions);
```

## 4. Modifier Architecture

```ts
interface StructuralModifier<T> {
  validate(
    model: StructuralModel,
    options: T
  ): ValidationResult;

  apply(
    model: StructuralModel,
    options: T
  ): StructuralModel;

  getRequiredInputs(): WizardQuestion[];

  getWarnings(): DesignWarning[];
}
```

예:

```ts
class CraneModifier
  implements StructuralModifier<CraneOptions> {

  validate() {}
  apply() {}
  getRequiredInputs() {}
  getWarnings() {}
}
```

같은 방식으로:

```ts
class MezzanineModifier {}
class EquipmentPlatformModifier {}
class LinkBuildingModifier {}
class LargeOpeningModifier {}
class MultiSpanModifier {}
```

를 구성한다.

## 5. 다경간 — Geometry Generator

다경간은 Modifier라기보다 Base Geometry Parameter에 가깝다.

```text
경간 수:
[1] [2] [3] [직접 입력]
```

예:

```ts
spans = [
  { width: 20 },
  { width: 24 },
  { width: 20 }
];
```

Node 좌표:

```text
X0 = 0
X1 = 20
X2 = 44
X3 = 64
```

횡단면:

```text
     /\          /\          /\
    /  \        /  \        /  \
   │    │      │    │      │    │
───┴────┴──────┴────┴──────┴────┴──
0       20          44          64
```

Gen NX에서는 결국 다음으로 변환한다.

```text
NODE
ELEM
SECT
MATL
Boundary
```

내부기둥 상부 Pin 또는 Rigid 여부는 Beam End Release 등의 Boundary 정보로 표현한다.

## 6. 천장크레인 — Geometry + Load Modifier

천장크레인은 반드시 다음 두 부분으로 분리한다.

```text
Crane Geometry
+
Crane Load
```

### 6.1 Crane Geometry

Wizard 입력:

```text
천장크레인이 있습니까?
→ Yes

용량?
→ 10 ton

Runway Elevation?
→ 6.5 m
```

기존 Column:

```text
8m ●
   │
   │
   │
0m ●
```

Crane 적용 후:

```text
8m   ●
     │
6.5m ●──── Runway Beam
     │
     │
0m   ●
```

기존 Column 하나를 다음처럼 분할한다.

```text
Column Upper
Column Lower
Crane Bracket
Runway Beam
```

### 6.2 Crane Load

최종 설계 수준에서는 다음 정보가 필요하다.

- Maximum Wheel Load
- Minimum Wheel Load
- Wheel Spacing
- Crane Self Weight
- Trolley Weight
- Lateral Force
- Longitudinal Braking Force

주의:

> Crane capacity 10 ton 정보만으로 최종 설계 Wheel Load를 확정하면 안 된다.

권장 Mode:

```text
Concept Design
→ Template Load

Final Design
→ Manufacturer Wheel Load Required
```

초기 MVP에서는 Moving Load 전체 자동화보다 Critical Load Position Case 생성이 현실적이다.

```text
CRANE_MAX_LEFT
CRANE_MAX_RIGHT
CRANE_LATERAL_X
CRANE_BRAKE_Y
```

## 7. Mezzanine — Local Floor Generator

메자닌은 건물 층 하나를 추가하기보다 특정 영역에 Local Floor를 추가하는 방식으로 정의한다.

Wizard 입력:

```text
메자닌이 있습니까?
→ Yes

위치?
[좌측]
[우측]
[전체]
[Bay 선택]

높이?
→ 4.0 m
```

```text
              /\
             /  \
            /    \
           │      │
           │──────│
           │      │
───────────┴──────┴──────
```

내부 데이터:

```ts
mezzanine = {
  elevation: 4.0,
  xRange: [0, 8],
  bayRange: [1, 4]
};
```

Generator 동작:

```text
1. Column에 Mezzanine Level Node 삽입
2. Column Element 분할
3. Mezzanine Beam 생성
4. Secondary Beam 생성
5. 필요 시 Plate / Slab 생성
6. Floor Load 생성
7. Mass 반영
```

## 8. 설비층 — Local Platform Engine 재사용

설비층은 Mezzanine과 별도 Geometry Engine을 만들 필요가 없다.

공통:

```text
LocalPlatformGenerator
```

를 재사용한다.

적용 대상:

```text
Mezzanine
Equipment Platform
Maintenance Platform
Office Platform
```

예:

```ts
platform: {
  type: "equipment",
  elevation: 5.5,
  bayRange: [3, 5],
  widthRange: [0, 12],
  floorLoad: 7.5,
  equipmentLoads: []
};
```

## 9. 설비층과 Mezzanine의 차이 — Load Definition

### Mezzanine Load

```text
Floor Dead Load
Floor Live Load
Partition Load
```

### Equipment Floor Load

```text
Platform Dead Load
Equipment Point Load
Equipment Mass
Pipe Load
Maintenance Live Load
```

내진해석 시 Equipment 중량은 Mass에 반영해야 한다.

Wizard:

```text
설비 중량이 있습니까?

[없음]
[균등하게 분포]
[장비별 입력]
```

## 10. 연결동 — Connectivity Modifier

연결동은 단순 Beam 연결로 처리하면 안 된다.

```text
Building A        Building B

┌───────┐        ┌───────┐
│       │========│       │
│       │ Link   │       │
│       │ Bridge │       │
└───────┘        └───────┘
```

먼저 연결 성격을 묻는다.

```text
연결동은 어떻게 움직입니까?

A. 양쪽 건물과 일체형
B. 한쪽 고정 + 한쪽 이동
C. 양쪽 건물 변위 허용
D. 잘 모르겠음
```

### 10.1 일체형

```text
Beam / Truss Element
```

로 직접 연결.

### 10.2 한쪽 Fixed + 한쪽 Sliding

```text
Building A
FIX ───────── SLIDE
                   Building B
```

Gen NX에서는 다음 요소로 확장 가능하다.

```text
Release
Elastic Link
General Link
Rigid Link
```

### 10.3 구조적으로 독립

Expansion / Seismic Joint 성격이면 자동 연결하지 않는다.

```text
Expert Review Required
```

## 11. 큰 개구부 — Topology Modifier

큰 개구부는 최소 3가지로 구분한다.

```text
1. Wall Opening
2. Floor Opening
3. Roof Opening
```

## 12. Wall Opening

공장에서는 Roller Door 등 큰 벽체 개구부가 대표적이다.

```text
│────────────────────│
│                    │
│      ┌────────┐    │
│      │  Door  │    │
│      │        │    │
│──────┴────────┴────│
```

Generator:

```ts
applyWallOpening({
  bay: 3,
  width: 6,
  height: 5
});
```

동작:

```text
Girt 삭제 또는 분할
Jamb Column 생성
Header Beam 생성
Cladding Load 재분배
Wind Area 수정
```

## 13. Floor Opening

```text
┌─────────────────┐
│                 │
│    ┌───────┐    │
│    │ VOID  │    │
│    └───────┘    │
│                 │
└─────────────────┘
```

처리:

```text
Plate / Slab 요소 생성 제외
+
Opening Perimeter Beam 생성
```

## 14. Roof Opening

대상:

```text
Skylight
Ventilator
Equipment Opening
Roof Hatch
```

작은 개구부는 구조 모델에서 생략 가능하다.

큰 개구부는:

```text
Purlin Interruption
Opening Framing
Wind Load Region Adjustment
```

를 처리한다.

Wizard:

```text
개구부 크기

[소형 → 구조 모델 생략]
[대형 → Opening Frame 생성]
```

## 15. 기능별 내부 Engine 분류

| 기능 | 내부 엔진 | 난이도 |
|---|---|---:|
| 다경간 | Geometry Generator | ★ |
| 메자닌 | Local Platform Modifier | ★★ |
| 설비층 | Local Platform + Load Modifier | ★★ |
| 천장크레인 | Geometry + Load Modifier | ★★★ |
| 큰 개구부 | Topology Modifier | ★★★ |
| 연결동 | Connectivity Modifier | ★★★★ |

## 16. Gen NX API Compiler

Modifier 적용 후 `StructuralModel`을 Gen NX API 데이터로 변환한다.

```ts
compileToMidas(model);
```

변환 개념:

```text
StructuralNode
→ NODE

StructuralMember
→ ELEM

Material
→ MATL

Section
→ SECT

Support
→ Boundary

Member Release
→ Beam End Release

Load
→ Nodal Load / Beam Load / Floor Load

Mass
→ Nodal Mass / Load to Mass
```

## 17. Analysis Result Flow

```text
Gen NX Analysis
↓
POST / TABLE
↓
Result Parser
↓
Wizard Result
```

결과 예:

```text
Crane Beam
→ M / V / Deflection

Mezzanine
→ Beam Utilization
→ Floor Deflection

Equipment Floor
→ Column Axial Force
→ Seismic Mass

Link Building
→ Relative Displacement
→ Connection Force

Opening
→ Perimeter Beam Force
```

## 18. 권장 개발 순서

### Phase 1

```text
Single / Multi Span
↓
Mezzanine
↓
Equipment Platform
```

### Phase 2

```text
Large Opening
↓
Crane
```

### Phase 3

```text
Link Building
```

연결동은 다음 문제가 있어 마지막 구현이 좋다.

```text
Relative Displacement
Seismic Behavior
Joint Type
Link Property
Expansion Gap
```

## 19. 권장 폴더 구조

```text
src/features/factory-steel/

├── model/
│   ├── structuralModel.ts
│   ├── building.ts
│   ├── frame.ts
│   ├── member.ts
│   ├── load.ts
│   └── mass.ts
│
├── modifiers/
│   ├── multiSpan/
│   │   └── MultiSpanModifier.ts
│   ├── crane/
│   │   └── CraneModifier.ts
│   ├── mezzanine/
│   │   └── MezzanineModifier.ts
│   ├── equipment-platform/
│   │   └── EquipmentPlatformModifier.ts
│   ├── opening/
│   │   ├── WallOpeningModifier.ts
│   │   ├── FloorOpeningModifier.ts
│   │   └── RoofOpeningModifier.ts
│   └── link-building/
│       └── LinkBuildingModifier.ts
│
├── validation/
│   ├── geometryValidator.ts
│   ├── modifierValidator.ts
│   └── scopeValidator.ts
│
├── generators/
│   ├── generateNodes.ts
│   ├── generateMembers.ts
│   ├── generateLoads.ts
│   └── generateMasses.ts
│
└── midas/
    ├── compileToMidas.ts
    ├── midasApiClient.ts
    └── resultParser.ts
```

## 20. Scope Boundary

### Wizard 처리 범위

```text
Regular Multi Span
Simple Crane Factory
Simple Mezzanine
Simple Equipment Platform
Simple Large Opening
Simple Link Building
Regular Bay Repetition
```

### Expert / Gen NX 영역

```text
Heavy Crane
Irregular Equipment Support
Nonlinear Link Building
Complex Seismic Joint
Irregular Roof Opening
Complex Plant Structure
Special Connection Analysis
Non-regular Bay Geometry
```

범위를 초과하면:

```text
이 프로젝트는 자동 Wizard 범위를 초과합니다.
Gen NX에서 직접 모델링하거나 전문가 검토를 권장합니다.
```

## 21. 최종 Architecture

```text
Factory Base Model
       │
       ├─ Multi Span
       ├─ + Crane
       ├─ + Mezzanine
       ├─ + Equipment Platform
       ├─ + Large Opening
       └─ + Link Building
               ↓
        Semantic Structural Model
               ↓
            Validation
               ↓
         Gen NX API Compiler
               ↓
        Gen NX Analysis / Design
               ↓
           Result Parser
               ↓
             Wizard
```

## 22. 핵심 결론

천장크레인, 메자닌, 설비층, 다경간, 연결동, 큰 개구부를 각각 별도 프로그램으로 구현하지 않는다.

모두 하나의:

> **Factory Base Structural Model + Structural Modifier**

Architecture로 처리한다.

가장 중요한 개발 우선순위는 Gen NX API Endpoint를 많이 호출하는 것이 아니라, 먼저 다음 중간 계층을 안정적으로 만드는 것이다.

> **Semantic StructuralModel**

이 계층이 잘 설계되면 이후 다음 기능도 같은 방식으로 확장할 수 있다.

```text
Canopy
Pipe Rack
Rooftop Equipment
Solar Panel
Crane Extension
Factory Expansion
Additional Platform
Maintenance Deck
```

즉, Gen NX API는 제품의 중심 로직이 아니라 최종 StructuralModel을 해석 모델로 변환하는 **Compiler Layer**로 두는 것이 가장 유지보수성이 높다.
