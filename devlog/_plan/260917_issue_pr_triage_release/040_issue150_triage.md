---
created: 2026-09-17
updated: 2026-09-17
tags: [ima2-gen, devlog, issue-150, rfc, triage, provider-adapter]
---

# 040 — wp4: RFC #150 triage

## 범위

구현하지 않는다. 현재 코드 기준으로 수용 조건이 어디까지 찼는지 다시 재고,
명시적 disposition을 이슈에 남긴다. devlog/_plan/README.md의 "열린 이슈" 행도 같이 갱신한다.
structure/00-structure-hub.md:91이 요구하는 structure/07-devlog-map.md의 Active units
갱신은 wp1 PR이 소유한다(000_plan.md "SSOT 갱신 소유자" 표).

## 직전 기록

devlog/_plan/README.md가 2026-08-31 재확인 결과를 들고 있다. 수용 조건 6개 중
3개 미충족 + 1개 부분, registry 10 lane 중 어댑터 4개(minimax, atlascloud, comfy, nai),
generateImage/editImage 구현 0건, UI provider 분기 17곳, packages/ 미존재.

## 이번에 다시 잴 지표

| 지표 | 측정 방법 |
|---|---|
| 어댑터 수 / registry lane 수 | lib/providers/adapters/ 목록 대 lib/providers/registry.ts 항목 수 |
| generateImage/editImage 구현 | ripgrep으로 lib/providers/ 안에서 두 심볼 검색 |
| UI provider 분기 | ripgrep으로 ui/src/ 안의 provider 동등비교 개수 |
| packages/ 워크스페이스 | 디렉터리 존재 여부 |

2026-08-31 이후 들어온 유닛은 grok 네이티브 OAuth 전환(260909_grok_native_oauth)이다.
이건 어댑터 추상화가 아니라 grok 레인의 자격증명 경로 변경이므로 RFC 진척으로 세지 않는다.
수치가 바뀌었으면 바뀐 값을, 안 바뀌었으면 "변화 없음"을 근거와 함께 적는다.

## disposition 형식

이슈 #150에 코멘트 한 건. 내용은 (1) 측정 일자와 커밋 SHA, (2) 수용 조건별 충족/미충족,
(3) 그 사이 들어온 관련 변경, (4) 다음 재확인 트리거. RFC를 닫지 않는다 —
로드맵 항목으로 열어 둔다.

## 후속으로 넘길 것 (구현 아님, 기록만)

#244와 같은 계열의 --help 무시가 다른 그룹에도 남아 있다: bin/commands/config.ts:177-193,
bin/commands/node.ts:158-177의 node show, bin/commands/session.ts:83-95의 session rm.

다만 session rm은 파괴적이지 않다. rmSub는 positional id가 없으면
die(2, "session id required")로 먼저 빠지므로(bin/commands/session.ts:84-86),
session rm --help는 도움말 대신 exit 2 에러를 낼 뿐 세션을 지우지 않는다.
초판에서 "파괴적"이라고 적은 것은 grok logout의 동작을 유추 적용한 오류다. A-phase에서 정정.

즉 남은 것은 UX 결함이지 데이터 손실 위험이 아니다. #244 범위 밖이므로 이번에는
고치지 않고 별도 이슈로 올린다.

## 실행 결과 (2026-09-17)

`main` `22e7c1ab`에서 재측정하고 이슈에 disposition 코멘트를 남겼다
(issuecomment-5703350248). 판정: **KEEP OPEN.**

| 수용 조건 | 2026-08-31 | 2026-09-17 |
|---|---|---|
| core 변경 5파일 이하 | 부분 | 부분 |
| UI provider switch 없음 | 미충족 | 미충족 (31파일 76줄) |
| registry 자동 생성 | 부분 | 부분 |
| contract suite 자동 적용 | 부분 | 부분 (7/10 등록) |
| adapter 오류 정규화 소유 | — | 충족 |
| core 밖 패키지 로딩 | 미충족 | 미충족 (packages/ 없음) |

어댑터 등록은 4→7로 늘었고 `lib/providers/` 12커밋 중 7개가 RFC를 밀었다. 그런데
가장 무거운 둘(UI 분기 제거, `packages/` 경계)은 그대로다.

게시 전 fact-check 리뷰어가 3건을 잡았다. 커밋 분류에서 `64bc7ffe`가 빠져 6/6이
아니라 7/5였고, `generateImage`/`editImage` 주장은 어댑터 멤버로 좁혀야 했으며,
수용 조건 3은 충족이 아니라 부분이다 — `limits.timeoutMs`/`maxInputBytes`는
파생되지도 소비되지도 않는다. 세 건 다 반영해서 올렸고, 결과적으로 판정 근거가
더 보수적으로 바뀌었다.

이전 기록의 "UI 분기 17곳"과는 직접 비교하지 않았다. 그 측정의 명령이 남아 있지
않아 같은 것을 센 건지 알 수 없다. 코멘트에 재현 가능한 명령을 실어 다음 재확인의
기준선으로 삼았다.
