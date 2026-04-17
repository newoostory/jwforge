# JWForge

Claude Code용 멀티에이전트 오케스트레이션 파이프라인. `/forge` 하나로 인터뷰부터 설계, TDD 구현, 검증까지 자동으로 처리합니다.

## 개요

JWForge는 작업 요청을 4개 페이즈로 나눠 전문화된 에이전트들이 순서대로 처리합니다. Conductor(현재 Claude 세션)는 순수 디스패처 역할만 하고, 실제 사고는 모두 명시적으로 모델이 지정된 서브에이전트가 담당합니다.

```
/forge "작업 설명"
    │
    ├── Phase 1: Discover  — 인터뷰 → 요구사항 분석 → 자동 진행
    ├── Phase 2: Design    — 코드베이스 분석 → 아키텍처 설계 → 유저 승인
    ├── Phase 3: Build     — TDD 유닛별 반복 (테스트 → 구현 → 리뷰 → 커밋)
    └── Phase 4: Validate  — 통합 검증 → 수정 → 최종 리뷰
```

## 설치

```bash
git clone https://github.com/newoostory/jwforge.git ~/jwforge
bash ~/jwforge/install.sh
```

**Project-scoped install (default):** `./install.sh [target-path]` writes hooks to `<target>/.claude/settings.json`. Defaults to the current working directory when no path is given.

**Global install (opt-in):** Pass `--global` to write to `~/.claude/settings.json` instead. You will be prompted for confirmation via `/dev/tty`.

**Dry-run:** Pass `--dry-run` to print the planned changes without writing anything.

**요구사항:** Node.js, Claude Code CLI

### Windows
POSIX shell required; Windows users must use WSL. See the [WSL install guide](https://learn.microsoft.com/en-us/windows/wsl/install) to get started.

### Migration
Run `./uninstall.sh --global` to remove the old global installation, then run `./install.sh` inside your project directory to switch to the project-scoped layout.

## 업데이트

```bash
bash ~/jwforge/update.sh
```

## 제거

```bash
bash ~/jwforge/uninstall.sh
```

## 사용법

### `/forge <작업>`
전체 파이프라인 실행.

```
/forge 사용자 인증 기능 추가
/forge hooks 디렉토리 리팩토링
```

### `/fix`
Phase 4(검증 + 수정)만 단독 실행. 기존 코드의 에러 수정에 사용.

## 페이즈 상세

### Phase 1 — Discover
| 스텝 | 에이전트 | 역할 |
|------|---------|------|
| 1-1 | interviewer (opus) | 구조화된 요구사항 인터뷰 |
| 1-2 | analyst (opus) | 인터뷰 결과 → `task-spec.md` |
| 1-3 | reviewer (opus) | 스펙 검증, 통과 시 자동 진행 |

### Phase 2 — Design
| 스텝 | 에이전트 | 역할 |
|------|---------|------|
| 2-1 | researcher × 4 (sonnet) | 코드베이스 병렬 분석 |
| 2-2 | designer (opus) | 분석 결과 → `architecture.md` |
| 2-3 | reviewer (opus) | 설계 검증 → **유저 승인 대기** |

> S 복잡도 작업은 Phase 2를 건너뛰고 Phase 3로 직행.

### Phase 3 — Build
유닛별로 다음 사이클을 반복 (유저 게이트 없음):
```
test-writer (sonnet) → executor (sonnet) → code-reviewer (sonnet) → [forge] commit
```

### Phase 4 — Validate
| 스텝 | 에이전트 | 역할 |
|------|---------|------|
| 4-1 | verifier (opus) | 크로스 유닛 통합 검증 |
| 4-2 | fixer (sonnet → opus) | 이슈 수정, 반복 실패 시 opus 업그레이드 |
| 4-3 | tester (sonnet) | 통합 테스트 실행 |
| 4-4 | reviewer (opus) | 최종 검증 |

## 파이프라인 아키텍처

**Conductor** (현재 세션) — 에이전트를 스폰하고 결과를 릴레이할 뿐, 직접 분석·설계·코딩을 하지 않습니다.

**State** — `.jwforge/current/state.json`에 파이프라인 상태를 기록. 오직 state-recorder (haiku) 에이전트만 쓰기 가능.

**TDD 강제** — Phase 3에서 테스트 파일보다 구현 파일을 먼저 작성하면 훅이 블락.

**Git** — 파이프라인 중 모든 커밋은 `[forge]` prefix 필수.

## 훅 시스템

| 훅 | 이벤트 | 역할 |
|----|--------|------|
| `trigger.mjs` | UserPromptSubmit | `/forge`, `/fix` 감지 및 락 파일 생성 |
| `phase-guard.mjs` | PreToolUse (Edit/Write/Bash) | 페이즈별 파일 수정 권한 통제 |
| `tdd-guard.mjs` | PreToolUse (Edit/Write) | 테스트 먼저 작성 강제 |
| `state-validator.mjs` | PreToolUse (Write) | state.json 전환 유효성 검사 |
| `artifact-validator.mjs` | PreToolUse (Write) | 페이즈 진행 전 산출물 존재 확인 |
| `agent-bg-guard.mjs` | PreToolUse (Agent) | `run_in_background: true` 강제 |
| `commit-guard.mjs` | PreToolUse (Bash) | `[forge]` prefix 없는 커밋 블락 |
| `persistent-mode.mjs` | Stop | 파이프라인 진행 중 세션 종료 방지 |
| `on-stop.mjs` | Stop | 완료 시 아카이브 및 정리 |
| `subagent-tracker.mjs` | PostToolUse (Agent) | 에이전트 활동 로그 기록 |
| `notify.mjs` | PostToolUse / Stop | 상태 전환 시 데스크톱 알림 |

## 파일 구조

```
jwforge/
├── install.sh          # 설치 스크립트
├── uninstall.sh        # 제거 스크립트
├── update.sh           # 업데이트 스크립트
├── skills/forge.md     # Conductor 프로토콜
├── agents/             # 에이전트 프롬프트 (15개)
├── hooks/              # 훅 파일 (11개) + lib/
├── config/pipeline.json # 파이프라인 설정, 모델 배정
└── templates/          # 산출물 템플릿
```

---

See [LICENSE](LICENSE) — MIT.
