---
created: 2026-09-17
updated: 2026-09-17
tags: [ima2-gen, devlog, gpt-6-astra, provider-registry, pr-229]
---

# 070 — wp6: Astra를 기본값 변경 없이 등록하고 #229를 종결한다

## 왜 이 유닛이 생겼나

030에서 PR #229를 MERGE_AFTER_FIX로 판정하고 change request를 남겼다. 다섯 항목 중
네 개는 기계적이지만, 막힌 것은 하나였다 — 이 PR이 Astra 추가에 그치지 않고
**모든 OAuth/API 이미지 요청의 reasoning 기본값을 `max`로 올린다**(10개 파일 15곳).
그건 제품 판단이라 유지보수자에게 물었고 답이 없다.

답을 기다리며 PR을 열어 두면 c-7("merged or closed")에 영원히 도달하지 못한다.
그렇다고 외부 기여자의 PR을 그냥 닫으면 멀쩡한 등록 작업이 사라진다.

그래서 결정을 **구체적이고 검토 가능한 형태로** 만든다. 논란 없는 부분(Astra 등록)만
가져와 이쪽 브랜치에서 올바르게 구현하고, 논란 있는 부분(전역 reasoning 기본값)은
빼고, #229는 superseded로 닫는다. 기본값을 건드리지 않는 것은 새로운 제품 결정이
아니라 **현상 유지**다. `max`가 필요하다는 판단이 서면 그건 범위가 분명한 별도 PR로 낸다.

기여자 크레딧은 `Co-authored-by`로 남긴다.

## 범위에서 제외 (명시)

PR #229가 건드린 아래는 **하나도 가져오지 않는다.**

| 위치 | #229 | 이 유닛 |
|---|---|---|
| `config.ts` `imageModels.reasoningEffort` | `medium` → `max` | 그대로 |
| `config.ts` `apiProvider.defaultReasoningEffort` | `low` → `max` | 그대로 |
| `config.ts` `imageModels.default`, `apiProvider.defaultImageModel` | luna → astra | 그대로 luna |
| `lib/providerOptions.ts:138-140` | `low` → `max` | 그대로 |
| `lib/imageModels.ts` `FALLBACK_IMAGE_MODEL`, `FALLBACK_REASONING_EFFORT` | 변경 | 그대로 |
| `lib/oauthProxy/runtime.ts` `FALLBACK_REASONING_EFFORT` | `none` → `max` | 그대로 |
| `lib/agentSettings.ts`, `ui/src/lib/agentGenerationSettings.ts` | 모델·effort 변경 | 그대로 |
| `ui/src/lib/reasoning.ts` `DEFAULT_REASONING_EFFORT` | `none` → `max` | 그대로 |
| `openaiOperations.ts`(3), `responsesFallback.ts`, `responsesDoctor.ts`(3) 폴백 | `low` → `max` | 그대로 |
| `lib/responsesTransport.ts` 요청 로깅 추가 | 추가 | 가져오지 않음 |
| `ui/.../PromptComposerToolbar.tsx:59` | luna → astra | 그대로 luna |
| `lib/imageModels.ts` 서버 alias 맵 | 추가 | **추가하지 않음** (아래 참조) |

A-phase 보강: #229는 모델 기본값도 여러 군데 바꿨다. 아래도 전부 그대로 둔다.

| 위치 | #229 | 이 유닛 |
|---|---|---|
| `lib/providers/adapters/openaiOperations.ts` 3곳 | 폴백 모델 luna → astra | 그대로 luna |
| `lib/oauthProxy/generators.ts:38` | 폴백 모델 luna → astra | 그대로 luna |
| `lib/oauthProxy/multimodeGenerators.ts:46,193` | 폴백 모델 luna → astra | 그대로 luna |
| `lib/responsesDoctor.ts:424` | 프로브 기본 모델 luna → astra | 그대로 luna |
| `bin/commands/gen.ts:92-96` | `defaults set image` 예시를 astra로 | 그대로 luna |
| `bin/commands/edit.ts:50`, `multimode.ts:58` `Default:` 표기 | astra | 그대로 luna |

### 서버 alias를 넣지 않는 이유

#229는 `lib/imageModels.ts`에 `IMAGE_MODEL_ALIASES = new Map([["astra", ...]])`를
하드코딩했다. 그러면 서버가 `astra`는 받고 `luna`/`sol`/`terra`는 거부한다 —
같은 성격의 별칭인데 동작이 갈린다(030 항목 1). registry의 `aliases` 선언은
`normalizeImageModel`이 읽지 않고, CLI `bin/lib/model-aliases.ts`만 별칭을 푼다.

따라서 Astra도 기존 셋과 **똑같이** 동작하게 둔다: CLI에서 `astra`가 풀리고, 서버는
정식 id만 받는다. 별칭을 서버까지 내리는 것은 별칭 4개 전부에 대해 한 번에 해야 할
별도 작업이다.

## 등록해야 하는 표면 (전수)

이 저장소에서 이미지 모델 하나를 추가할 때 손대야 하는 곳 전부. #229는 이 중
Python 브리지를 빠뜨렸다.

### 서버 / 레지스트리

| 파일 | 변경 |
|---|---|
| `lib/providers/registry.ts` | oauth와 api 양쪽 `models`에 `{ id: "gpt-6-astra", aliases: ["astra"], kind: "image", supports: RESPONSES }` |
| `lib/imageModels.ts:71-75` | `INVALID_IMAGE_MODEL` 메시지의 하드코딩 목록에 `gpt-6-astra` |
| `lib/promptBuilder/constants.ts:5` | `GPT_MODELS`에 추가. 기본값(`DEFAULT_PROMPT_BUILDER_MODELS`)은 luna 유지 |
| `lib/imageBackgroundParam.ts:10` | OAuth 모델을 열거하는 주석에 추가 |

**`config.ts`의 `GROK_PLANNER_MODELS`는 건드리지 않는다** (A-phase 정정). 초판은
"OpenAI 모델을 열거하니 추가"로 적었는데, 이 배열은 이미지 모델 카탈로그가 아니라
Grok 플래너 선택지다. `routes/capabilities.ts:33`의 GET/PATCH 셀렉터를 거쳐 Grok
이미지·비디오 플래닝에 쓰인다. 여기에 Astra를 넣으면 "이미지 모델 등록"이 아니라
"Astra를 Grok 플래너로 쓸 수 있게 함"이라는 별개 기능이 열린다. 범위 밖이다.

### 줄 수 표

`config.ts`를 빼더라도 `registry.ts`와 UI 모델 파일의 줄 수가 바뀐다.
`structure/01-file-function-map.md`가 그 값을 추적하고 `ci.yml:57`이 drift를 거부하므로
`npm run docs:refresh-line-counts` 후 `node scripts/refresh-structure-line-counts.mjs --check`로 확인한다.

파생되므로 건드리지 않는 곳: `derive.ts`, `deriveCore.ts`, `surfaceSupport.ts`,
`routes/models.ts`, `config.imageModels.valid`.

### 생성물

`ui/src/generated/providers.ts`는 직접 고치지 않고 `node scripts/generate-provider-types.mjs`로
재생성한다. `--check`가 `ci.yml:63`과 `pr-fast.yml:51`에서 강제되므로 재생성을
빠뜨리면 CI가 떨어진다.

### CLI

| 파일 | 변경 |
|---|---|
| `bin/lib/model-aliases.ts` | `astra: "gpt-6-astra"` |
| `bin/lib/error-hints.ts:6` | `INVALID_IMAGE_MODEL` 힌트 목록 |
| `bin/commands/gen.ts:79` | `Core aliases: astra, luna, sol, terra, spark` |
| `bin/commands/edit.ts:51` | `Aliases:` 줄에 astra |
| `bin/commands/multimode.ts:59` | `Aliases:` 줄에 astra |

`gen.ts`/`edit.ts`/`multimode.ts`의 `--model` enum 자체는 `KNOWN_IMAGE_MODELS`에서
파생되므로 자동으로 따라온다. #229는 `gen.ts`만 고치고 나머지 둘의 alias 줄을 놓쳤다(030 항목 4).

### UI

| 파일 | 변경 |
|---|---|
| `ui/src/lib/imageModels.ts:7-18` | `IMAGE_MODEL_OPTIONS`에 `{ value: "gpt-6-astra", shortLabel: "6a", fullLabelKey: "settings.imageModel.gpt6Astra" }` |
| `ui/src/lib/agentModelOptions.ts:10-20` | `AGENT_LLM_MODEL_OPTIONS`에 동일 모델 |
| `ui/src/i18n/{en,ko,zh-Hans,zh-Hant}.json` | `settings.imageModel.gpt6Astra` 키 |

`DEFAULT_IMAGE_MODEL`은 luna 그대로. `ui/src/types.ts`는 생성된 union에서 파생되므로 손대지 않는다.

#### 순서

`tests/model-default-projection-contract.test.ts:50`이 규약을 못박는다:
"orders active UI model pickers from current defaults to compatibility choices".
기본값이 먼저고 그 뒤가 최신, 그 뒤가 호환용이다. Astra는 최신이지만 기본값이 아니므로
**luna 다음 두 번째**에 넣는다.

```
gpt-5.6-luna, gpt-6-astra, gpt-5.6-terra, gpt-5.6-sol, gpt-5.5, gpt-5.4, gpt-5.4-mini
```

같은 순서를 `AGENT_LLM_MODEL_OPTIONS`의 oauth 구간에도 적용한다. 지금 그 구간에는
순서를 고정하는 단언이 없어서 두 picker가 어긋날 수 있으므로, 이번에 단언을 추가한다.

### ComfyUI 브리지

`integrations/comfyui/ima2_gen_bridge/nodes.py:20`의 `MODEL_OPTIONS`. Python이라
TypeScript 검색에 안 걸리고, registry에서 파생되지도 않는다. #229가 놓친 지점이다(030 항목 3).
순서는 UI picker와 맞춘다.

### 문서 — "지원 목록"만 고치고 "기본값"은 건드리지 않는다

기본값이 안 바뀌므로 #229가 필요로 했던 대규모 문서 스윕이 대부분 사라진다.
모델을 **열거하는** 곳만 고친다.

| 파일 | 위치 |
|---|---|
| `README.md` | 195-197 선택 가능 모델 목록 |
| `docs/README.{ko,ja,zh-CN,zh-TW}.md` | 각 모델 목록 |
| `docs/FAQ.md`, `docs/FAQ.{ko,zh-CN,zh-TW}.md` | 각 모델 목록 |
| `structure/02-command-reference.md` | 133, 191 `--model` 지원 목록 |
| `structure/03-server-api.md:212` | 지원 이미지 모델 목록 |
| `site/src/pages/docs/concepts/providers.astro` | Models 표 |
| `site/src/pages/ko/docs/concepts/providers.astro` | 같은 표 |

건드리지 않는 곳: 기본값을 서술하는 모든 문장(`README.md:181,193`,
`structure/03-server-api.md:214`, `structure/06-infra-operations.md` env 표,
`skills/ima2/SKILL.md`, `docs/API.md:335`의 비열거형 문구, `docs/CLI.md`).

## 테스트

registry에 모델을 더하면 **지금 바로 깨지는** 단언 세 개가 있다. 이것들은 수정한다.

| 파일 | 단언 |
|---|---|
| `tests/config.test.js:91` | 정렬된 `imageModels.valid` 전체 집합 |
| `tests/provider-registry-parity.test.ts:15,42,51-52` | `OPENAI_MODELS` 기반 OAuth/CLI/config 배열 3개 |
| `tests/model-default-projection-contract.test.ts:53` | `IMAGE_MODEL_OPTIONS.slice(0,6)` 순서 |

자동으로 깨지지는 않지만 **또 한 번의 불완전 등록을 막기 위해** 단언을 추가한다.

| 파일 | 추가 |
|---|---|
| `tests/image-model.test.ts` | `normalizeImageModel({}, "gpt-6-astra")` 수용. 기본값 단언은 luna 유지 |
| `tests/provider-registry-parity.test.ts` | Astra가 oauth·api 양쪽에 `aliases: ["astra"]`와 4개 capability로 등록됐는지 |
| `tests/gpt56-rollout-contract.test.ts` | `INVALID_IMAGE_MODEL` 메시지에 Astra 포함, `config.imageModels.valid`에 포함. 기본값은 luna로 남아 있음을 명시적으로 단언 |
| `tests/prompt-builder-contract.test.ts` | oauth·api에서 Astra 수용, 두 기본값은 luna |
| `tests/model-default-projection-contract.test.ts` | `AGENT_LLM_MODEL_OPTIONS`의 oauth 구간 순서 단언(신규) |
| `ui/e2e/fixtures/j6Catalog.ts` | ready 카탈로그에 Astra 추가 |
| `tests/i18n-dictionary-contract.test.ts:81` | 유한 dynamic-key 목록 2곳에 `gpt6Astra` (A-phase 추가) |
| `tests/cli-model-resolver.test.ts:71` | `oauth/astra`와 맨몸 `astra`가 CLI resolver를 통과하는지 (A-phase 추가) |

마지막 둘은 A-phase 감사에서 나왔다. i18n 계약 테스트는 로케일 키를 유한 목록으로
따로 관리하므로 키만 추가하면 통과하지 않는다. CLI resolver 테스트는 registry의
`aliases` 선언이 아니라 `bin/lib/model-aliases.ts`의 별도 맵을 검증하는 유일한 지점이다 —
registry parity 단언으로는 이 경로가 덮이지 않는다.

### Astra의 위치를 고정해야 하는 배열 전부

picker 순서 규약은 테스트가 배열 하나를 못박을 뿐 "최신" 의미를 형식화하지는 않는다.
그래서 Astra 위치를 아래 모든 곳에서 명시적으로 같게 둔다: luna 바로 뒤.

- `lib/providers/registry.ts` oauth·api `models`
- `ui/src/generated/providers.ts` (재생성 결과가 registry 순서를 따른다)
- `ui/src/lib/imageModels.ts` `IMAGE_MODEL_OPTIONS`
- `ui/src/lib/agentModelOptions.ts` `AGENT_LLM_MODEL_OPTIONS`
- `lib/promptBuilder/constants.ts` `GPT_MODELS`
- `integrations/comfyui/ima2_gen_bridge/nodes.py` `MODEL_OPTIONS`
- `ui/e2e/fixtures/j6Catalog.ts` oauth·api 양쪽 레인

**기본값이 안 바뀌었다는 것 자체를 테스트가 지켜야 한다.** 이 유닛의 회귀 위험은
"Astra가 빠진다"가 아니라 "기본값이 슬쩍 따라 바뀐다"이므로, luna 기본값 단언을
여러 곳에 명시적으로 남긴다.

## 검증

```
node scripts/generate-provider-types.mjs --check
npm run typecheck
npm run typecheck:tests
npm run test:provider-registry
npm run test:inventory
node scripts/refresh-structure-line-counts.mjs --check
node --experimental-strip-types --import tsx --test <영향 받는 테스트들>
```

## 배달과 #229 종결

브랜치 `codex/260917-astra-additive-registration`, base `main`.
커밋에 `Co-authored-by: datell1357`.

머지된 뒤 #229에 종결 코멘트를 남기고 close한다. 코멘트에 담을 것: 무엇을 가져왔고
무엇을 왜 뺐는지, 대체 PR 번호, reasoning 기본값은 별도 결정으로 열려 있다는 것,
그리고 원하면 reopen 가능하다는 것.
