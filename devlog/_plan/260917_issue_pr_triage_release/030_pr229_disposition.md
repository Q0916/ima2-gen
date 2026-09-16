---
created: 2026-09-17
updated: 2026-09-17
tags: [ima2-gen, devlog, pr-229, gpt-6-astra, review, fork]
---

# 030 — wp3: PR #229 (GPT-6 Astra) 판정

## 성격

외부 fork PR이다. head는 `datell1357/ima2-gen`의 `feat/gpt6-astra-defaults`,
head SHA `99df83ea`, merge base는 현재 `main`(`7fa7d426`), ahead=2 behind=0.
fork라서 `main...feat/gpt6-astra-defaults` branch-only 비교는 404가 난다.

## UNSTABLE의 진짜 원인

실패한 잡이 없다. workflow 3개가 maintainer 승인 대기(`action_required`) 상태다.

| workflow | run |
|---|---|
| CodeQL | 34428549581 |
| Agy artifact filesystem check | 34428549566 |
| PR Fast Gate | 34428549617 |

셋 다 `jobs: []`, 로그 없음, "awaiting approval from a maintainer". fork PR의 기본
동작이다. `CodeRabbit` status 자체는 green이고, 내부 "Docstring Coverage 0%" 경고는
merge state와 무관하다. 즉 `UNSTABLE`은 코드 결함 신호가 아니라 승인 누락이었다.

**해소됨.** 2026-09-17에 세 run을 승인(`POST actions/runs/<id>/approve`)했고, 결과는
CodeQL success, Agy artifact filesystem check success, PR backend checks와 filesystem
4종(ubuntu 22/24, macOS, Windows) success, PR frontend checks는 진행 중이다.
이 PR에 실제 실패 잡은 없다.

## 맞게 한 것

`REGISTRY → generated providers → parity test` 사슬이 한 번에 갱신됐다.
`lib/providers/registry.ts:31`과 `:58`에 oauth/api 양쪽 Astra 항목,
`ui/src/generated/providers.ts:27`에 생성 카탈로그, `tests/provider-registry-parity.test.ts:59`에
alias와 capability 단언. i18n 4개 로캘, CLI alias(`bin/lib/model-aliases.ts`),
`lib/imageModels.ts` 검증기, 기존 테스트 기대값까지 같이 움직였다. TypeScript/React
등록 표면은 빠진 곳이 없다 — 누락은 아래 3번의 Python 브리지 한 곳뿐이다.

## 머지 전 필요한 수정

### 1. 서버 alias 처리가 비대칭이다 (SSOT 위반)

PR head 기준 `lib/imageModels.ts:7`에 `const IMAGE_MODEL_ALIASES = new Map([["astra", FALLBACK_IMAGE_MODEL]])`가
새로 하드코딩됐다. registry가 이미 `aliases: ["astra"]`를 선언하는데
(`lib/providers/registry.ts:31`) 그 선언을 읽지 않고 별도 맵을 만든다. 결과적으로
서버는 `astra`는 받아들이고 `luna`/`sol`/`terra`는 거부한다 — 같은 성격의 별칭인데
동작이 갈린다. registry에서 파생하거나(`lib/providers/derive.ts` 옆), 서버 별칭
정규화를 이번 PR 범위에서 빼야 한다.

### 2. 계약 문서가 머지 즉시 거짓이 된다

`structure/`는 현재 계약의 SSOT다. 아래가 전부 `gpt-5.6-luna` / `low` / `medium`을
기본값으로 계속 선언한다.

| 위치 | 현재 문장 |
|---|---|
| `structure/03-server-api.md:212` | "the server defaults to `gpt-5.6-luna`", 지원 목록에 Astra 없음 |
| `structure/03-server-api.md:214` | "`gpt-5.6-luna`, `low` reasoning effort" |
| `structure/06-infra-operations.md:162,164` | `IMA2_IMAGE_MODEL_DEFAULT`/`IMA2_API_IMAGE_MODEL_DEFAULT` 기본 모델 |
| `structure/06-infra-operations.md:163,165` | `IMA2_REASONING_EFFORT`/`IMA2_API_REASONING_EFFORT` 기본 reasoning 값 |
| `README.md:181,193,195,340,343,353,354` | 기본 모델과 reasoning 기본값 |
| `skills/ima2/SKILL.md:746` | "built-in OAuth image default is `gpt-5.6-luna`" |

Prompt Builder 기본(`DEFAULT_PROMPT_BUILDER_MODELS`), stylesheet(`config.styleSheet.model`),
Card News 플래너는 의도적으로 Luna를 유지하므로 건드리면 안 된다. 문서도 그 구분을
지켜야 한다.

### 3. ComfyUI 브리지 모델 목록 누락

`integrations/comfyui/ima2_gen_bridge/nodes.py:20`의 `MODEL_OPTIONS`에 `gpt-6-astra`가
없다. 브리지 사용자는 새 기본 모델을 고를 수 없다.

### 4. CLI 도움말 alias 목록 불일치

`bin/commands/edit.ts:50`과 `bin/commands/multimode.ts:58`은 "Default: gpt-6-astra"로
바뀌었는데 바로 아랫줄 "Aliases: luna, sol, terra, spark"는 그대로다. `gen.ts:79`만
`astra`를 추가했다. 미해결 CodeRabbit thread 2건 중 하나다.

### 5. 범위 밖 로깅 (비차단)

`lib/responsesTransport.ts:186-192`에 모든 요청마다 도는 `logEvent(scope, "request", ...)`가
추가됐다. Astra 지원과 무관하다. 의도적이면 별도 PR로 분리하는 게 맞다.
정확성 문제는 아니므로 머지를 막지 않는다. 범위 정리 요청으로만 남긴다.

## 제품 결정이 필요한 부분

이 PR은 Astra 추가에 그치지 않고 **모든 OAuth/API 이미지 요청의 reasoning 기본값을
`max`로 올린다**. 영향 지점:

- `config.ts:360` `imageModels.reasoningEffort` `medium` → `max`
- `config.ts:373` `apiProvider.defaultReasoningEffort` `low` → `max`
- `lib/imageModels.ts:8` `FALLBACK_REASONING_EFFORT` `none` → `max`
- `lib/oauthProxy/runtime.ts:7` 동일
- `lib/agentSettings.ts:21` / `ui/src/lib/agentGenerationSettings.ts:14` agent 기본 `none` → `max`
- `ui/src/lib/reasoning.ts:3` UI 기본 `none` → `max`
- `lib/providers/adapters/openaiOperations.ts` 3곳, `lib/responsesFallback.ts:132`,
  `lib/responsesDoctor.ts` 3곳의 하드코딩 폴백

Astra만이 아니라 기존 모델 전부의 비용과 지연이 올라간다. 유지보수자의 제품 판단이
필요한 항목이므로 리뷰에 명시하고 답을 기다린다.

## 판정과 종결 규칙

MERGE_AFTER_FIX. 이번 릴리스(3.16.1)에는 **싣지 않는다.** 전역 reasoning 기본값 변경은
제품 판단이고, 그 판단을 기다리느라 CLI 버그 수정 배포를 붙잡아 둘 이유가 없다.

goalplan은 `wp5.dependsOn`에 `wp3-pr229`를 갖고 있고 그 의존성은 수정되지 않는다.
모순처럼 보이지만 아니다. 의존 대상은 "#229가 릴리스에 포함되는 것"이 아니라
"#229의 판정이 끝나는 것"이다. 즉 릴리스 dispatch 전에 아래 표의 종결 중 하나가
실행되어 있어야 한다. 릴리스 내용물에 #229 커밋이 들어가지 않을 뿐이다.

릴리스와 분리하되 이 유닛 안에서 종결한다. 유지보수자 답변에 따라:

| 답변 | 종결 |
|---|---|
| Astra만 수용, reasoning 기본값 유지 | #229를 credit과 함께 종료하고, 등록 작업만 살린 교정 PR을 이 저장소 브랜치에서 연다 |
| 전역 max까지 수용 | 1~4번을 교정 PR로 먼저 올린 뒤 #229 머지 |
| 이번엔 제외 | 1~5번 + 제품 결정 질문을 change request로 남기고 #229를 종료 |

**무응답 기본 경로도 종결한다.** 릴리스가 끝날 때까지 답변이 없으면 세 번째를 택하고,
change request 리뷰를 남긴 뒤 #229를 close한다. 이유는 두 가지다. (1) 전역 reasoning
기본값 변경은 기여자가 단독으로 결정할 수 없는 제품 범위이고, (2) 1~4번은 fork 브랜치라
이쪽에서 직접 고칠 수 없다. close 코멘트에 "Astra 등록 작업 자체는 환영이며 범위를
좁힌 PR로 다시 열어 달라"를 명시하고, 유지보수자가 원할 때 reopen할 수 있음을 같이 적는다.
GitHub의 PR close는 되돌릴 수 있는 조작이라 이 기본값이 파괴적이지 않다.

criteria를 낮춰서 통과시키지 않는다. 어느 경로든 c-7이 요구하는 "merged or closed with a
recorded, evidence-backed decision"에 실제로 도달한다.

실행 순서:

1. 대기 중인 workflow 3개 승인 — 완료.
2. 위 5개 항목과 제품 결정 질문을 증거와 함께 PR 리뷰로 남긴다.
3. 답변에 따라 위 표대로 종결한다.
