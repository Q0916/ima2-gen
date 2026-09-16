---
created: 2026-09-17
updated: 2026-09-17
tags: [ima2-gen, devlog, release, receipt, v3161, npm]
---

# 060 — v3.16.1 릴리스 영수증

## 결과

| 항목 | 값 |
|---|---|
| 릴리스 SHA | `5f33e44a7886580330ee03ea58a71a4d842014e5` |
| main / dev / preview / `v3.16.1` | 넷 다 위 SHA |
| npm `latest` | `3.16.1`, `gitHead` = 릴리스 SHA |
| npm `preview` | `3.16.1-preview.260916.35153931198.1` |
| GitHub Release | `v3.16.1`, draft 아님 |
| release.yml run | `35151588524` (cut 실패로 종료) |
| publish.yml preview run | `35153931198` |
| publish.yml stable run | `35156141260` |
| 후보 CI run | `35151940071` (전 잡 success) |
| cut 기준 SHA | `expected_sha=2d912438` |

내용물: 이슈 #244 grok 서브커맨드 `--help` 수정(PR #245), `@openai/codex` 0.153.4(#243),
`@playwright/test` 1.63.0과 `@types/react-dom` 19.2.7(#242), devlog·structure 문서(#246, #247).

## 두 publish 잡이 "실패"로 끝났는데 실제로는 성공했다

preview와 stable 둘 다 같은 패턴이었다.

```
Publish tested tarball                          success
Verify registry, dist-tag, integrity, ...       failure  (E404)
```

`npm publish`는 성공했고 마지막 줄에 이렇게 찍혔다.

```
npm notice Your package is being processed and may take a few minutes to become available.
+ ima2-gen@3.16.1-preview.260916.35153931198.1
```

npm이 비동기로 받아들인 것이다. 뒤이어 도는 `verify-registry`가 레지스트리를 폴링했지만
그 창 안에 나타나지 않아 E404로 떨어졌다. preview는 21:58:43에 publish되고 **22:04:52**에
레지스트리에 나타났다 — 약 6분. 5.3MB 패키지에 provenance 서명까지 붙는 조합이라
처리 시간이 길었던 것으로 보인다.

즉 실패한 것은 퍼블리시가 아니라 검증의 인내심이다. 같은 증상이 과거 3.0.6 preview에서도
있었다(run `31760290401`).

**교훈: 이 저장소에서 publish 잡이 `Verify registry`에서 떨어지면 재퍼블리시하기 전에
레지스트리를 직접 확인한다.** `curl -s https://registry.npmjs.org/ima2-gen`로
`dist-tags`와 버전 목록을 보면 된다. 이미 올라가 있는데 다시 publish를 시도하면
`guard-publish`의 immutable-version 가드에 막힌다.

## 실제로 밟은 복구 경로

cut 잡이 "Wait for the preview publish to finish"에서 실패했으므로 `tag` 잡은
`needs: cut` 때문에 건너뛰어졌다. 이게 050이 예고한 바로 그 공백이다 — main과 preview는
이미 `5f33e44a`로 움직인 상태였고, `cut`을 재실행하면 3.16.1이 아니라 3.16.2가 나온다.

재실행하지 않고 다음을 했다.

1. 레지스트리를 직접 읽어 preview가 실제로 올라간 것을 확인.
2. `node scripts/release-cut.mjs assert-preview-proof 3.16.1 5f33e44a...` → exit 0.
   `gitHead`가 릴리스 SHA와 정확히 일치.
3. push 직전에 main/preview를 다시 읽어 안 움직인 것과 태그가 없는 것을 확인한 뒤,
   `git tag v3.16.1 <SHA>`와
   `git push --atomic origin <SHA>:refs/heads/main <SHA>:refs/heads/dev refs/tags/v3.16.1:refs/tags/v3.16.1`.
   `dev`가 `d48d7b77`에 남아 있었으므로 이 push가 네 ref를 한 SHA로 모으는 지점이다.
4. 태그 push가 `publish.yml`을 트리거(run `35156141260`). `prepare`가
   `verifyPreviewProof`와 `validateRemoteRefs`를 통과.
5. `npm-stable` 승인 후 stable publish. 또 같은 검증 실패로 잡은 빨갛지만
   `ima2-gen@3.16.1`은 `gitHead` = 릴리스 SHA로 올라갔고 `latest`가 그것을 가리킨다.
6. `publish-stable`이 실패로 기록돼 `create-github-release`가 건너뛰어졌으므로,
   run artifact를 내려받아 `node scripts/release-contract.mjs ensure-github-release 3.16.1 <SHA> <dir>`를
   직접 실행. 이 명령이 `verifyRegistryEventually`를 다시 돌려 통과시킨 뒤 Release를 만들었다.

빠진 것 하나: `create-github-release` 잡의 `actions/attest-build-provenance` 단계는
workflow OIDC가 필요해서 로컬에서 재현하지 않았다. npm publish 자체의 provenance는
정상적으로 서명됐다(sigstore logIndex 2868139575).

## 050에 반영할 후속

리뷰가 마지막에 지적한 것 중 문서에 아직 안 들어간 사실: `release.yml`의
`assertRemotesUnmoved({ sha, main, preview })`는 `dev`를 검사하지 않고,
`assert-preview-proof`보다 **먼저** 돈다. 이번 복구에서 실제로 `dev`를 직접 읽어야 했던
이유가 그것이다 — workflow가 대신 봐주지 않는다.
