---
created: 2026-09-17
updated: 2026-09-17
tags: [ima2-gen, devlog, cli, grok, bugfix, issue-244]
---

# 010 — wp1: `ima2 grok <sub> --help` 부작용 제거 (이슈 #244)

## 결함

`grokCmd`는 그룹 레벨에서만 `--help`를 본다. `argv[0]`가 `login`/`status`/`logout`이면
나머지 인자를 파싱하지 않고 바로 실행한다 (`bin/commands/grok.ts:178-192`).

- `ima2 grok login --help` → `loginCmd()`가 서버 탐색 후 device-code 발급 시작.
  출력이 즉시 나오지 않고 3초 간격 폴링에 들어가 hang처럼 보인다.
- `ima2 grok logout --help` → `clearGrokCredentials()`가 먼저 실행된다.
  이 함수는 `rmSync(grokAuthFilePath(homeDir), { force: true })`로
  `~/.progrok/auth.json`을 실제로 지운다 (`lib/xaiAuth.ts:150-153`).
  `force: true` 때문에 파일이 없어도 성공으로 보고한다. 이슈 작성자가 위험해서
  실행하지 않았다고 적은 케이스인데, 실제로 세션이 삭제된다.
- `ima2 grok status --help` → `SPEC`에 `help` 플래그가 선언되어 있는데
  `statusCmd`가 `args.help`를 읽지 않아 세션 상태를 출력한다
  (`bin/commands/grok.ts:41-47`, `bin/commands/grok.ts:157-176`).

심각도는 인증/세션 파괴이므로 High. C1 단일 파일 수정이지만 auth 경로의 실행 로직을
건드리므로 cxc-dev §0.1 기준 fast-path가 아니라 회귀 테스트를 동반한다.

## 저장소의 기존 관례

루트 CLI는 `helpOwningCommands`에 든 명령에 한해 도움말 처리를 모듈에 위임하고
argv를 그대로 넘긴다 (`bin/ima2.ts:443-450`, `bin/ima2.ts:529-535`). `grok`은 그 목록에 있다.

동작하는 그룹 명령의 공통 형태는 "서브커맨드가 자기 argv를 파싱하고, 부작용 전에
도움말을 반환"이다.

| 참조 | 위치 |
|---|---|
| `video` 서브커맨드별 argv 분배 | `bin/commands/video.ts:205-220` |
| `video edit`가 필수 인자 검사 전에 help 반환 | `bin/commands/video.ts:257-271` |
| `gen`이 프롬프트 검증 전에 help 반환 | `bin/commands/gen.ts:388-397` |
| `skill`이 내부 분배 전에 전체 argv 파싱 | `bin/commands/skill.ts:222-231` |

`parseArgs`는 `help: { short: "h", type: "boolean" }` 선언만으로 `--help`와 `-h`를
모두 인식한다 (`bin/lib/args.ts:24-35`, `51-89`). `bin/lib/`에 공용 help/usage 헬퍼는
없다 — 새 추상화를 만들지 않고 `parseArgs` + `out`만 쓴다 (DEV-NECESSITY-01).

동일 결함이 `session rm` (`bin/commands/session.ts:83-95`), `config`
(`bin/commands/config.ts:177-193`), `node show` (`bin/commands/node.ts:158-177`)
에도 있지만 이슈 범위 밖이다. #244는 `grok`만 고치고, 나머지는 040에서 후속으로 기록한다.

## 변경 (MODIFY `bin/commands/grok.ts`)

1. `HELP` 아래에 `LOGIN_HELP`, `STATUS_HELP`, `LOGOUT_HELP` 템플릿 리터럴 3개 추가.
   기존 `HELP`와 같은 2칸 들여쓰기, 같은 톤.
2. `loginCmd()` → `loginCmd(argv: string[])`. 첫 줄에서
   `const args = parseArgs(argv, SPEC); if (args.help) { out(LOGIN_HELP); return; }`.
   서버 탐색(`findRunningServer`)보다 앞에 둔다.
3. `statusCmd(argv)`의 `parseArgs` 직후, `loadGrokCredentials()` 앞에 동일한 help 분기.
4. 인라인이던 logout 블록을 `logoutCmd(argv: string[]): void`로 추출하고,
   `clearGrokCredentials()` 앞에 help 분기.
5. 디스패치를 `loginCmd(rest)` / `statusCmd(rest)` / `logoutCmd(rest)`로 바꾼다.

before:

```ts
  const rest = argv.slice(1);
  if (sub === "login") return loginCmd();
  if (sub === "status") return statusCmd(rest);
  if (sub === "logout") {
    clearGrokCredentials();
    out(color.green("✓ ") + "Removed the stored Grok OAuth session");
    return;
  }
```

after:

```ts
  const rest = argv.slice(1);
  if (sub === "login") return loginCmd(rest);
  if (sub === "status") return statusCmd(rest);
  if (sub === "logout") return logoutCmd(rest);
```

유지되는 계약: 도움말은 `out()`으로 stdout에 나가고 exit 0. 알 수 없는 서브커맨드는
계속 `die(2, ...)`. 로그인 실패는 계속 exit 1. 파일은 500줄, 함수는 50줄 아래를 유지한다.

## 테스트 (MODIFY `tests/cli-help-safety-contract.test.js`)

새 파일을 만들지 않는다. 이 파일이 이미 "도움말은 부작용이 없다" 계약을 소유하고 있고
(`tests/cli-help-safety-contract.test.js:29-46`), `runCLI` 헬퍼와 격리 HOME 패턴이 있다.
기존 파일 수정이므로 `docs/migration/runtime-test-inventory.md` 재생성이 필요 없다
(`scripts/classify-tests.mjs:17-35`). 그래도 `npm run test:inventory`로 확인한다.

추가할 케이스 3개. 공통 픽스처: `mkdtemp` 루트를 `HOME`/`USERPROFILE`/`IMA2_CONFIG_DIR`로
주고 `<root>/.progrok/auth.json`에 sentinel 자격증명을 심는다. `grokAuthFilePath`가
`homedir()` 기준이므로 이 격리로 실사용자 세션이 보호된다 (`lib/xaiAuth.ts:122-124`).

| 케이스 | 단언 |
|---|---|
| `grok login --help` | exit 0, stdout에 `ima2 grok login`, device-code 문구(`enter the code`) 없음, `auth.json` 바이트 동일 |
| `grok logout --help` | exit 0, stdout에 `ima2 grok logout`, `auth.json` 바이트 동일 (핵심 회귀) |
| `grok status -h` | exit 0, stdout에 `ima2 grok status`, 세션 상태 문구(`expires:`) 없음 |

`runCLI` (`tests/cli-help-safety-contract.test.js:8-18`)에는 타임아웃이 없다. 가드가
회귀하면 `login`이 3초 간격 폴링에 들어가 테스트가 실패하는 대신 30분간 매달린다.
케이스를 추가하기 전에 `runCLI`에 child-process 데드라인을 넣는다: 타이머로
`child.kill("SIGKILL")`을 걸고 `timedOut: true`를 resolve 값에 실어, `close` 핸들러의
`finally`에서 타이머를 해제한다. 단언은 `timedOut`이 false인지 먼저 본다. 기존
`backfill-thumbs` 케이스는 이 변경에 영향받지 않는다.

red-green 확인: 수정 전 코드에 대해 logout 케이스가 실패(파일 삭제)하는 것을 먼저 본다.
login 케이스는 수정 전이면 네트워크 폴링으로 늘어지므로 사전 확인은 logout/status로 한다.
데드라인이 들어간 뒤에는 login 케이스도 유한 시간 안에 실패한다.

## 검증

```
npm run typecheck
npm run typecheck:tests
node --test tests/cli-help-safety-contract.test.js
npm run test:inventory
```

추가로 실제 홈을 건드리지 않는 수동 증거: 격리 HOME에서
`node --import tsx bin/ima2.ts grok logout --help` 실행 후 seeded `auth.json` mtime 불변.

## 배달

선행: `origin/dev`(`d48d7b77`)를 `main`으로 fast-forward 승격. 이 유닛의 브랜치는
승격된 `main`에서 딴다.

브랜치 `codex/issue244-grok-subcommand-help`, base `main`. PR 본문에 `Closes #244`.
이 PR이 함께 싣는 것: 이 devlog 유닛(`git add -f`), `CHANGELOG.md`의 `3.16.1` 항목,
`structure/07-devlog-map.md`와 `devlog/_plan/README.md`의 Active units 갱신.
체크 green 후 머지.
