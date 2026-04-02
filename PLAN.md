# JWForge - 설계 계획서

## 개요

JWForge — Claude Code용 개인 멀티에이전트 오케스트레이션 플러그인.
"만들어줘" 한마디에 **완벽한 이해 → 완벽한 제작 → 자동 테스트**까지 일관된 파이프라인으로 동작한다.

---

## 핵심 철학

- **시작을 제대로 하면 끝이 좋다** — 코딩 전에 요구사항을 완벽히 잡는다
- **질문은 Claude Code 안에서** — 외부 도구 없이 대화만으로 모든 것을 해결
- **팀 기반 멀티에이전트** — Phase 2 이후는 Team으로 병렬/재활용 처리
- **테스트는 선택이 아닌 기본** — 만들면 반드시 검증한다

---

## 팀 생명주기

```
Phase 1 완료
    ↓
TeamCreate("jwforge-{task}")
    ├── Architect (opus)   ← 설계 + 재설계 담당, 파이프라인 끝까지 유지
    └── Reviewer  (opus)   ← Phase 4 리뷰 담당, 파이프라인 끝까지 유지

Phase 3 진입 시 (레벨별 추가)
    ├── +Executor-A (sonnet/opus)
    ├── +Executor-B (sonnet/opus)
    └── ...

Phase 4 진입 시 (파일별 추가)
    ├── +Analyzer-1 (sonnet)
    ├── +Analyzer-2 (sonnet)
    └── ...  → Reviewer (기존 teammate) 활용

Phase 4 완료
    ↓
TeamDelete
```

---

## 파이프라인 (4단계)

### Phase 1: Deep Interview (깊은 이해)

사용자가 태스크를 던지면 바로 코딩하지 않는다.
트리거: `/deep <태스크 설명>`

**모델 정책:**
- Phase 1은 현재 세션 모델 그대로 사용 (사용자가 직접 모델 선택)
- 더 높은 품질을 원한다면 opus 모드에서 `/deep` 실행 권장
- Phase 2 이후는 팀 에이전트의 `model` 파라미터로 모델 보장

**Conductor 컨텍스트 관리:**
- Conductor는 메인 스킬 세션 자체 (최상위 레이어)
- 각 Phase 결과는 파일로 저장하여 컨텍스트 절약 (task-spec.md, architecture.md)
- 팀 에이전트에게는 필요한 정보만 파일 경로+요약으로 전달, 원문 전달 안 함

#### Step 1-1: 태스크 분류 (Conductor)

태스크 입력을 받으면 즉시 분류한다.

**태스크 타입:**
| 타입 | 설명 | 질문 강도 |
|------|------|----------|
| `new-feature` | 새로운 기능 구현 | 높음 (2~3 라운드) |
| `bug-fix` | 버그 수정 | 중간 (1~2 라운드) |
| `refactor` | 리팩토링 | 중간 (1~2 라운드) |
| `config` | 설정/환경 변경 | 낮음 (1 라운드) |
| `docs` | 문서 작성 | 낮음 (1 라운드) |

**복잡도 판정:**
| 등급 | 기준 | 질문 라운드 | 모드 |
|------|------|-----------|------|
| S (Simple) | 단일 파일, 명확한 요구 | 0~1 | Phase 2 스킵, Executor 1개 |
| M (Medium) | 2~5 파일, 일부 모호함 | 1~2 | 기본 설계 |
| L (Large) | 6+ 파일, 설계 필요 | 2~3 | 상세 설계 |
| XL (Complex) | 아키텍처 변경, 다수 모듈 | 3+ | 풀 설계 + 사용자 승인 |

#### Step 1-2: 컨텍스트 수집 (haiku 병렬)

태스크 분류와 동시에 코드베이스를 분석한다.

**복잡도별 haiku 스폰 수:**
| 복잡도 | haiku 수 |
|--------|---------|
| S | 스킵 또는 1개 (code-finder만) |
| M | 2개 (structure-scanner + code-finder) |
| L | 4개 (전체) |
| XL | 4개 (전체) |

**빈 프로젝트 감지:**
- 소스 파일(`.ts/.js/.py/.go/.rs/.java/.cpp` 등)이 0개 → 빈 프로젝트로 판정
- 빈 프로젝트 → 컨텍스트 수집 스킵 + 질문 강도 한 단계 올림

**haiku 에이전트 역할:**
| 에이전트 | 역할 | 필수 섹션 |
|---------|------|---------|
| structure-scanner | 프로젝트 구조 | `entry_points`, `directories`, `conventions` |
| code-finder | 관련 코드 탐색 | `direct_matches`, `indirect_matches`, `no_match` |
| pattern-analyzer | 패턴/컨벤션 | `style`, `patterns`, `anti_patterns` |
| dependency-scanner | 의존성/설정 | `runtime_deps`, `dev_deps`, `configs`, `constraints` |

**haiku 보고서 표준 포맷:**
```markdown
## Report: {agent-role}
- task: {분석한 태스크 요약}
- confidence: high | medium | low
- relevance: {태스크와의 관련도 한 줄}
```

**haiku 실패 처리:**
| 상황 | 대응 |
|------|------|
| confidence: low | 해당 haiku 1회 재시도 |
| 재시도 후에도 low | 최대 3회, 그래도 실패 시 빈 값으로 진행 |
| 4개 중 2개 이상 실패 | 남은 결과로 진행, 부족한 정보는 질문 단계에서 보충 |

#### Step 1-3: 구조화된 질문 (Conductor)

컨텍스트 수집 결과 + 태스크 분류를 종합하여 질문을 생성한다.

**질문 카테고리 (우선순위 순):**
| 순위 | 카테고리 | 스킵 가능 |
|------|---------|----------|
| 1 | 기능 범위 (blocking) | 불가 |
| 2 | 기술 제약 | 컨텍스트로 유추 가능 시 |
| 3 | 엣지 케이스 | M 이상만 |
| 4 | 품질 기준 | 기존 패턴 따를 시 |
| 5 | 우선순위 | L 이상만 |

**질문 규칙:**
- 한 라운드에 최대 5개 질문
- 형식: `[N/카테고리] 질문`
- haiku가 이미 파악한 정보는 확인만: `프로젝트가 ESM 기반인데 맞죠?`
- 사용자가 "됐어 시작해" → 나머지는 합리적 기본값으로 채움

#### Step 1-3b: 라운드 간 학습 (Delta + Confidence)

매 라운드 답변 후 분석:

**Delta Analysis:**
```
learned:      새로 확정된 사실
invalidated:  뒤집힌 기존 가정
emerged:      새로 드러난 모호함
```

**Confidence 기준:**
- `high` = 확정됨 (사용자 확인 또는 코드에서 확인)
- `medium` = 유추 가능하나 확인 필요
- `low` = 모름 또는 모호함

**다음 행동 결정:**
- 모든 항목 `high` → Step 1-4 완료 판정
- `high` 아닌 항목 있음 → 다음 라운드 질문 생성 (low 우선)

#### Step 1-4: 완료 판정 (체크리스트 기반)

**필수 (모든 태스크):**
- [ ] 기능 범위가 명확함
- [ ] 기술 스택이 확정됨
- [ ] 성공 기준이 정의됨

**조건부 (M 이상):**
- [ ] 영향 받는 기존 코드가 식별됨
- [ ] 엣지 케이스 처리 방침 확정

**조건부 (L 이상):**
- [ ] 모듈 분리 방향 합의
- [ ] 우선순위 정렬 완료

**사용자 조기 종료 시:**
- 미충족 항목은 합리적 기본값으로 채우고 사용자에게 한번 보여줌

#### Step 1-5: 태스크 명세서 생성

**출력물:** `.jwforge/current/task-spec.md`

```markdown
# Task Spec: {태스크 제목}

## 분류
- type: {new-feature | bug-fix | refactor | config | docs}
- complexity: {S | M | L | XL}

## 요구사항
### 필수 (Must)
- ...
### 선택 (Nice-to-have)
- ...

## 기술 컨텍스트
- stack: {언어/프레임워크}
- affected_files: {영향 받는 파일 목록}
- new_files: {새로 만들 파일 목록}
- dependencies: {필요한 의존성}

## 제약 조건
- ...

## 성공 기준
- [ ] ...
- [ ] ...

## 가정 사항
- {사용자 미확인으로 기본값 적용한 항목}
```

#### Step 1-6: 비용 추정 + 팀 생성

Phase 1 완료 후, S 복잡도가 아니라면 팀을 생성한다.

**S 복잡도:** 팀 생성 없음 — Conductor가 직접 sonnet Executor 1개 스폰 후 Phase 3으로 이동

**M/L/XL 복잡도:**

**Step 1-6a: 비용 추정 (사용자에게 표시)**

팀 생성 전에 예상 에이전트 규모를 사용자에게 표시한다:
- Architect (opus): 1 (persistent)
- Reviewer (opus): 1 (persistent)
- Executors (sonnet/opus): ~N (예상 태스크 수 기반)
- Analyzers (sonnet): ~N (파일당 1개)
- Tester (sonnet): 1
- Fixer (필요 시): 1~2

M/L: 표시 후 자동 진행. XL: **사용자 확인 필수**.

**Step 1-6b: 팀 생성**

```
TeamCreate("jwforge-{task-slug}")
    ├── Architect (opus) — 설계 전담, Phase 3 재설계 시 재활용
    └── Reviewer  (opus) — Phase 4 리뷰 전담, 재활용
```

state.json 업데이트: `team_name`, `phase: 2`

---

### Phase 2: Architecture (설계)

task-spec을 기반으로 구현 계획을 수립한다.

#### Step 2-1: 복잡도별 분기

| 복잡도 | 설계 수준 | 사용자 리뷰 |
|--------|----------|------------|
| S | **Phase 2 스킵** — Phase 3으로 직행 | 없음 |
| M | 기본 설계 (작업 분할 + 인터페이스) | 자동 진행 |
| L | 상세 설계 (모듈 경계 + 데이터 흐름) | 설계 요약 보여주고 진행 |
| XL | 풀 설계 | **사용자 승인 필수** |

#### Step 2-2: Architect에게 설계 요청

Conductor → SendMessage(Architect, 설계 지시)

**전달 내용:**
```
- task-spec.md 경로
- 복잡도 등급
- "architecture.md를 작성하고 완료 보고 바람"
```

Architect가 할 일:
- 모듈 경계 결정
- 모듈 간 인터페이스 (입출력, 데이터 흐름)
- 의존성 순서 → Level 지정 (0, 1, 2...)
- 각 Task의 모델 선택 (sonnet/opus)
- architecture.md 작성 → SendMessage(Conductor, "설계 완료")

**Architect가 정하지 않는 것:**
- 내부 구현 방식
- 함수명, 변수명
- 파일 내부 구조

#### Step 2-3: 작업 분할 (기능 단위)

작업은 **기능 단위**로 분할한다. (파일 단위 아님)

**이유:** 하나의 기능이 여러 파일에 걸칠 수 있으므로, 기능 단위로 분할해야 한 에이전트가 관련 파일 전체를 책임진다.

**작업 태그:**
| 태그 | 설명 | Executor 동작 |
|------|------|--------------|
| `create` | 새 파일 생성 | 설계 지침만 받음, 자유도 높음 |
| `modify` | 기존 파일 수정 | 기존 코드 반드시 읽은 후 작업 |
| `extend` | 기존 모듈에 기능 추가 | 기존 패턴 따르기 |

#### Step 2-4: 의존성 레벨 지정

```
Level 0: 의존성 없음 → 전부 병렬 실행
Level 1: Level 0에 의존 → Level 0 완료 후 실행
Level 2: Level 1에 의존 → Level 1 완료 후 실행
```

같은 Level의 작업은 전부 병렬 실행. Architect가 각 작업에 level 번호만 매긴다.

#### Step 2-5: Executor 모델 선택

| 조건 | 모델 |
|------|------|
| `create` + 단순 로직 | sonnet |
| `modify` + 복잡한 기존 코드 | opus |
| `extend` + 패턴 따르기 | sonnet |
| 아키텍처 핵심 모듈 | opus |
| 유틸/헬퍼/설정 | sonnet |

#### Step 2-6: 설계 문서 생성

**저장 위치:** `.jwforge/current/architecture.md`

```markdown
# Architecture: {태스크 제목}

## 전체 구조
- {모듈 관계 요약}
- {데이터 흐름 한 줄 설명}

## 작업 목록

### Task-1: {기능명}
- level: 0
- type: create | modify | extend
- model: sonnet | opus
- files: [관련 파일 목록]
- input: {이 작업이 받는 것}
- output: {이 작업이 만드는 것}
- context: {Executor가 알아야 할 핵심 정보}
- constraints: {지켜야 할 제약}

### Task-2: {기능명}
- level: 0
- ...

### Task-3: {기능명}
- level: 1
- depends_on: [Task-1, Task-2]
- ...
```

#### Step 2-7: XL 사용자 승인

XL 복잡도인 경우:
- Conductor가 architecture.md 요약을 사용자에게 표시
- 사용자 승인 → Phase 3 진행
- 사용자 거부 → Architect에게 피드백 전달하여 재설계 (최대 2회)

#### Step 2-8: 실패 처리

| 상황 | 대응 |
|------|------|
| task-spec 정보 부족 | Architect → SendMessage(Conductor, 부족한 항목) → Phase 1 보충 질문 |
| 작업 분할 불가 (너무 tight coupling) | 단일 Task로 합쳐 Executor 1개에 위임 |

---

### Phase 3: Execute (구현)

architecture.md를 기반으로 Executor teammates를 레벨 순서대로 팀에 추가하여 구현한다.

#### Step 3-1: 실행 준비 (Conductor)

Conductor가 architecture.md를 읽고 실행 계획을 수립한다.

1. 모든 Task에 `level`, `type`, `model`이 있는지 검증
2. Level별 작업 그룹 생성: `{Level 0: [Task-1, Task-2], Level 1: [Task-3], ...}`
3. 파일 충돌 사전 확인 — 같은 Level 내 Task들의 `files` 교차 검증
   - 겹치면 해당 Task를 다음 Level로 밀어냄 (최대 2회)
   - 2회 후에도 해결 안 되면 하나로 합침

**S 복잡도 (Phase 2 스킵된 경우):**
- 팀 없음 — Conductor가 직접 sonnet Executor 1개 스폰
- task-spec.md 전체를 프롬프트로 전달
- Step 3-6 완료 보고로 바로 이동

#### Step 3-2: 레벨 기반 실행

```
Level 0 → 팀에 Executor teammates 추가 (전부 병렬)
    ├── +Executor-A (Task-1, sonnet)
    ├── +Executor-B (Task-2, opus)
    └── +Executor-C (Task-3, sonnet)

── Level 0 전원 완료 대기 ──

Level 1 → 팀에 Executor teammates 추가
    ├── +Executor-D (Task-4, sonnet)
    └── +Executor-E (Task-5, opus)

── Level 1 전원 완료 대기 ──

Level 2 ... (반복)
```

**실행 규칙:**
- 같은 Level의 모든 Executor를 동시에 팀에 추가 (병렬)
- 다음 Level은 이전 Level **모든** Executor가 완료 보고해야 시작
- Level 간 대기 시 Conductor는 완료된 결과를 검토하고, 다음 Level Executor에게 필요한 정보를 프롬프트에 포함

#### Step 3-3: Executor 에이전트 동작

Conductor가 각 Executor를 팀에 추가할 때 프롬프트에 포함되는 정보:
```
- task-spec.md 경로
- architecture.md 경로
- 담당 Task 섹션
- 이전 Level exports 요약 (Level 1+ 인 경우)
```

**작업 태그별 Executor 행동:**
| 태그 | 첫 번째 행동 | 구현 자유도 | 필수 확인 |
|------|-------------|-----------|----------|
| `create` | context/constraints 읽기 | 높음 | 인터페이스(input/output) 준수 |
| `modify` | **기존 파일 전체 읽기** | 중간 | 기존 테스트 깨뜨리지 않기 |
| `extend` | **기존 파일 전체 읽기** + 패턴 분석 | 낮음 | 기존 코드 스타일/패턴 일치 |

**설계에 없는 파일을 건드려야 할 때:**
- 사소한 수정 (import 추가, export 추가 등) → 직접 수행 + Report `notes`에 기재
- 새 파일 생성 또는 구조 변경 → Report `issues`에 기재, 직접 수정하지 않음

#### Step 3-4: Executor 완료 보고

각 Executor는 SendMessage(Conductor)로 보고:

```markdown
## Executor Report: {Task 번호} - {기능명}
- status: done | partial | failed
- files_created: [새로 만든 파일]
- files_modified: [수정한 파일]
- exports: [다른 Task가 사용할 수 있는 공개 인터페이스]
- notes: {특이사항, 설계와 다르게 한 부분}
- issues: {발견한 문제점, 없으면 none}
```

#### Step 3-5: 레벨 간 핸드오프

Level N 완료 → Level N+1 시작 시 Conductor가 수행:

1. Level N의 모든 Executor Report 수집
2. **파일 존재 검증:** 각 Report의 `files_created`/`files_modified` 목록을 Glob으로 확인. 파일 누락 시 해당 Executor를 `partial`로 처리
3. `partial` 또는 `failed` 상태 확인 → Step 3-7 실패 처리
4. 모든 `exports` 종합 → Level N+1 Executor 프롬프트에 포함

**다음 Level에 전달하는 정보 (요약만):**
```
- 이전 Level에서 생성/수정된 파일 목록 (존재 확인 완료)
- exports 요약 (함수명, 타입, 경로)
- 주의사항 (notes에서 설계 변경된 부분)
```

#### Step 3-6: 완료 판정

**Phase 3 완료 조건:**
- 모든 Level의 모든 Executor가 `done` 상태
- 모든 architecture.md Task가 처리됨

**Conductor → Phase 4 핸드오프:**
- 전달: task-spec.md 경로 + architecture.md 경로 + 전체 Executor Report 요약

#### Step 3-7: 실패 처리

**재시도 흐름:**
```
Executor 실패 (sonnet):
  1회차 → 같은 Executor에게 SendMessage (에러 내용 포함)
  2회차 → opus Executor 새로 추가
  3회차 → SendMessage(Architect, 해당 Task 재설계 요청)
           재설계 후 새 Executor 추가
  재설계 후 2회 연속 실패 → Phase 3 중단, 사용자 보고

Executor 실패 (opus):
  1~2회차 → 같은 opus Executor에게 SendMessage
  3회차 → SendMessage(Architect, 재설계 요청)
  재설계 후 2회 연속 실패 → Phase 3 중단, 사용자 보고
```

**재설계 시 Architect 활용 (팀 내 재활용):**
- Conductor → SendMessage(Architect, 실패한 Task + 에러 내용)
- Architect → 해당 Task만 재설계 (전체 재설계 아님) → SendMessage(Conductor, 재설계 결과)
- architecture.md 해당 Task 섹션 업데이트 후 새 Executor 추가

| 상황 | 대응 |
|------|------|
| `partial` | 남은 부분만 재작업 — 기존 결과 유지 |
| `failed` | 위 재시도 흐름 |
| 타임아웃/크래시 | `failed`와 동일하게 처리 |

---

### Phase 4: Verify (검증)

구현된 코드를 분석 + 테스트 + 코드 리뷰로 검증한다.

#### Step 4-1: 검증 준비 (Conductor)

**복잡도별 모델 배치:**
| 복잡도 | Analyzer | 테스트 범위 | 코드 리뷰 |
|--------|----------|-----------|----------|
| S | 스킵 | 기본 동작 | 없음 |
| M | sonnet ×N | 기능 + 엣지 케이스 | 간단 리뷰 |
| L | sonnet ×N | 기능 + 통합 | 상세 리뷰 |
| XL | sonnet ×N | 기능 + 통합 + 경계 | 상세 + 아키텍처 적합성 |

#### Step 4-2: 코드 분석 (Analyzer teammates, 병렬 추가)

생성/수정된 **파일당 1개** Analyzer를 팀에 추가하여 병렬 분석한다.

**동시 추가 상한:** 최대 10개. 파일이 10개 초과 시 배치 처리 (10개씩 순차 배치).

**Analyzer가 하는 것:**
- 각 파일의 기능 요약
- 어떤 함수/클래스가 있는지
- architecture.md의 input/output 계약 준수 여부
- 명백한 오류 (문법, 미사용 import, 타입 불일치 등)

**Analyzer 보고 (SendMessage → Conductor):**
```markdown
## Analysis: {파일명}
- purpose: {이 파일이 하는 일 한 줄}
- exports: [공개 함수/클래스]
- contract_match: yes | no
- issues: [{명백한 오류, 없으면 none}]
```

#### Step 4-3: 테스트 환경 확인 + 테스트 작성 + 실행

**Step 4-3a: 테스트 환경 감지 (Conductor)**

Tester 스폰 전에 테스트 환경을 확인한다:
- 테스트 설정 파일 확인: `jest.config.*`, `vitest.config.*`, `pytest.ini`, `pyproject.toml` 등
- 테스트 스크립트 확인: `package.json`의 `test` 스크립트, `Makefile` test 타겟
- 기존 테스트 파일 존재 확인

**테스트 환경이 없는 경우:**
- Tester 프롬프트에 "테스트 프레임워크 미감지. 언어에 맞는 프레임워크를 먼저 설치/설정하라" 포함
- JS/TS → Jest 또는 Vitest 설치, Python → pytest 확인, Go → 내장

**S 복잡도:** Conductor가 sonnet 테스트 에이전트 1개를 직접 스폰
**M 이상:** 팀에 sonnet Tester teammate 추가

**Tester가 받는 정보:**
```
- task-spec.md 경로 (성공 기준 섹션)
- Analyzer 보고서 요약
- 테스트 환경 감지 결과 (프레임워크, 패턴, 없으면 "없음")
```

**테스트 작성 규칙:**
- task-spec의 성공 기준 각 항목에 최소 1개 테스트
- 기존 프레임워크 사용 (없으면 언어별 표준: Jest, pytest, go test 등)
- `modify`/`extend` 작업이면 기존 테스트 회귀 확인

**테스트 카테고리:**
| 카테고리 | 적용 |
|---------|------|
| 기본 동작 | S 이상 전체 |
| 엣지 케이스 | M 이상 |
| 통합 | L 이상 |
| 경계 | XL |

**Tester 완료 보고 (SendMessage → Conductor):**
```markdown
## Test Report
- total: {전체}
- passed: {통과}
- failed: {실패}
- errors: {실행 자체 실패}

### 실패 목록 (있으면)
- {테스트명}: {실패 이유 한 줄}

### 기존 테스트 영향
- broken: {깨진 것, 없으면 none}
```

**결과 분기:**
- 전체 통과 → Step 4-4 코드 리뷰
- 실패 있음 → Step 4-5 수정 루프

#### Step 4-4: 코드 리뷰 (Reviewer teammate)

S 복잡도는 이 단계를 스킵한다.

Conductor → SendMessage(Reviewer, 리뷰 요청)

**Reviewer가 받는 정보:**
```
- architecture.md 경로
- Analyzer 보고서 전체
- Test Report
- 생성/수정된 파일 경로 목록
```

**Reviewer의 코드 읽기 전략:**
- Analyzer 보고서 먼저 검토 → 의심가는 파일만 직접 읽기 (토큰 절약)
- L/XL에서는 opus Task 파일 무조건 직접 읽기

**리뷰 관점:**
| 관점 | 심각도 |
|------|--------|
| 기능 정확성 (task-spec 충족) | critical |
| 설계 준수 (인터페이스 계약) | critical |
| 보안 (인젝션, 하드코딩 시크릿, 입력 검증) | critical |
| 코드 품질 (가독성, 중복, 네이밍) | warning |
| 패턴 일치 (기존 컨벤션) | warning |

**Reviewer 완료 보고 (SendMessage → Conductor):**
```markdown
## Review Report
- verdict: pass | fix_required
- critical_issues: [{파일:라인} {설명}]
- warnings: [{파일:라인} {설명}]
- suggestions: [{개선 제안, 선택사항}]
```

**결과 분기:**
- `pass` → Step 4-6 완료 판정
- `fix_required` → Step 4-5 수정 루프 (critical만 수정 대상)

**리뷰 재실행 상한: 최대 3회**

#### Step 4-5: 수정 루프

테스트 실패 또는 리뷰 critical 발견 시 수정을 시도한다.
**모든 수정 시도는 git commit으로 기록한다** (롤백 가능하도록).

**Fixer 선택:**
- 팀에 sonnet Fixer teammate 추가 (이슈 파일 기준)

**수정 루프 흐름:**
```
수정 필요 발견
    ↓
+Fixer teammate 추가 → 수정 → git commit → 테스트 재실행
    ├── 통과 → Step 4-4 리뷰 재실행 또는 Step 4-6
    └── 실패
           ↓
       +Fixer (opus) 추가 → 수정 → git commit → 테스트 재실행
           ├── 통과 → Step 4-4 또는 4-6
           └── 실패
                  ↓
              SendMessage(Architect, 해당 Task 재설계)
              → 새 Executor 추가 → git commit → 테스트 재실행
                  ├── 통과 → Step 4-4 또는 4-6
                  └── 재설계 후 2회 실패 → Phase 4 중단, 사용자 보고
```

**수정 원칙:**
- Fixer는 실패/이슈 관련 파일만 수정
- 수정 후 반드시 전체 테스트 재실행 (회귀 확인)
- warning/suggestions는 수정 루프 트리거 안 함
- 매 수정마다 git commit

#### Step 4-6: 완료 판정 + 최종 보고

**Phase 4 완료 조건:**
- 모든 테스트 통과
- 코드 리뷰 `pass` (S는 리뷰 없으므로 테스트만)
- 기존 테스트 깨진 것 없음

**최종 보고 (사용자에게 표시):**
```markdown
## 완료 보고: {태스크 제목}

### 구현 결과
- 생성된 파일: [목록]
- 수정된 파일: [목록]

### 테스트 결과
- {통과 수}/{전체 수} 통과

### 코드 리뷰
- {pass 또는 S라 스킵}
- warnings: {있으면 요약}
- suggestions: {있으면 요약}

### 수정 이력 (수정 루프가 있었으면)
- {몇 회 수정, 무엇을 고쳤는지 한 줄 요약}
```

#### Step 4-7: 아카이브 + 팀 해산

Phase 4 완료 후:
1. TeamDelete
2. `.jwforge/current/` → `.jwforge/archive/{timestamp}-{태스크명}/`으로 이동
3. 최종 보고를 사용자에게 표시
4. 파이프라인 종료

**Phase 4 중단 시 (수정 불가):**
- TeamDelete
- 아카이브 하지 않음 — `current/`에 그대로 유지
- 사용자가 수동으로 해결 후 다시 `/deep`으로 이어갈 수 있도록

---

## 멀티에이전트 구조

```
[사용자 입력]
     │
     ▼
┌─────────────┐
│  Conductor   │  ← 메인 오케스트레이터 (Phase 1 + 팀 관리 + 사용자 상호작용)
└─────┬───────┘
      │
      ├── Phase 1: Conductor 직접 수행 (팀 없음)
      │     └── haiku ×N  (컨텍스트 수집, 일반 subagent)
      │
      │   [Phase 1 완료 → TeamCreate]
      │
      ├── Phase 2: SendMessage → Architect teammate (opus)
      │
      ├── Phase 3: +Executor teammates (레벨별 추가)
      │     ├── +Executor-A (sonnet/opus)
      │     ├── +Executor-B (sonnet/opus)
      │     └── ...
      │           재설계 필요 시 → SendMessage → Architect (재활용)
      │
      └── Phase 4: +Analyzer teammates (파일별 추가, sonnet)
                   +Tester teammate (sonnet)
                   SendMessage → Reviewer teammate (opus, 재활용)
                   +Fixer teammates (필요 시, sonnet/opus)
                         재설계 필요 시 → SendMessage → Architect (재활용)
      │
      └── [Phase 4 완료 → TeamDelete]
```

**에이전트 역할 요약:**

| 에이전트 | 역할 | 모델 | 팀 가입 시점 |
|---------|------|------|------------|
| Conductor | 파이프라인 제어 + 인터뷰 + 사용자 상호작용 | 현재 세션 | 팀 lead |
| Architect | 설계 + 재설계 (재활용) | opus | Phase 1 완료 후 |
| Reviewer | 코드 리뷰 (재활용) | opus | Phase 1 완료 후 |
| Executor | 코드 구현 | sonnet/opus | Phase 3 레벨별 |
| Analyzer | 코드 분석 | sonnet | Phase 4 진입 시 |
| Tester | 테스트 작성/실행 | sonnet | Phase 4 진입 시 |
| Fixer | 수정 루프 | sonnet/opus | Phase 4 필요 시 |

---

## Resume (이어하기)

대화가 끊기거나 새 세션에서 이어할 때, `.jwforge/current/state.json`을 읽어 중단된 지점부터 재개한다.

**state.json 구조:**
```json
{
  "task": "태스크 제목",
  "phase": 3,
  "step": "3-2",
  "complexity": "L",
  "status": "in_progress",
  "team_name": "jwforge-{task-slug}",
  "phase1": { "status": "done" },
  "phase2": { "status": "done" },
  "phase3": {
    "status": "in_progress",
    "current_level": 1,
    "completed_levels": [0],
    "retries": {}
  },
  "phase4": { "status": "pending" }
}
```

**Resume 시 팀 처리:**
- Phase 2 이후에서 재개 시 → TeamCreate로 새 팀 생성 후 재개
- 이전 팀 상태는 state.json + task-spec.md + architecture.md로 복구

---

## 파일 구조

```
{project}/
└── .jwforge/
    ├── current/
    │   ├── state.json
    │   ├── task-spec.md
    │   └── architecture.md
    └── archive/
        └── {timestamp}-{태스크명}/
            ├── state.json
            ├── task-spec.md
            └── architecture.md

jwforge/                        ← 플러그인 루트
├── PLAN.md
├── skills/
│   └── jwforge.md
├── agents/
│   ├── architect.md
│   ├── executor.md
│   ├── analyzer.md
│   ├── tester.md
│   ├── reviewer.md
│   └── fixer.md
├── templates/
│   ├── task-spec.md
│   └── architecture.md
└── config/
    └── settings.json
```

---

## 핵심 도구 활용

| 도구 | 용도 |
|------|------|
| `Agent` tool | Phase 1의 haiku 컨텍스트 수집 (일반 subagent) |
| `TeamCreate` | Phase 1 완료 후 팀 생성 |
| `Agent` tool (team_name 포함) | 팀 teammate 추가 |
| `SendMessage` | Conductor ↔ 팀 에이전트 양방향 통신 |
| `TeamDelete` | Phase 4 완료 후 팀 해산 |
| `TaskCreate/TaskUpdate` | 작업 추적 |
| `Read/Write/Edit` | 코드 작업 |
| `Bash` | 테스트 실행 |
