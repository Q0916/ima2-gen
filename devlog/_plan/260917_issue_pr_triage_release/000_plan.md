---
created: 2026-09-17
updated: 2026-09-17
tags: [ima2-gen, devlog, triage, release, roadmap]
---

# 000 — 열린 이슈/PR 정리와 릴리스 계획

## 결론

2026-09-17 기준 열려 있는 항목은 이슈 2건(#244, #150)과 PR 3건(#243, #242, #229)이다.
이 유닛은 그 5건을 하나씩 판정해 닫고, 그 결과로 만들어진 `main`에서 릴리스를 잘라
npm `preview`와 `latest`까지 올린다. 구현이 실제로 필요한 것은 #244 하나뿐이고
나머지는 머지 판정, 검증 게이트, triage 기록이다.

## 시작 상태 (실측)

| 대상 | 상태 | 근거 |
|---|---|---|
| `origin/main` | `7fa7d426` (v3.16.0 릴리스 커밋) | `git log -1 origin/main` |
| `origin/preview` | `7fa7d426` — main과 동일 | `git log -1 origin/preview` |
| `origin/dev` | `d48d7b77` — main보다 2커밋 앞섬 (#241 릴리스 영수증 문서) | `git log origin/main..origin/dev` |
| npm dist-tags | `latest 3.16.0`, `preview 3.16.0-preview.260909.34305686185.1` | `npm view ima2-gen dist-tags --json` |

`dev`는 `main`의 자손이고 역방향 커밋이 없다. 따라서 ref 정렬은 머지가 아니라
fast-forward로 끝난다.

## 제약

- `scripts/release-cut.mjs` `assertBaseline`은 cut 시점의 `origin/main`이
  `origin/dev`와 `origin/preview`를 모두 포함할 것을 요구한다
  (`scripts/release-cut.mjs:53-58`). 즉 cut 전에 `dev`가 `main`에 들어가 있어야 한다.
- 릴리스는 로컬 스크립트가 아니라 `release.yml` workflow_dispatch로만 돈다.
  `tag` job은 `npm-stable` environment 승인 게이트 뒤에 있다
  (`.github/workflows/release.yml` `environment: name: npm-stable`).
- `expected_sha`를 넘기면 `origin/main`이 그 사이 움직였을 때 cut이 거부된다.
  모든 머지가 끝난 뒤의 정확한 SHA를 고정해서 넘긴다.
- **devlog 유닛은 gitignore된다.** `.gitignore:13`의 `devlog/_plan/*`가 새 유닛을
  전부 잡는다. 기존 유닛이 추적되는 것은 과거에 force-add 했기 때문이다.
  따라서 이 유닛도 `git add -f devlog/_plan/260917_issue_pr_triage_release`로 넣고,
  커밋 전에 `git ls-files`로 6개 파일이 전부 추적되는지 확인한다.
  (초판에서 `git check-ignore devlog/_plan/README.md`가 미매치를 반환한 것을 근거로
  "무시되지 않는다"고 적었는데, 그 명령은 이미 추적 중인 파일을 무시 대상으로 보고하지
  않는다. 검사 자체가 무효였다. A-phase에서 정정.)

## work-phase map (의존 순서)

실행 순서는 의존성이 아니라 **ref 상태**가 정한다. `dev`를 `main`으로 올리는 일이
모든 머지보다 먼저 와야 한다. 그러지 않으면 cut 직전에 `main`이 다시 움직여
`expected_sha`가 깨지고, `dev` 승격 후에는 dependabot PR 2건이 `main`보다 뒤처져
다시 업데이트해야 한다.

```
wp0 roadmap (이 문서)
  ↓
wp1  (a) dev → main fast-forward 선행
     (b) #244 grok --help 수정 PR (base = 승격된 main)
  ↓
wp2  #242 / #243 를 새 main 기준으로 update 후 머지
  ↓
wp5  릴리스 cut & publish (expected_sha = 최종 main)

wp3  PR #229 판정   — 별도 레인, 릴리스 게이트 아님
wp4  #150 triage    — 별도 레인, 릴리스 게이트 아님
```

goalplan의 `wp5.dependsOn`에는 `wp3-pr229`가 들어 있다. goalplan의 의존성은 생성 후
수정되지 않으므로, wp3는 릴리스 dispatch 전에 **판정이 끝나야** 한다(머지 또는 종료).
판정을 뒤로 미루는 것은 criteria를 약화시키는 것이라 하지 않는다.

| # | 문서 | 내용 |
|---|---|---|
| wp1 | `010_grok_help_fix.md` | 이슈 #244. `bin/commands/grok.ts` 서브커맨드 `--help` 부작용 제거 + 회귀 테스트 |
| wp2 | `020_dependabot_merges.md` | PR #242 머지, PR #243은 exact-head full CI 통과 후 머지 |
| wp3 | `030_pr229_disposition.md` | PR #229 GPT-6 Astra. UNSTABLE 체크 원인 규명 후 머지 또는 거부 |
| wp4 | `040_issue150_triage.md` | RFC #150 재확인 + disposition 코멘트. 구현은 범위 밖 |
| wp5 | `050_release_cut_and_publish.md` | ref 정렬 → `release.yml` dispatch → preview → tag/latest |

## SSOT 갱신 소유자

`structure/00-structure-hub.md:91`은 "active roadmap이 바뀌면 `07-devlog-map.md`를
갱신"을 요구한다. 지금 `structure/07-devlog-map.md:123-131`의 Active units 표는
이미 끝난 v3.16 작업(PR 스택 #233-#237, "Remaining: merge and the v3.16 release")을
열린 것으로 서술하고 이 유닛을 담지 않는다. `devlog/_plan/README.md:23-40`도 같다.

| 문서 | 갱신 내용 | 소유 work-phase |
|---|---|---|
| `structure/07-devlog-map.md` | Active units에서 260909 유닛을 완료로 내리고 이 유닛 추가 | wp1 (PR에 포함) |
| `devlog/_plan/README.md` | Active Lane 표 갱신, #150 행 재확인 결과 반영 | wp1 / wp4 |
| `CHANGELOG.md` | `## [3.16.1]` 항목 추가 | wp1 (cut 전 main에 존재해야 함) |

## 범위 밖

Provider Adapter v1 구현(#150 본문), UI 재설계, 이 PR 3건 외의 의존성 업그레이드,
release workflow 로직 자체의 변경, 퍼블리시된 히스토리 재작성.

## 완료 판정

11개 criteria가 `.codexclaw/goalplans/triage-and-close-out-every-currently-open-ima2-g/goalplan.json`에
등록되어 있다. 요약하면: #244가 머지된 수정으로 닫히고 `grok login/logout --help`가
부작용 없이 도움말만 출력하며, PR 3건이 각각 증거와 함께 머지 또는 종료되고,
#150에 명시적 disposition이 남고, `main`/`dev`/`preview`/새 태그가 한 SHA로 모이고,
npm `preview`와 `latest`가 새 버전을 가리킬 때 DONE이다.
