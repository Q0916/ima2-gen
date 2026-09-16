---
created: 2026-09-17
updated: 2026-09-17
tags: [ima2-gen, devlog, release, publish, npm, ci]
---

# 050 — wp5: 릴리스 cut과 publish

## 전제

wp1(#244 수정)과 wp2(#242/#243)가 main에 들어간 뒤 시작한다. wp3(#229)는 이 게이트에
포함하지 않는다(030 참조).

## bump 선택

patch. 이번 릴리스에 들어가는 것은 CLI 버그 수정 1건과 의존성 업데이트 2건이다.
새 기능도 공개 계약 변경도 없다. 3.16.0 에서 3.16.1.

## ref 정렬

scripts/release-cut.mjs:53-58 assertBaseline이 요구하는 것: cut 시점의
origin/main이 origin/dev와 origin/preview를 모두 포함할 것.

현재 dev(d48d7b77)는 main(7fa7d426)보다 2커밋 앞서고 역방향은 없다. 따라서
PR 머지 전에 dev를 main에 넣어야 한다. preview는 이미 main과 같아 조건을 만족한다.

순서:

1. dev(d48d7b77)를 main으로 fast-forward 머지
2. PR #244 fix 머지
3. PR #242 머지
4. PR #243을 full CI green 확인 후 머지
5. 최종 origin/main SHA를 expected_sha로 고정

cut 이후는 workflow가 알아서 한다. release.yml의 tag job이 main, dev, 태그를
atomic으로 같은 SHA에 밀고, cut job이 그 전에 preview를 같은 SHA로 올린다.
즉 4개 ref 일치는 우리가 수동으로 맞추는 게 아니라 workflow의 산출물이다.

## dispatch

    gh workflow run release.yml -f bump=patch -f dry_run=false -f expected_sha=FINAL_MAIN_SHA

expected_sha를 반드시 넘긴다. 그 사이 origin/main이 움직이면 cut이 거부된다
(release.yml "Refuse to cut from a moved baseline").

## 승인 게이트 (정정)

초판은 "승인 전에는 main이 움직이지 않는다"고 적었는데 틀렸다. cut job이
release.yml:141-146에서 버전 커밋을 main으로, 그 SHA를 preview로 **먼저 민다.**
npm-stable 게이트는 그 다음 tag job(release.yml:174-188) 앞에 있다.

즉 승인이 거부되거나 방치되면 남는 상태는 "원상복구"가 아니라 다음과 같다.

- main과 preview는 새 버전 커밋을 이미 갖고 있다
- npm preview dist-tag도 이미 올라가 있다
- 태그, dev, npm latest만 옛 버전에 머문다

복구는 **같은 SHA로 tag job을 재실행하고 승인**하는 것이다. 태그만 손으로 미는
우회는 쓰지 않는다 — publish.yml이 v* 태그 push를 받아 stable을 올리기는 하지만
dev가 새 SHA로 따라오지 않아 "네 ref가 한 SHA" 조건을 채우지 못한다.
main/dev/태그를 atomic으로 맞추는 것은 tag job의 push뿐이다(release.yml:210-221).
히스토리는 되감지 않는다.

### 알려진 복구 공백 (A-phase에서 확인)

main과 preview가 이미 움직인 뒤(release.yml:141-146) preview dispatch·대기·proof
단계에서 실패하면 같은 버전으로 되돌릴 방법이 workflow 안에 없다. `tag` job은
`needs: cut`(release.yml:176) 때문에 건너뛰어지고, `cut`을 재실행하면
`scripts/release-cut.mjs:169-184`가 또 한 번 patch bump를 해서 3.16.1이 아니라
3.16.2가 나온다.

이건 release workflow 자체의 성질이고 그 로직 수정은 이 유닛의 범위 밖이다.

실패하면 자동 재시도하지 않는다. 먼저 상태를 읽는다: `main`/`preview`/`dev`/태그가
각각 어디 있고, npm `preview`에 해당 버전과 `gitHead`가 올라갔는지.

여기서 단계별 수동 복구 절차를 미리 적지 않는다. 이 문서의 리뷰에서 그 시도가 세 번
연속 틀렸고(dev 정렬 순서, preview proof의 위치, atomic refspec에서 preview 누락),
매번 같은 이유였다 — 실행해 보지 않은 경로를 산문으로 재구성하는 중이었다.
가드는 코드에 있고 코드가 정답이다. 읽어야 할 곳은 세 군데다.

| 무엇 | 어디 |
|---|---|
| stable publish가 통과해야 하는 것 | `scripts/release-contract.mjs:409-431` `prepareCommand()` — stable 채널이면 `verifyPreviewProof()`(:376-388)를 부른다. npm preview의 `gitHead`가 그 SHA와 다르거나 버전이 후보가 아니면 publish 자체가 거부된다 |
| 네 ref가 일치해야 한다는 요구 | 같은 파일의 `validateRemoteRefs()` |
| cut이 버전을 다시 올리는 지점 | `scripts/release-cut.mjs:169-184` |

따라서 증명되지 않은 stable이 올라갈 위험은 없다. `verifyPreviewProof`가 fail-closed다.
실제 위험은 다른 것이다 — proof나 ref 불일치를 **태그를 민 뒤에** 발견해서 릴리스가
어중간하게 멈추는 것. 그래서 복구할 때는 태그를 마지막에 민다.

확인 순서는 두 단계다. 태그를 만들기 전에는 태그가 아직 없으니 태그를 뺀
`main`·`dev`·`preview` 세 ref가 같은 SHA인지와 preview proof를 확인한다. 태그를 민
뒤 stable publish를 dispatch하기 전에 네 ref 전부를 다시 확인한다. 확인 시점과 push
시점 사이에 ref가 움직일 수 있으므로 push 직전에 다시 읽는다
(`release.yml`의 `assert-remotes-unmoved`가 하는 일이 바로 이것이다).

태그가 이미 밀린 뒤의 실패는 공백이 아니다 — `publish.yml`을 그 태그/SHA로 재dispatch하면
immutable-version 가드와 verify-existing 경로가 안전하게 복구한다.

승인은 **두 번** 필요하다. 하나는 release.yml의 tag job, 다른 하나는
publish.yml:272-284의 publish-stable job이다. 둘 다 environment npm-stable을 쓴다.
publish.yml 쪽 주석은 "release 경로는 이미 승인을 거쳤다"고 설명하지만, GitHub의
environment 승인은 job 단위 배포마다 따로 요청되므로 실제로는 두 번 눌러야 한다.
승인 대기는 설계된 상태이므로 실패로 읽지 않는다.

## 진행 순서와 관측 지점

| 단계 | 관측 |
|---|---|
| baseline / toolchain assert | cut job 초반 스텝 |
| 버전 커밋 + verify:release | 최대 45분 |
| release-candidate ref로 exact-SHA CI 게이트 | 최대 45분 |
| main/preview push, preview publish dispatch | publish.yml 별도 run |
| npm preview proof | release-cut.mjs assert-preview-proof |
| npm-stable 승인 | 사람 승인 필요 |
| 태그 + main/dev atomic push, stable publish | publish.yml 두 번째 run |

## 완료 증거

ref와 dist-tag만으로는 "그 SHA가 실제로 퍼블리시됐다"를 증명하지 못한다. 다음을 모두 남긴다.

    git ls-remote origin refs/heads/main refs/heads/dev refs/heads/preview refs/tags/v3.16.1
    npm view ima2-gen dist-tags --json
    npm view ima2-gen@3.16.1 gitHead dist.integrity --json
    gh run list --workflow release.yml --limit 1
    gh run list --workflow publish.yml --limit 2
    gh release view v3.16.1 --json tagName,createdAt

`--limit` 목록은 어떤 run이 이 릴리스의 것인지 식별하지 못한다. dispatch 직후
release.yml run id를 받아 적고, 그 run의 로그에서 `wait-publish-run.mjs`가 고른
preview/stable publish run id 2개를 꺼내, 세 id를 SHA·버전과 함께 기록한 뒤
`gh run view <id>`로 그 run들을 직접 본다. 최신 목록에 의존하지 않는다.

통과 조건: 네 ref가 한 SHA이고(태그 SHA는 `git ls-remote origin refs/tags/v3.16.1`로
확인한다), npm `gitHead`가 그 SHA와 같고, latest가 3.16.1, preview가 같은 SHA에서 나온
preview 버전이며, run 3건(release.yml 1건 + publish.yml preview/stable 2건)이 전부 success다.

GitHub Release의 `targetCommitish`는 조건에 넣지 않는다. 기존 `v3.16.0`도
`targetCommitish: "main"`이고 릴리스 생성 경로가 `--target <SHA>`를 쓰지 않으므로,
SHA 일치를 기대하면 항상 실패한다. 태그가 가리키는 커밋은 위의 `ls-remote`가 증명한다.

## CHANGELOG

release.yml은 CHANGELOG를 쓰지 않는다. 3.16.1 항목(Fixed: grok 서브커맨드 --help
부작용, Changed: 의존성)을 wp1 PR로 main에 미리 올린 뒤 cut한다.

배치 위치에 주의한다. 이 파일은 Keep a Changelog를 표방하지만 순서가 이미 깨져 있다:
맨 위가 [3.0.0](8행), 그 아래가 [2.0.17](23행), 그 다음이 [3.16.0](29행)이다.
3.16.1은 파일 맨 위가 아니라 [3.16.0] 바로 위(29행 자리)에 넣어 3.x 계열의
역시간순을 유지한다. 기존 순서 이상은 이 유닛에서 고치지 않는다.

## 실패 시

cut이 baseline에서 거부되면 ref 정렬을 다시 확인한다. exact-SHA CI 게이트에서 떨어지면
그 run의 실패 잡을 읽고 원인을 고친 뒤 새 SHA로 재시도한다. 재시도는 버전 커밋이 이미
생겼는지 확인하고 진행한다. 같은 버전으로 두 번 cut하지 않는다.
