---
created: 2026-09-17
updated: 2026-09-17
tags: [ima2-gen, devlog, dependabot, ci, pr-242, pr-243]
---

# 020 — wp2: dependabot PR #242 / #243

## 판정 요약

| PR | 대상 | 판정 | 조건 |
|---|---|---|---|
| #242 | ui development-npm 그룹 | MERGE | 조건 없음 |
| #243 | `@openai/codex` 0.153.2 → 0.153.4 | MERGE 보류 | exact-head `ci.yml` full run green 이후 |

두 PR 모두 `MERGEABLE`/`CLEAN`, main(`7fa7d426`)보다 1커밋 앞서고 0커밋 뒤처진다.
auto-merge는 설정되어 있지 않다 (`.github/dependabot.yml:22-26`, `47-51`은 주간 그룹 정의만).

## PR #242 — ui 개발 의존성

head `1cce12ec`.

| 패키지 | 변화 | 종류 |
|---|---|---|
| `@playwright/test` | 1.62.1 → 1.63.0 | minor, 직접 devDependency |
| `playwright` / `playwright-core` | 1.62.1 → 1.63.0 | minor, 전이 |
| `@types/react-dom` | 19.2.5 → 19.2.7 | patch, 직접 devDependency |
| `fsevents` | 2.3.2 → 제거 | Playwright 1.63 매니페스트에서 상류 제거 |

전부 `ui/package.json:26-35`의 개발 의존성이다. Playwright 1.63은 Ubuntu 20.04 지원
종료와 Linux arm64 Chromium 배포 변경을 announce했는데, 이 저장소는 Node >=22와 현재
hosted runner만 쓰므로 해당 없음. `@types/react-dom` 패치는 server/static 렌더링
선언(`headersLengthHint` → `maxHeadersLength`)을 바꾸는데, 이 저장소가 쓰는 react-dom
표면은 `createRoot`(`ui/src/main.tsx:2`)와 `renderToStaticMarkup`
(`tests/nai-ui-registration-contract.test.ts:197`)뿐이고 바뀐 선언과 겹치지 않는다.

lockfile은 해당 항목만 움직이고 레지스트리 origin은 `registry.npmjs.org` 그대로다.
PR Fast Gate가 Chromium 설치 + E2E 타입체크 + 프론트엔드 E2E 전체를 돌렸다
(`.github/workflows/pr-fast.yml:114-125`). 체크 10개 전부 PASS.

블로커 없음.

## PR #243 — `@openai/codex`

head `237754c5`. 직접 패키지 + 플랫폼 별칭 6개가 같이 움직인다
(`package-lock.json:1517-1634` on PR head).

`@openai/codex`는 툴링이 아니라 런타임 의존성이다 (`package.json:92-100`). ima2는
번들된 CLI를 대화형/device 인증과 로그인 상태 조회에 실행하고
(`routes/auth.ts:139-157`, `bin/ima2.ts:57-61`, `lib/codexDetect.ts:90-104`),
doctor는 그 패키지와 바이너리를 필수 런타임 구성요소로 본다
(`bin/lib/doctor-runtime.ts:7-8`).

0.153.3 / 0.153.4 릴리스 노트는 모델 카탈로그와 Astra 기본값 변경을 선언하고 인증 CLI
breaking 고지는 없다. ima2가 실제로 부르는 표면은 `login`, `login --device-auth`,
`login status` 세 개뿐이라 선언된 변경과 겹치지 않는다.

보류 이유는 코드가 아니라 검증 커버리지다. 설치된 Codex 바이너리를 직접 실행해
`login status` 동작을 단언하는 것은 package-install smoke인데
(`tests/package-install-smoke.mjs:184`, `243-255`), 이건 full `ci.yml`에만 있고
(`.github/workflows/ci.yml:102-103`, `200-201`, `247-248`) PR Fast Gate에는 없다.
이 head에 대한 full ci.yml run이 없다. 같은 저장소의 직전 Codex dependabot 절차도
머지 전 exact-head full CI를 요구했다 (`devlog/_fin/260908_post_314_cleanup/020_wp2_dependabot.md:20-30`).

## 실행 순서

두 PR은 지금 `main`(`7fa7d426`)보다 0커밋 뒤처져 있지만, wp1이 `dev`를 `main`으로
승격하고 #244 수정까지 머지한 뒤에는 둘 다 뒤처진다. 따라서 wp1 완료 후에 다시 잰다.

1. 두 PR을 새 `main` 기준으로 업데이트 (`gh pr update-branch <n>`).
2. #242의 체크가 새 head에서 다시 green인지 확인하고 머지.
3. #243을 다시 한번 `main`에 맞춘 뒤, 그 exact head SHA에 대해
   `gh workflow run ci.yml -f sha=<head>` dispatch.
4. 전 job green일 때만 #243 머지.
5. wp5의 `expected_sha`는 이 두 머지가 끝난 뒤의 `origin/main`으로 고정.

릴리스 자체의 잔여 위험은 낮다. `release.yml`이 후보를 밀기 전에 `verify:release`
(package-install smoke 포함)를 돌리고 (`.github/workflows/release.yml:89-96`,
`package.json:41-42`), 그 후 후보 SHA를 다시 full CI 게이트에 태운다
(`.github/workflows/release.yml:97-129`).

## 실행 결과 (2026-09-17)

계획대로 진행됐고 예측도 맞았다. wp1의 #245가 머지되어 `main`이 `79a6fd7b`로
올라가자 두 PR은 즉시 `ahead=1 behind=5 status=diverged`가 됐다.

| 단계 | 결과 |
|---|---|
| `gh pr update-branch 242` | head `1cce12ec` → `7e6edcc5` |
| #242 체크 | 9개 전부 green. frontend E2E가 약 18분으로 가장 오래 걸렸다 — Playwright 1.63 Chromium 재설치 때문 |
| #242 머지 | `main` = `12d79185` |
| `gh pr update-branch 243` | head `237754c5` → `d36556d6` |
| #243 PR 체크 | CLEAN |
| full `ci.yml` dispatch | run `35136821075`, `--ref`는 같은 저장소의 head 브랜치, `-f sha=d36556d6` |
| full CI 결과 | 6잡 전부 success: ubuntu node 22.23.0 / 24.17.0, windows node 22.23.0 / 24.17.0, macOS native installation, frontend e2e |
| #243 머지 | `--match-head-commit d36556d6`로 머지, `main` = `22e7c1ab` |

HOLD 판정의 근거였던 package-install smoke는 dispatch한 full CI의 ubuntu·windows·macOS
잡에서 실제로 돌았고 전부 통과했다. 즉 보류는 형식이 아니라 실제로 커버리지를
메웠다. 머지 후 열린 PR은 #229 하나만 남았다.
