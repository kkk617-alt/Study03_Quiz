# 상식 퀴즈 웹 앱 — 구현 계획서

> **For agentic workers:** 실행 방식은 **Native**로 확정됐다 (2026-10-07). REQUIRED SUB-SKILL: superpowers:executing-plans 로 이 계획을 과제 단위로 직접 구현한다. 과제마다 커밋하고, 한 단계가 끝나면 멈춰 사용자의 브라우저 확인을 받는다. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카테고리 4개 × 10문항의 4지선다 상식 퀴즈를, 답을 고른 자리에서 해설·출처를 보여 주는 형태로 만들고, 3개 모드·복습 라운드·로컬 순위표까지 `file://`에서 동작하는 정적 파일 4개로 완성한다.

**Architecture:** 전역 `const`로 서로를 참조하는 일반 `<script>` 4파일 구조(모듈 없음). 단일 `state` 객체가 진실의 원천이고 모든 화면은 `state`를 읽어 다시 그린다. 모드 차이(시간 제한·힌트·점수·기록·복습)는 코드 분기가 아니라 `MODES` 설정 테이블의 데이터로 표현한다.

**Tech Stack:** 바닐라 HTML / CSS / JavaScript (ES2015+), `localStorage`. 빌드 도구·패키지 매니저·외부 라이브러리·웹폰트 전부 없음.

**Spec:** [PRD.md](PRD.md)

## Global Constraints

- `file://` 프로토콜로 `index.html`을 직접 열어 동작해야 한다. 서버·빌드·설치 금지 (PRD §1.3-4, §5.1).
- 산출 파일은 정확히 4개: `index.html`, `style.css`, `questions.js`, `script.js`. 5번째 파일(`test.html` 포함)을 추가하지 않는다 (PRD §5.2, §8).
- `type="module"` 금지. `import` / `export` 금지. `fetch()` 금지 (PRD §5.1).
- 외부 CDN·라이브러리·웹폰트·아이콘셋 사용 금지. 시스템 폰트 스택만 사용 (PRD §5.1).
- `index.html`은 `questions.js`를 `script.js`보다 **먼저** 로드한다 (PRD §5.2).
- `questions.js`에는 데이터만 둔다. 로직을 넣지 않는다 (PRD §4.1).
- 모든 `localStorage` 읽기·쓰기를 `try/catch`로 감싼다. 저장 실패가 퀴즈 동작을 멈추게 하면 안 된다 (PRD §3.9.2).
- UI 언어는 한국어. 카테고리 4개 × 정확히 10문항 = 40문항 (PRD §2.1).
- 만점은 모든 모드에서 10점. 감점 없음. 점수 서식은 정수면 `8 / 10`, 소수면 `7.5 / 10` (PRD §2.3).
- `localStorage` 키는 `quiz.scores.v1` 고정 (PRD §3.8.5).
- 스피드 모드 제한 시간은 문항당 15초. 힌트 사용 후 정답은 0.5점 (PRD §2.2).
- 화면 폭 360px까지 레이아웃이 깨지지 않아야 한다 (PRD §5.2, 부록 A).
- `script.js` 내부는 PRD §5.3의 10개 섹션 순서를 주석 경계로 유지한다.
- 모든 문항 출처는 PRD §4.3 허용 목록에 해당해야 한다. 개인 블로그·위키 미러·커뮤니티 게시물 금지.

## Review Focus

PRD가 요구하지만 각 과제의 기본 확인 절차만으로는 드러나지 않는, 사용자를 물 가능성이 가장 높은 6가지. 각 줄의 검증은 해당 과제의 확인 단계에 포함되어 있다.

1. **보기를 섞은 뒤 정답 위치 재계산이 틀리면 전 문항이 조용히 오답 처리된다.** 화면상으로는 정상이고 점수만 0이 되므로 눈으로 못 잡는다. → Task 3, 콘솔 전수 검증.
2. **다음 문항으로 넘어갈 때 `hintUsed` / `hintRemoved`를 초기화하지 않으면 점수가 오염된다.** 1번 문항에서 힌트를 쓰면 이후 모든 정답이 0.5점이 되거나, 2번 문항의 보기가 처음부터 지워진 채 뜬다. → Task 11.
3. **복습을 두 번 이상 돌리면 `baseScore`가 복습 점수로 덮어써진다.** 원점수가 실력 지표 기능을 잃는다 (PRD 부록 A). → Task 12.
4. **시간 초과·해설 상태에서 보기 클릭이 받아들여지면 점수가 뒤집힌다.** PRD §3.4·§3.9.3은 보기 비활성을 요구하지만, 비활성 속성만 걸고 핸들러에서 `phase`를 확인하지 않으면 키보드나 라벨 클릭으로 통과된다. → Task 3, Task 10.
5. **점수 서식이 `8`을 `8.0`으로 표시한다.** PRD §2.3은 정수면 소수점 없이 쓰라고 요구하는데 `toFixed(1)` 한 줄로 끝내면 전 모드에서 틀린다. → Task 4.
6. **순위표 동점 정렬과 상위 5개 절단.** 6번째 기록을 넣었을 때 가장 낮은 기록이 밀려나야 하고, 동점이면 최근 기록이 위여야 한다 (PRD §3.8.5). 눈으로는 5줄만 보여 맞아 보인다. → Task 13.

## File Structure

| 파일 | 책임 | 최초 생성 |
|---|---|---|
| `index.html` | 화면 5개의 DOM 골격, 스크립트 로드 순서 | Task 2 |
| `style.css` | 전체 스타일, 데스크톱 + 360px 대응 | Task 2 |
| `questions.js` | `CATEGORIES`, `QUESTIONS` 데이터만 | Task 1 |
| `script.js` | PRD §5.3의 10개 섹션 전부 | Task 2 |

`script.js`가 400~600줄을 넘어 관리가 어려워지면 PRD 부록 B에 따라 일반 `<script>` 태그 기준의 파일 분리를 재검토한다. 그 전까지는 단일 파일을 유지한다.

## 검증 방식에 관한 메모

PRD §7.2·§8은 파일 4개 제약 때문에 별도 테스트 파일(`test.html`)을 범위 밖으로 둔다. 대신 점검을 앱 안에 넣는다. 이 계획의 검증 단계는 세 종류다.

- **자체 점검 (`?test`)** — 주소 끝에 `?test`를 붙이면 `script.js`가 점검 항목을 실행하고 콘솔에 `자체 점검 결과: 통과 N, 실패 M`을 찍는다 (PRD §7.2). 1단계의 점검 항목은 12개다.
- **콘솔 검증** — DevTools 콘솔에 붙여넣는 한 줄 표현식. 파일을 추가하지 않으므로 4파일 제약을 지키면서 섞기·점수·힌트·정렬처럼 눈으로 안 보이는 부분을 확인한다. 각 단계에 기대 출력이 명시된다.
- **브라우저 확인** — 각 단계 끝의 체크리스트. 사람이 직접 클릭해서 본다.

이 방식은 자동 테스트보다 약하다. 리팩터링 시 자동으로 재실행되지 않는다. PRD가 명시적으로 수용한 한계이므로 그대로 따른다.

## 사전 준비 (Task 1 시작 전 1회)

```bash
git init && git add PRD.md IMPL-PLAN.md && git commit -m "docs: add PRD and implementation plan"
```

---

# 1단계 — 연습 모드와 점수

## 만들 것

- `questions.js` 전체: `CATEGORIES` 4개 + 카테고리당 10문항, 총 40문항 (출처 URL 실제 확인 포함)
- `index.html` / `style.css` / `script.js` 골격
- `validateQuestions()` — 로드 시 1회 데이터 검증, 실패 시 시작 전면 차단
- 시작 화면: 카테고리 4개 선택 (모드 선택은 없다)
- 문항·보기 섞기 (`buildDeck`), 정답 위치 런타임 재계산
- 문제 화면 → 보기 선택 → **같은 화면에서** 정답 여부 + 한 줄 해설 + 출처
- 점수 계산(정답 1점, 오답 0점)과 결과 화면
- 360px까지 대응하는 레이아웃

**만들지 않을 것**: 모드 선택 화면, 타이머, 힌트, 복습 라운드, 순위표, "순위표에 기록되지 않음" 문구 (PRD §6.1 — 1단계에는 순위표가 없으므로 없는 기능을 가리키는 문구를 넣지 않는다).

## 완료 기준 (PRD §6.1)

- [ ] `index.html`을 `file://`로 열면 시작 화면이 뜬다
- [ ] 카테고리 4개가 모두 보이고, 각각 선택하면 10문항이 시작된다
- [ ] 보기를 고르면 즉시 정답 여부 + 한 줄 해설 + 출처가 같은 화면에 나타난다
- [ ] 오답을 고르면 정답 보기가 강조된다
- [ ] 해설 상태에서 보기를 다시 클릭해도 답이 바뀌지 않는다
- [ ] 진행 표시가 `1 / 10` → `10 / 10`으로 올라간다
- [ ] 10문항 후 결과 화면에 점수가 `N / 10`으로 표시된다
- [ ] 같은 카테고리를 두 번 풀면 문항 순서와 보기 순서가 달라진다
- [ ] `questions.js`의 `answerIndex`를 일부러 `9`로 고치면 시작이 차단되고 콘솔에 오류가 찍힌다
- [ ] 40문항 전체가 PRD §4.4 체크리스트를 통과한다
- [ ] 화면 폭 360px에서 보기 버튼이 넘치지 않는다

## 브라우저에서 직접 확인할 항목

1단계가 끝나면 아래를 순서대로 해 본다.

1. 파일 탐색기에서 `index.html`을 더블클릭한다. 주소창이 `file:///C:/Users/Study03_Quiz/index.html`이고 시작 화면에 카테고리 4개가 보인다.
2. `한국사`를 누른다. 상단에 `한국사 · 연습`, `1 / 10`, `점수 0`이 보이고 문항과 보기 4개가 나온다.
3. **일부러 틀린 보기**를 고른다. 화면이 바뀌지 않고 그 자리에 `✗ 오답`, 고른 보기는 빨간색·정답 보기는 초록색으로 표시되고, 한 줄 해설과 그 아래 작은 글씨 출처 링크가 나온다. 출처 링크를 누르면 새 탭에서 출처가 열린다.
4. 해설이 뜬 상태에서 **다른 보기를 여러 번 클릭**한다. 아무 일도 일어나지 않고 해설도 점수도 바뀌지 않는다.
5. `[다음]`을 눌러 10문항까지 간다. 마지막 문항의 버튼이 `[결과 보기]`로 바뀌어 있다.
6. 결과 화면 점수가 내가 맞힌 개수와 일치한다. 정수면 소수점이 붙지 않는다. 그 아래 문항별 정답·오답 목록이 보인다.
7. `같은 모드 다시`를 누른다. 문항 순서와 보기 순서가 방금과 다르다. 점수는 0부터 다시 시작한다. `처음으로`를 누르면 시작 화면으로 돌아간다.
8. 나머지 카테고리 3개도 각각 눌러 10문항이 뜨는지 본다.
9. 브라우저 창 폭을 360px까지 좁힌다. 긴 보기 텍스트가 버튼을 넘치거나 가로 스크롤을 만들지 않는다.
10. 주소 끝에 `?test`를 붙여 새로 고치고 F12 콘솔을 본다. `자체 점검 결과: 통과 12, 실패 0`이 찍힌다.
11. `questions.js`에서 아무 문항의 `answerIndex`를 `9`로 바꾸고 새로 고친다. 시작 화면에 `문항 데이터에 오류가 있습니다`가 뜨고 카테고리 버튼이 눌리지 않으며, F12 콘솔에 어느 문항이 왜 잘못됐는지 목록이 찍힌다. 값을 되돌린다.

---

### Task 1: `questions.js` — `CATEGORIES`와 한국사 10문항

**Files:**
- Create: `questions.js`

**Interfaces:**
- Produces: 전역 `CATEGORIES` — `{ id: string, name: string }[]`, 정확히 `[{id:'korean-history',name:'한국사'}, {id:'world-geography',name:'세계지리'}, {id:'science',name:'과학'}, {id:'arts-culture',name:'예술과 문화'}]`.
- Produces: 전역 `QUESTIONS` — `Record<categoryId, Question[]>`. `Question = { id: string, question: string, options: [string,string,string,string], answerIndex: 0|1|2|3, explanation: string, source: { title: string, url: string } }`.
- 이 과제에서는 `QUESTIONS['korean-history']`만 10개 채운다. 나머지 3개 키는 `[]`로 선언해 Task 5~7이 채운다.

- [ ] **Step 1: `questions.js`에 `CATEGORIES`와 `QUESTIONS` 골격을 선언한다**

`const CATEGORIES = [...]`와 `const QUESTIONS = { 'korean-history': [], 'world-geography': [], 'science': [], 'arts-culture': [] };`. 로직·함수·`console` 호출을 넣지 않는다.

- [ ] **Step 2: 한국사 10문항을 작성한다**

`id`는 `kh-01`~`kh-10`. PRD §2.4 작성 규칙 9개를 전부 적용한다. 난이도는 고교 교과 수준 7~8문항 + 심화 2~3문항. 부정형 문항(`옳지 않은 것은`)은 최대 1개. "모두 정답" / "정답 없음" 보기 금지. 보기 4개의 길이와 형식을 비슷하게 맞춘다. 최상급 표현을 쓰면 기준과 시점을 문항 본문에 명시한다. `explanation`은 한 문장이며 문항 본문을 반복하지 않는다.

- [ ] **Step 3: 문항마다 출처 URL을 실제로 열어 사실을 확인한다**

PRD §4.3 허용 출처(국가유산청, 국사편찬위원회, 한국민족문화대백과사전, 국립중앙박물관 등)만 사용한다. 열리지 않거나 사실이 다른 URL은 교체한다. `source.title`은 URL 없이도 찾을 수 있는 기관·자료명으로 적는다.

- [ ] **Step 4: PRD §4.4 체크리스트를 10문항 전부에 적용한다**

8개 항목(정답 하나 / 오답 3개 명확히 틀림 / URL 실제 확인 / 허용 출처 / 최상급 기준·시점 / 해설 한 문장 / 금지 보기 없음 / 보기 길이 유사)을 문항별로 확인한다. 걸리는 문항은 고친다.

- [ ] **Step 5: 구조를 확인한다**

아직 `index.html`이 없으므로 Node로 확인한다.

```bash
node -e "const fs=require('fs'); const d=eval(fs.readFileSync('questions.js','utf8')+';({CATEGORIES,QUESTIONS})'); const q=d.QUESTIONS['korean-history']; console.log(q.length, new Set(q.map(x=>x.id)).size, q.every(x=>x.options.length===4 && Number.isInteger(x.answerIndex) && x.answerIndex>=0 && x.answerIndex<=3 && !!x.source.url));"
```

기대 출력: `10 10 true`

- [ ] **Step 6: 커밋**

```bash
git add questions.js && git commit -m "feat: add CATEGORIES and 10 Korean history questions"
```

---

### Task 2: 골격 4파일 + `validateQuestions()` + 시작 화면

**Files:**
- Create: `index.html`, `style.css`, `script.js`

**Interfaces:**
- Consumes: Task 1의 `CATEGORIES`, `QUESTIONS`.
- Produces: `validateQuestions() -> string[]` — 문제마다 사람이 읽을 수 있는 오류 문자열 하나. 빈 배열이면 통과.
- Produces: 전역 `state` 객체. PRD §3.7의 필드 전부를 처음부터 선언한다 (2·3단계 필드 포함 — 뒤에서 모양이 바뀌지 않게).
- Produces: `render() -> void` — `state.screen`을 보고 해당 화면만 보이게 전환하는 단일 진입점.
- Produces: `renderHome() -> void`.
- Produces: `startRound(mode: string, categoryId: string) -> void` — 이 과제에서는 항상 `'practice'`로 호출된다.
- Produces: `index.html`의 화면 컨테이너 id — `#screen-home`, `#screen-quiz`, `#screen-result`, `#screen-leaderboard`. 1단계에서 `#screen-leaderboard`는 비어 있는 채로 존재한다.

- [ ] **Step 1: `index.html`을 만든다**

`<!doctype html>`, `<html lang="ko">`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`. 본문에 위 4개 화면 컨테이너. `</body>` 직전에 `<script src="questions.js"></script>`를 먼저, `<script src="script.js"></script>`를 그 다음에 둔다. `type="module"`을 쓰지 않는다.

시작 화면 컨테이너에는 카테고리 버튼이 들어갈 빈 `<div id="category-list">`와 `<p id="data-error" hidden>문항 데이터에 오류가 있습니다</p>`를 둔다.

- [ ] **Step 2: `style.css`에 기본 스타일을 넣는다**

시스템 폰트 스택(`-apple-system, "Segoe UI", "Malgun Gothic", sans-serif` 수준), 중앙 정렬 컨테이너(`max-width` 약 640px), 화면 컨테이너는 `[hidden]`일 때 안 보이게. 외부 폰트·CDN을 참조하지 않는다. 360px 세부 대응은 Task 8에서 마감한다.

- [ ] **Step 3: `script.js`에 PRD §5.3의 10개 섹션 주석 경계를 미리 넣는다**

`// ---- 1. MODES ----` ~ `// ---- 10. 초기화 ----`. 이 과제에서 채우지 않는 섹션은 주석만 남긴다. `MODES` 섹션에는 Task 9가 전부 채우므로, 여기서는 `practice` 항목 하나만 PRD §5.4의 7개 필드를 갖춰 넣는다.

- [ ] **Step 4: `state` 객체를 선언한다**

PRD §3.7의 필드 12개를 그 초기값대로 전부 선언한다 — `screen: 'home'`, `mode: 'practice'`, `categoryId: null`, `deck: []`, `index: 0`, `score: 0`, `answers: []`, `phase: 'answering'`, `hintUsed: false`, `hintRemoved: []`, `deadline: null`, `reviewRound: false`, `baseScore: null`. 2·3단계에서만 쓰이는 필드도 지금 선언해 뒤에서 객체 모양이 바뀌지 않게 한다. 화면은 `state`를 읽어서 그린다 — DOM에 상태를 저장하지 않는다.

- [ ] **Step 5: `validateQuestions()`를 구현한다**

검사 항목은 PRD §4.5 그대로 6가지: `CATEGORIES`의 모든 `id`가 `QUESTIONS`의 키로 존재 / 카테고리당 문항 수가 정확히 10 / `id`가 40개 전체에서 유일 / `options.length === 4`이고 모든 항목이 빈 문자열이 아님 / `answerIndex`가 0~3의 정수 / `explanation`·`source.title`·`source.url`이 비어 있지 않음.

반환값은 오류 문자열 배열. 문자열마다 어느 문항의 무슨 문제인지 담는다 (예: `kh-03: answerIndex가 0~3의 정수가 아님 (9)`).

Task 5~7이 끝나기 전에는 세 카테고리가 비어 있어 "문항 수 10" 검사가 실패한다. 이는 정상이다. 1단계 작업 중 임시로 통과시켜야 하면 **검증 코드를 느슨하게 고치지 말고** `QUESTIONS`의 빈 배열에 임시 더미 문항을 넣는 쪽을 택한다. Task 7 Step 4가 더미 잔존을 확인한다.

- [ ] **Step 6: 초기화와 차단을 연결한다**

로드 시 1회 `validateQuestions()`를 호출한다. 결과가 비어 있지 않으면 `console.error`로 **목록 전체**를 출력하고, `#data-error`의 `hidden`을 벗기고, 모든 카테고리 버튼을 비활성화한다. 한 카테고리에만 오류가 있어도 전체를 차단한다.

- [ ] **Step 7: `renderHome()`과 `render()`를 구현한다**

`renderHome()`은 `CATEGORIES`를 순회해 `#category-list`에 버튼을 만들고, 클릭 시 `startRound('practice', category.id)`를 호출한다. `render()`는 `state.screen` 값에 따라 화면 컨테이너의 `hidden`을 토글한다. 1단계의 `startRound`는 `state`를 채우고 `state.screen = 'quiz'`로 바꾼 뒤 `render()`를 부르는 것까지만 한다 (덱 생성은 Task 3).

- [ ] **Step 8: 브라우저로 확인한다**

`index.html`을 `file://`로 열어 시작 화면에 카테고리 4개가 뜨는지 본다. 콘솔에 오류가 없어야 한다.

- [ ] **Step 9: 차단 동작을 확인한다**

`questions.js`에서 `kh-01`의 `answerIndex`를 `9`로 바꾸고 새로 고친다. 기대: `문항 데이터에 오류가 있습니다`가 보이고, 카테고리 버튼이 눌리지 않고, 콘솔에 `kh-01`을 가리키는 오류 줄이 찍힌다. 값을 되돌리고 다시 새로 고쳐 정상 복귀를 확인한다.

- [ ] **Step 10: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add app skeleton, question validation, and home screen"
```

---

### Task 3: 섞기 + 문제 화면 + 해설 상태

**Files:**
- Modify: `script.js` (섹션 4·5·6·7), `index.html`, `style.css`

**Interfaces:**
- Consumes: Task 2의 `state`, `render()`, `startRound()`.
- Produces: `shuffle(arr: T[]) -> T[]` — Fisher-Yates. **새 배열을 반환하고 입력을 수정하지 않는다.**
- Produces: `buildDeck(categoryId: string) -> DeckItem[]` — `DeckItem = { id, question, options: string[4], answerIndex: number, explanation, source }`. 문항 순서를 섞고, 문항마다 `options`를 섞은 뒤 **섞인 배열 기준 정답의 새 위치**를 `answerIndex`에 담는다. `QUESTIONS` 원본을 수정하지 않는다.
- Produces: `selectOption(index: number) -> void` — 보기 선택 핸들러.
- Produces: `nextQuestion() -> void` — 해설에서 다음 문항 또는 결과로.
- Produces: `renderQuiz() -> void` — `state.phase`가 `'answering'`이면 문제, `'explaining'`이면 해설까지 그린다.
- Produces: `index.html`의 id — `#progress`, `#round-label`, `#question-text`, `#option-list`, `#feedback`, `#explanation`, `#source`, `#next-btn`.

- [ ] **Step 1: 문제 화면 DOM 골격을 `index.html`에 추가한다**

진행 표시, 모드·카테고리 라벨, 문항 본문, 보기 버튼 컨테이너, 해설 영역(정답 여부 / 해설 / 출처), `[다음]` 버튼. 해설 영역은 기본 `hidden`.

- [ ] **Step 2: `shuffle()`과 `buildDeck()`을 구현한다**

보기 섞기는 **인덱스 순열 방식**을 쓴다: `[0,1,2,3]`을 `shuffle`하고 그 순열로 `options`를 재배열한 뒤 `newAnswerIndex = perm.indexOf(원본 answerIndex)`. 정답 문자열을 `indexOf`로 찾는 방식은 같은 문자열 보기가 두 개 있으면 깨진다.

- [ ] **Step 3: `startRound()`가 덱을 만들고 상태를 초기화하게 고친다**

`state.deck = buildDeck(categoryId)`, `index = 0`, `score = 0`, `answers = []`, `phase = 'answering'`, `hintUsed = false`, `hintRemoved = []`, `deadline = null`, `reviewRound = false`, `baseScore = null`, `screen = 'quiz'`.

- [ ] **Step 4: `renderQuiz()`의 `answering` 상태를 구현한다**

진행 표시는 `${state.index + 1} / ${state.deck.length}`. 보기 4개를 버튼으로 그리고 각 버튼이 `selectOption(i)`를 호출하게 한다. 해설 영역은 `hidden`.

- [ ] **Step 5: `selectOption()`을 구현한다**

**첫 줄에서 `state.phase !== 'answering'`이면 즉시 반환한다** (Review Focus 4). 정답 여부를 판정해 `state.answers`에 `{ questionId, chosenIndex, correct, hintUsed }`를 push하고, `state.phase = 'explaining'`으로 바꾸고 `render()`를 부른다. 점수 가산은 Task 4에서 붙인다.

- [ ] **Step 6: `renderQuiz()`의 `explaining` 상태를 구현한다**

`✓ 정답` 또는 `✗ 오답`을 표시한다. 고른 보기와 정답 보기를 시각적으로 구분하고, 오답이면 정답 보기를 강조한다. 한 줄 해설을 쓰고, 그 아래 작고 연한 글씨로 `출처: <source.title> · <도메인>`을 쓴다 (도메인은 `new URL(url).hostname`). 보기 버튼 전부에 `disabled`를 걸고, 마지막 문항이면 `[다음]` 버튼 텍스트를 `결과 보기`로 바꾼다.

- [ ] **Step 7: `nextQuestion()`을 구현한다**

`state.index`를 올리고 `phase`를 `'answering'`으로 되돌린다. 덱을 다 썼으면 `state.screen = 'result'`로 바꾼다 (결과 화면 렌더는 Task 4). `render()` 호출.

- [ ] **Step 8: 섞기 정확성을 콘솔로 전수 검증한다** (Review Focus 1)

한국사 라운드를 시작한 뒤 콘솔에:

```js
state.deck.every(d => { const o = QUESTIONS['korean-history'].find(q => q.id === d.id); return d.options[d.answerIndex] === o.options[o.answerIndex] && d.options.slice().sort().join('|') === o.options.slice().sort().join('|'); })
```

기대 출력: `true` — 섞인 덱의 정답 보기 **문자열**이 원본의 정답 보기와 같고, 보기 집합이 보존된다. `false`가 나오면 다음 단계로 넘어가지 않는다.

- [ ] **Step 9: 원본 불변을 콘솔로 확인한다**

라운드를 3번 새로 시작한 뒤:

```js
QUESTIONS['korean-history'][0].options.join('|')
```

기대: `questions.js`에 적힌 순서 그대로.

- [ ] **Step 10: 해설 중 보기 클릭 무시를 확인한다** (Review Focus 4)

오답을 고른 뒤 해설 상태에서 다른 보기를 5번 클릭하고:

```js
state.answers.length
```

기대 출력: `1`. 해설 내용도 바뀌지 않는다.

- [ ] **Step 11: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add deck shuffling, question screen, and inline explanation"
```

---

### Task 4: 점수 계산 + 결과 화면

**Files:**
- Modify: `script.js` (섹션 4·6·7), `index.html`, `style.css`

**Interfaces:**
- Consumes: Task 3의 `state.answers`, `selectOption()`, `nextQuestion()`.
- Produces: `scoreFor(mode: string, correct: boolean, hintUsed: boolean) -> number` — `MODES[mode]`를 읽어 점수를 낸다. 오답은 항상 0. 힌트 사용 정답은 `hintedScore`, 아니면 `correctScore`. 모드 이름으로 분기하지 않는다.
- Produces: `formatScore(n: number) -> string` — 정수면 `'8'`, 소수면 `'7.5'`. 정수에 소수점을 붙이지 않는다.
- Produces: `renderResult() -> void`.
- Produces: `index.html`의 id — `#result-score`, `#result-label`, `#result-list`(문항별 정답·오답 목록), `#retry-btn`(같은 모드 다시), `#home-btn`(처음으로).

- [ ] **Step 1: 결과 화면 DOM 골격을 추가한다**

점수 표시, 모드·카테고리 라벨, 문항별 정답·오답 목록, `같은 모드 다시` 버튼, `처음으로` 버튼. 복습 영역은 Task 12에서 추가한다.

- [ ] **Step 2: `formatScore()`를 구현한다**

`Number.isInteger(n)`로 갈라 정수면 `String(n)`, 아니면 소수 한 자리 표현을 반환한다.

- [ ] **Step 3: `scoreFor()`를 구현하고 `selectOption()`에 연결한다**

`selectOption()`에서 `state.score += scoreFor(state.mode, correct, state.hintUsed)`.

- [ ] **Step 4: `renderResult()`를 구현한다**

`${formatScore(state.score)} / 10` 형식으로 점수를 쓴다. `MODES[state.mode].label`과 카테고리 이름을 함께 표시하고, 문항별 정답·오답 목록을 그린다. `같은 모드 다시`는 같은 모드·카테고리로 `startRound`를 다시 부르고, `처음으로`는 `state.screen = 'home'`으로 바꾼다.

- [ ] **Step 5: 점수 서식을 콘솔로 확인한다** (Review Focus 5)

```js
[0, 7, 10, 7.5, 0.5, 9.5].map(formatScore).join(' | ')
```

기대 출력: `0 | 7 | 10 | 7.5 | 0.5 | 9.5`. `7.0`이나 `10.0`이 나오면 고친다.

- [ ] **Step 6: 10문항을 끝까지 풀어 확인한다**

일부러 3문항을 틀리고 7문항을 맞힌다. 기대: 결과 화면이 `7 / 10`. 마지막 문항의 버튼 텍스트가 `결과 보기`였는지 확인한다.

- [ ] **Step 7: `같은 모드 다시` 상태 초기화를 확인한다**

결과 화면에서 `같은 모드 다시`를 누른 뒤:

```js
[state.index, state.score, state.answers.length]
```

기대 출력: `[0, 0, 0]`. 진행 표시가 `1 / 10`이고 문항 순서가 방금과 다르다.

- [ ] **Step 8: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add scoring and result screen"
```

---

### Task 5: 세계지리 10문항

**Files:**
- Modify: `questions.js`

**Interfaces:**
- Consumes: Task 1의 `Question` 필드 명세.
- Produces: `QUESTIONS['world-geography']` 10개. `id`는 `wg-01`~`wg-10`.

- [ ] **Step 1: 10문항을 작성한다**

Task 1 Step 2와 동일한 규칙(PRD §2.4 전부). 이 카테고리는 최상급 표현("가장 넓은", "가장 긴")이 나오기 쉬우므로 규칙 3·4를 특히 주의한다. 기준과 시점을 문항 본문에 넣는다 — 올바른 형태: `2024년 기준 국토 면적이 가장 넓은 나라는?`

- [ ] **Step 2: 출처 URL을 실제로 열어 확인한다**

CIA World Factbook, UNESCO, 통계청, 기상청 등 PRD §4.3 허용 출처. 수치는 출처에 적힌 값과 일치해야 한다.

- [ ] **Step 3: PRD §4.4 체크리스트를 10문항에 적용한다**

- [ ] **Step 4: 콘솔로 구조를 확인한다**

앱을 새로 고친 뒤:

```js
validateQuestions().filter(m => m.startsWith('wg')).length
```

기대 출력: `0`

- [ ] **Step 5: 세계지리 라운드를 끝까지 풀어 본다**

10문항이 모두 뜨고, 각 해설과 출처가 정상 표시된다.

- [ ] **Step 6: 커밋**

```bash
git add questions.js && git commit -m "feat: add 10 world geography questions"
```

---

### Task 6: 과학 10문항

**Files:**
- Modify: `questions.js`

**Interfaces:**
- Produces: `QUESTIONS['science']` 10개. `id`는 `sc-01`~`sc-10`.

- [ ] **Step 1: 10문항을 작성한다**

Task 1 Step 2와 동일한 규칙. 고교 교과 수준 7~8문항 + 심화 2~3문항.

- [ ] **Step 2: 출처 URL을 실제로 열어 확인한다**

한국천문연구원, NASA, 기상청 등 PRD §4.3 허용 출처.

- [ ] **Step 3: PRD §4.4 체크리스트를 10문항에 적용한다**

- [ ] **Step 4: 콘솔로 구조를 확인한다**

```js
validateQuestions().filter(m => m.startsWith('sc')).length
```

기대 출력: `0`

- [ ] **Step 5: 과학 라운드를 끝까지 풀어 본다**

- [ ] **Step 6: 커밋**

```bash
git add questions.js && git commit -m "feat: add 10 science questions"
```

---

### Task 7: 예술과 문화 10문항 + 40문항 검증 통과

**Files:**
- Modify: `questions.js`

**Interfaces:**
- Produces: `QUESTIONS['arts-culture']` 10개. `id`는 `ac-01`~`ac-10`. 이 과제가 끝나면 `validateQuestions()`가 빈 배열을 반환한다.

- [ ] **Step 1: 10문항을 작성한다**

Task 1 Step 2와 동일한 규칙.

- [ ] **Step 2: 출처 URL을 실제로 열어 확인한다**

국립중앙박물관, UNESCO, 국가유산청, 국립국어원 등 PRD §4.3 허용 출처.

- [ ] **Step 3: PRD §4.4 체크리스트를 10문항에 적용한다**

- [ ] **Step 4: Task 2 Step 5의 임시 더미가 남아 있지 않은지 확인한다**

```js
[Object.values(QUESTIONS).flat().length, Object.values(QUESTIONS).flat().filter(q => !/^https?:\/\//.test(q.source.url)).map(q => q.id)]
```

기대 출력: `[40, []]`

- [ ] **Step 5: 전체 검증 통과와 ID 유일성을 확인한다**

```js
[validateQuestions(), new Set(Object.values(QUESTIONS).flat().map(q => q.id)).size]
```

기대 출력: `[[], 40]`

- [ ] **Step 6: 커밋**

```bash
git add questions.js && git commit -m "feat: add 10 arts and culture questions, completing all 40"
```

---

### Task 8: 360px 레이아웃 마감 + 1단계 전체 확인

**Files:**
- Modify: `style.css`, `index.html` (필요한 래퍼만)

**Interfaces:**
- Consumes: Task 2~4가 만든 모든 화면의 DOM 구조.

- [ ] **Step 1: 보기 버튼이 좁은 폭에서 넘치지 않게 고친다**

버튼은 세로로 쌓이고 폭을 꽉 채우며, 긴 텍스트는 한국어에 맞게 줄바꿈된다. 고정 폭·고정 높이를 쓰지 않는다.

- [ ] **Step 2: 해설·출처·진행 표시가 좁은 폭에서 잘리지 않게 고친다**

출처 줄은 작고 연한 글씨를 유지하되 도메인이 넘치면 줄바꿈되게 한다.

- [ ] **Step 3: DevTools 반응형 모드로 확인한다**

F12 → 기기 툴바 → 폭 360px. 시작·문제·해설·결과 네 화면 전부에서 가로 스크롤바가 생기지 않고 텍스트가 잘리지 않는다.

- [ ] **Step 4: 데스크톱 폭에서 회귀가 없는지 확인한다**

창을 최대화해 레이아웃이 깨지지 않았는지 본다.

- [ ] **Step 5: 1단계 브라우저 확인 항목 10개를 전부 실행한다**

이 문서 1단계의 **브라우저에서 직접 확인할 항목**을 순서대로 실행한다. 통과하지 못한 줄이 있으면 고친다.

- [ ] **Step 6: 커밋**

```bash
git add index.html style.css && git commit -m "style: support viewport widths down to 360px"
```

---

# 2단계 — 스피드 모드, 힌트 모드, 틀린 문제 다시 풀기

## 만들 것

- `MODES` 설정 테이블 3개 모드 전부 (PRD §5.4) — 모드 차이의 단일 출처
- 시작 화면의 모드 선택 3개 + 연습 모드 선택 시 "순위표에 기록되지 않음" 문구
- 스피드 모드: 문항당 15초, `deadline` 기준 재계산, 해설 중 정지, `[다음]`에 리셋, 탭 복귀 처리
- 힌트 모드: 문항당 1회, 오답 2개 무작위 제거, 힌트 사용 정답은 0.5점
- 연습 모드 복습 라운드: 틀린 문항만 새 덱, 원점수 보존, 복습 결과 별도 표시
- 결과 화면에 "순위표에 기록되지 않음" 문구 (연습 모드)

**만들지 않을 것**: `localStorage` 저장, 순위표 화면 (PRD §6.2).

## 완료 기준 (PRD §6.2)

- [ ] 시작 화면에서 모드 3개를 고를 수 있다
- [ ] 연습 모드를 고르면 "순위표에 기록되지 않음"이 시작·결과 화면에 표시된다
- [ ] 스피드: 문항마다 남은 시간이 15초부터 줄어든다
- [ ] 스피드: 답하지 않고 15초를 넘기면 0점 처리되고 정답이 강조된 해설이 뜬다
- [ ] 스피드: 해설이 뜬 동안 타이머가 멈춰 있다
- [ ] 스피드: `[다음]`을 누르면 다시 15초부터 센다
- [ ] 스피드: 문제 풀이 중 다른 탭으로 10초간 갔다 돌아와도 남은 시간이 실제 경과대로 맞다
- [ ] 힌트: 힌트 버튼을 누르면 오답 보기 2개가 지워지고 정답은 남는다
- [ ] 힌트: 버튼은 문항당 1회만 눌리고 이후 비활성이다
- [ ] 힌트: 힌트를 쓰고 맞히면 0.5점, 힌트 없이 맞히면 1점이 더해진다
- [ ] 힌트: 힌트를 쓰고 틀리면 0점이다
- [ ] 복습: 연습 모드 결과 화면에 `틀린 문제 다시 풀기 (N문항)`이 틀린 개수대로 나온다
- [ ] 복습: 복습을 돌려도 원점수가 바뀌지 않고 복습 결과가 따로 표시된다
- [ ] 복습: 복습에서 또 틀리면 버튼이 다시 나오고, 다 맞히면 `모두 정답`이 된다
- [ ] 복습: 10문항을 다 맞히면 복습 버튼이 나오지 않는다
- [ ] 스피드·힌트 모드에는 복습 버튼이 없다

## 브라우저에서 직접 확인할 항목

2단계가 끝나면 아래를 순서대로 해 본다.

1. 시작 화면에 모드 3개(연습 / 스피드 / 힌트)와 카테고리 4개가 보인다.
2. `연습`을 고른다. 시작 화면에 `순위표에 기록되지 않음`이 보인다. `스피드`나 `힌트`로 바꾸면 그 문구가 사라진다.
3. `스피드` + `과학`으로 시작한다. 남은 시간이 15에서 1초씩 줄어드는 게 보인다.
4. **아무것도 누르지 않고 15초를 기다린다.** 0에 닿는 순간 오답 처리되고, 정답 보기가 강조된 해설이 뜨고, 시간 표시가 멈춘다.
5. 해설이 뜬 상태에서 **20초 더 기다린다.** 시간 표시가 음수로 가거나 다음 문항으로 자동 넘어가지 않는다.
6. `[다음]`을 누른다. 시간이 다시 15초부터 시작한다.
7. **문제가 떠 있는 상태에서** 다른 탭으로 옮겨 약 10초 뒤 돌아온다. 남은 시간이 대략 5초 근처여야 한다. 15초 그대로 멈춰 있거나 14초면 틀린 것이다.
8. **문제가 떠 있는 상태에서** 다른 탭으로 옮겨 20초 뒤 돌아온다. 돌아온 즉시 시간 초과 해설이 떠 있다.
9. `힌트` + `한국사`로 시작한다. 힌트 버튼을 누른다. 보기 2개가 지워지고 **정답은 남아 있다**(해설에서 확인). 버튼이 더 이상 눌리지 않는다.
10. 그 문항을 맞힌 뒤 나머지도 전부 맞혀 끝까지 푼다. 결과가 `10 / 10`이 아니라 `9.5 / 10`이다.
11. 힌트를 쓴 문항에서 다음 문항으로 넘어간 직후를 본다. **힌트 버튼이 다시 활성이고 보기 4개가 모두 보인다.**
12. 힌트를 쓰고 일부러 틀린다. 그 문항 점수가 0점이다 (끝까지 풀어 총점으로 확인).
13. 힌트 모드와 스피드 모드 결과 화면에 **복습 버튼이 없다.**
14. `연습` + `세계지리`로 3문항을 일부러 틀린다. 결과 화면에 `틀린 문제 다시 풀기 (3문항)`이 보인다.
15. 복습을 누른다. 3문항만 나오고 문항·보기 순서가 아까와 다르다. 그중 1문항을 또 틀린다.
16. 복습 결과 화면: 위쪽 원점수가 **여전히 `7 / 10`** 이고, 아래에 `복습: 3문항 중 2문항 정답`이 따로 적혀 있다.
17. 다시 `틀린 문제 다시 풀기 (1문항)`이 보인다. 눌러서 맞힌다. 이제 `모두 정답`으로 바뀌고, 원점수는 **아직도 `7 / 10`** 이다.
18. 연습 모드로 10문항을 **다 맞힌다.** 복습 버튼이 나오지 않고 결과 화면에 `순위표에 기록되지 않음`이 보인다.

---

### Task 9: `MODES` 테이블 + 모드 선택 화면

**Files:**
- Modify: `script.js` (섹션 1·6·7), `index.html`, `style.css`

**Interfaces:**
- Consumes: Task 2의 `renderHome()`, `startRound()`, `state.mode`.
- Produces: 전역 `MODES` — PRD §5.4의 3개 키(`practice`, `speed`, `hint`)와 7개 필드(`label`, `timeLimit`, `hintAllowed`, `correctScore`, `hintedScore`, `ranked`, `retryWrong`)를 **그 표의 값 그대로**. 이 테이블이 PRD §2.2 모드 규칙과 §2.3 점수 규칙의 구현상 단일 출처다.
- Produces: `selectMode(mode: string) -> void` — `state.mode`를 바꾸고 `render()`.
- Produces: `index.html`의 id — `#mode-list`, `#unranked-notice`.

- [ ] **Step 1: `MODES` 테이블을 PRD §5.4대로 채운다**

`timeLimit`: `practice` `null`, `speed` `15`, `hint` `null`. `hintAllowed`: `hint`만 `true`. `correctScore`: 셋 다 `1`. `hintedScore`: `hint`만 `0.5`, 나머지 `null`. `ranked`: `speed`·`hint`만 `true`. `retryWrong`: `practice`만 `true`.

- [ ] **Step 2: 시작 화면에 모드 선택 3개를 추가한다**

`MODES`를 순회해 버튼을 만든다. 모드 이름을 코드에 직접 쓰지 않고 `MODES[key].label`을 쓴다. 현재 선택된 모드를 시각적으로 표시한다. `state.mode` 기본값은 `'practice'`.

- [ ] **Step 3: 카테고리 버튼이 현재 모드로 시작하게 고친다**

`startRound('practice', id)` 하드코딩을 `startRound(state.mode, id)`로 바꾼다.

- [ ] **Step 4: "순위표에 기록되지 않음" 문구를 시작·결과 화면에 연결한다**

`MODES[state.mode].ranked === false`일 때만 보이게 한다. 모드 이름으로 분기하지 않는다.

- [ ] **Step 5: 콘솔로 테이블을 확인한다**

```js
Object.entries(MODES).map(([k,v]) => `${k}:${v.timeLimit}/${v.hintAllowed}/${v.hintedScore}/${v.ranked}/${v.retryWrong}`).join(' ')
```

기대 출력: `practice:null/false/null/false/true speed:15/false/null/true/false hint:null/true/0.5/true/false`

- [ ] **Step 6: 브라우저로 확인한다**

모드 3개가 뜨고, 고르면 선택 표시가 바뀐다. `연습`일 때만 `순위표에 기록되지 않음`이 보인다. 어느 모드를 골라도 라운드가 시작되고 1단계 동작(해설·점수·결과)이 그대로 작동한다. 아직 타이머와 힌트는 동작하지 않는다 — 정상이다.

- [ ] **Step 7: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add MODES table and mode selection on home screen"
```

---

### Task 10: 스피드 모드 타이머

**Files:**
- Modify: `script.js` (섹션 6·7·8), `index.html`, `style.css`

**Interfaces:**
- Consumes: Task 9의 `MODES[...].timeLimit`, Task 3의 `selectOption()`, `nextQuestion()`, `renderQuiz()`, `state.deadline`.
- Produces: `startTimer() -> void` — `MODES[state.mode].timeLimit`이 `null`이면 아무것도 하지 않는다. 아니면 `state.deadline = Date.now() + timeLimit * 1000`을 잡고 100ms 간격 인터벌을 켠다.
- Produces: `stopTimer() -> void` — 인터벌을 지우고 `state.deadline = null`. 중복 호출이 안전해야 한다.
- Produces: `tickTimer() -> void` — `state.deadline - Date.now()`로 남은 시간을 **매번 다시 계산**해 그린다. 0 이하면 `handleTimeout()`.
- Produces: `handleTimeout() -> void` — 오답(0점)으로 기록하고 `phase = 'explaining'`, 타이머 정지, 정답 강조 해설 표시.
- Produces: `index.html`의 id — `#timer`.

- [ ] **Step 1: 남은 시간 표시 영역을 추가한다**

`MODES[state.mode].timeLimit`이 `null`이면 숨긴다.

- [ ] **Step 2: `startTimer()` / `stopTimer()` / `tickTimer()`를 구현한다**

인터벌 핸들은 모듈 수준 변수에 둔다 — `state`에 넣지 않는다(`state`는 화면이 읽는 데이터다). `setInterval` 호출 횟수를 세서 남은 시간을 계산하는 방식을 쓰지 않는다. 탭을 비활성화하면 브라우저가 타이머를 늦춰 시간이 밀린다 (PRD §3.8.2).

- [ ] **Step 3: `handleTimeout()`을 구현한다**

`state.answers`에 `{ questionId, chosenIndex: null, correct: false, hintUsed: state.hintUsed }`를 push한다. 점수는 더하지 않는다. `phase = 'explaining'`, `stopTimer()`, `render()`.

- [ ] **Step 4: 생애주기를 연결한다**

`startRound()` 끝과 `nextQuestion()`이 다음 문항을 띄울 때 `startTimer()`. `selectOption()`과 `handleTimeout()`에서 `stopTimer()`. `state.screen`이 `result`나 `home`으로 바뀔 때 `stopTimer()`.

- [ ] **Step 5: 탭 복귀 처리를 붙인다**

`document.addEventListener('visibilitychange', ...)`로 돌아왔을 때 `phase === 'answering'`이고 `state.deadline !== null`이고 이미 지났으면 즉시 `handleTimeout()`. 인터벌이 살아 있으면 100ms 안에 알아서 처리되지만, 브라우저가 인터벌을 완전히 멈춘 경우를 위해 명시적으로 건다.

- [ ] **Step 6: 시간 초과 후 클릭 무시를 확인한다** (Review Focus 4)

스피드 라운드에서 15초를 넘긴 뒤 보기를 여러 번 클릭하고:

```js
state.answers.length
```

기대 출력: `1`. `selectOption()`의 `phase` 가드가 없으면 2 이상이 된다.

- [ ] **Step 7: `deadline` 기준 계산을 콘솔로 확인한다**

문제가 떠 있는 상태에서:

```js
const d = state.deadline; setTimeout(() => console.log(Math.round((d - Date.now())/1000) + '초 남음, deadline 불변: ' + (state.deadline === d)), 5000)
```

5초 뒤 기대 출력: `10초 남음, deadline 불변: true`

- [ ] **Step 8: 해설 중 타이머 정지를 확인한다**

답을 고른 뒤 해설 상태로 30초 둔다. 기대: 시간 표시가 멈춰 있고 음수가 되지 않고, 자동으로 다음 문항으로 넘어가지 않고, `state.deadline`이 `null`이다.

- [ ] **Step 9: 탭 전환 복귀를 확인한다**

(a) 문제 상태에서 다른 탭으로 10초 → 복귀. 기대: 남은 시간 약 5초. (b) 문제 상태에서 다른 탭으로 20초 → 복귀. 기대: 복귀 즉시 시간 초과 해설.

- [ ] **Step 10: `[다음]` 리셋을 확인한다**

`[다음]`을 누른 직후 시간 표시가 15초다.

- [ ] **Step 11: 연습·힌트 모드에 회귀가 없는지 확인한다**

연습 모드로 라운드를 돌려 시간 표시가 아예 안 보이고, 해설을 띄운 채 1분을 둬도 아무 일이 없다.

- [ ] **Step 12: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add deadline-based 15s timer for speed mode"
```

---

### Task 11: 힌트 모드

**Files:**
- Modify: `script.js` (섹션 6·7), `index.html`, `style.css`

**Interfaces:**
- Consumes: Task 9의 `MODES[...].hintAllowed` / `hintedScore`, Task 4의 `scoreFor()`, Task 3의 `renderQuiz()`, `nextQuestion()`, `shuffle()`, `state.hintUsed`, `state.hintRemoved`.
- Produces: `useHint() -> void` — 현재 문항의 오답 3개 중 무작위 2개 인덱스를 `state.hintRemoved`에 담고, `state.hintUsed = true`, `render()`.
- Produces: `index.html`의 id — `#hint-btn`.

- [ ] **Step 1: 힌트 버튼을 추가한다**

`MODES[state.mode].hintAllowed`가 `false`면 숨긴다. `state.hintUsed`가 `true`면 `disabled`.

- [ ] **Step 2: `useHint()`를 구현한다**

현재 덱 항목의 `answerIndex`를 제외한 인덱스 3개를 모아 `shuffle()`로 섞고 앞 2개를 `state.hintRemoved`로 삼는다. 정답 인덱스가 절대 포함되지 않아야 한다. 이미 `state.hintUsed`면 즉시 반환한다.

- [ ] **Step 3: `renderQuiz()`가 `hintRemoved`를 반영하게 고친다**

`state.hintRemoved`에 든 인덱스의 보기 버튼을 `disabled` 처리하고 시각적으로 지워진 것처럼 보이게 한다. `selectOption()`에 `state.hintRemoved.includes(index)`면 반환하는 가드를 추가한다.

- [ ] **Step 4: 점수 연결을 확인한다**

`scoreFor()`는 Task 4에서 이미 `hintUsed`를 받는다. `selectOption()`이 `state.hintUsed`를 넘기고 `state.answers`의 `hintUsed` 필드가 채워지는지 본다. 새 분기를 만들지 않는다.

- [ ] **Step 5: 문항 전환 시 초기화를 넣는다** (Review Focus 2)

`nextQuestion()`이 다음 문항으로 넘어갈 때 `state.hintUsed = false`, `state.hintRemoved = []`.

- [ ] **Step 6: 힌트가 정답을 지우지 않는지 콘솔로 확인한다**

힌트 모드 문항에서:

```js
useHint(); [state.hintRemoved.length === 2, !state.hintRemoved.includes(state.deck[state.index].answerIndex)]
```

기대 출력: `[true, true]`. 문항을 넘기며 10번 반복해 전부 `[true, true]`인지 본다.

- [ ] **Step 7: 문항 전환 초기화를 콘솔로 확인한다** (Review Focus 2)

1번 문항에서 힌트를 쓰고 답한 뒤 `[다음]`을 누르고:

```js
[state.hintUsed, state.hintRemoved.length, document.getElementById('hint-btn').disabled]
```

기대 출력: `[false, 0, false]`

- [ ] **Step 8: 점수를 브라우저로 확인한다**

힌트 모드로 10문항 전부 정답, 그중 1문항만 힌트 사용. 기대: 결과가 `9.5 / 10`. 힌트를 쓰고 틀린 문항이 0점임은 `state.score`를 중간에 읽어 확인한다.

- [ ] **Step 9: 1회 제한을 확인한다**

힌트 버튼을 연속으로 5번 클릭한다. 기대: 보기가 2개만 지워지고 3개째가 지워지지 않는다.

- [ ] **Step 10: 다른 모드에 회귀가 없는지 확인한다**

연습·스피드 모드에서 힌트 버튼이 보이지 않고, 10문항 전부 정답이 `10 / 10`이다.

- [ ] **Step 11: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add hint mode with 0.5 point scoring"
```

---

### Task 12: 복습 라운드 (연습 모드)

**Files:**
- Modify: `script.js` (섹션 5·6·7), `index.html`, `style.css`

**Interfaces:**
- Consumes: Task 9의 `MODES[...].retryWrong`, Task 4의 `renderResult()`, `formatScore()`, Task 3의 `buildDeck()`, `shuffle()`, `state.reviewRound`, `state.baseScore`.
- Produces: `buildReviewDeck(answers: Answer[]) -> DeckItem[]` — 틀린 `questionId`만 모아 `buildDeck`과 같은 방식으로 문항·보기를 **다시 섞어** 새 덱을 만든다.
- Produces: `startReviewRound() -> void`.
- Produces: `index.html`의 id — `#review-btn`, `#review-result`, `#all-correct`.

- [ ] **Step 1: 결과 화면에 복습 영역을 추가한다**

`틀린 문제 다시 풀기 (N문항)` 버튼, 복습 결과 줄, `모두 정답` 표시. 전부 기본 `hidden`.

- [ ] **Step 2: `buildReviewDeck()`을 구현한다**

`answers.filter(a => !a.correct)`의 `questionId`로 원본 문항을 찾아 `buildDeck`과 동일하게 문항 순서와 보기 순서를 섞고 `answerIndex`를 재계산한다. `buildDeck`의 섞기 로직을 중복 작성하지 말고 문항 배열을 인자로 받는 내부 함수로 분리해 공유한다.

- [ ] **Step 3: `startReviewRound()`를 구현한다** (Review Focus 3)

**`state.baseScore === null`일 때만** `state.baseScore = state.score`를 설정한다. 두 번째·세 번째 복습에서 원점수가 복습 점수로 덮어써지지 않게 하는 핵심이다. 그 다음 `state.deck = buildReviewDeck(state.answers)`, `index = 0`, `score = 0`, `answers = []`, `phase = 'answering'`, `hintUsed = false`, `hintRemoved = []`, `reviewRound = true`, `screen = 'quiz'`.

- [ ] **Step 4: `renderResult()`가 복습 상태를 반영하게 고친다**

표시되는 원점수는 `state.reviewRound ? state.baseScore : state.score`. 복습 라운드였다면 그 아래에 `복습: ${state.deck.length}문항 중 ${정답 수}문항 정답`을 따로 적는다. 복습 점수를 원점수에 더하지 않는다.

버튼 노출 조건: `MODES[state.mode].retryWrong`이 `true`이고 틀린 문항이 1개 이상이면 `틀린 문제 다시 풀기 (N문항)`. `retryWrong`이 `true`인데 틀린 문항이 0개면 버튼을 숨기고 `모두 정답`을 표시한다. `retryWrong`이 `false`면 복습 영역 전체를 숨긴다.

- [ ] **Step 5: `startRound()`가 복습 상태를 초기화하는지 확인한다**

`같은 모드 다시`와 새 라운드 시작 시 `reviewRound = false`, `baseScore = null`. Task 3 Step 3에서 이미 넣었으므로 확인만 한다.

- [ ] **Step 6: 원점수 보존을 콘솔로 확인한다** (Review Focus 3)

연습 모드로 3문항 틀리고 결과 화면에서 `state.score`가 `7`임을 확인한다. 복습을 돌려 1문항 틀린 뒤 결과 화면에서:

```js
[state.baseScore, state.score, state.deck.length]
```

기대 출력: `[7, 2, 3]`. 한 번 더 복습을 돌려 그 1문항을 맞힌 뒤:

```js
state.baseScore
```

기대 출력: `7` — 복습을 두 번 돌려도 변하지 않는다.

- [ ] **Step 7: 결과 표시를 브라우저로 확인한다**

2단계 브라우저 확인 항목 14~18을 순서대로 실행한다. 특히 16번(원점수 `7 / 10` 그대로, 아래에 `복습: 3문항 중 2문항 정답`)과 17번(`모두 정답`으로 전환, 원점수 불변)을 본다.

- [ ] **Step 8: 복습 덱이 다시 섞이는지 확인한다**

같은 틀린 문항으로 복습을 두 번 들어가 보기 순서가 다른지 본다.

- [ ] **Step 9: 다른 모드에 복습 버튼이 없는지 확인한다**

스피드·힌트 모드 결과 화면에서 복습 영역이 전부 숨어 있다.

- [ ] **Step 10: 2단계 브라우저 확인 항목 18개를 전부 실행한다**

- [ ] **Step 11: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add practice mode review round with preserved base score"
```

---

# 3단계 — 점수 저장과 순위표

## 만들 것

- `localStorage` 저장 레이어: 키 `quiz.scores.v1`, 조합별 상위 5개, 모든 접근을 `try/catch`
- 스피드·힌트 모드 종료 시 자동 저장, 연습 모드는 저장하지 않음
- 순위표 화면: 카테고리 4개 × 모드 2개 = 8개 목록, 목록마다 상위 5개 `점수 · 날짜`
- 기록 없는 조합은 `기록 없음`
- `localStorage` 사용 불가 시 순위표 기능만 비활성 + 안내 문구, 퀴즈는 정상 동작
- 깨진 JSON을 만나면 빈 순위표로 시작
- 결과 화면의 기록 여부·신기록 표시

## 완료 기준 (PRD §6.3)

- [ ] 스피드·힌트 모드를 끝내면 점수가 저장된다
- [ ] 연습 모드 점수는 저장되지 않는다
- [ ] 순위표에 카테고리×모드 조합별로 목록이 나뉘어 보인다
- [ ] 각 목록이 점수 내림차순 상위 5개만 보여 준다
- [ ] 6번째 기록을 만들면 가장 낮은 기록이 밀려난다
- [ ] 기록이 없는 조합은 "기록 없음"으로 보인다
- [ ] 브라우저를 닫고 다시 열어도 기록이 남아 있다
- [ ] 개발자 도구에서 `localStorage`를 차단해도 퀴즈가 정상 동작하고 안내 문구가 뜬다
- [ ] `quiz.scores.v1` 값을 깨진 JSON으로 바꿔도 앱이 죽지 않는다

## 브라우저에서 직접 확인할 항목

3단계가 끝나면 아래를 순서대로 해 본다.

1. `스피드` + `과학`을 끝까지 푼다. 결과 화면에 기록됐다는 표시(또는 신기록 표시)가 보인다.
2. 시작 화면으로 돌아가 `순위표`를 연다. `과학 · 스피드` 목록에 방금 점수와 오늘 날짜가 있다.
3. 8개 목록(한국사·세계지리·과학·예술과 문화 × 스피드·힌트)이 모두 보이고, 아직 안 푼 조합은 `기록 없음`이다. **연습 모드 목록은 아예 없다.**
4. `연습` + `과학`을 끝까지 푼다. 순위표를 다시 열어 `과학 · 스피드`·`과학 · 힌트` 어디에도 그 점수가 안 들어갔는지 확인한다.
5. `스피드` + `과학`을 **총 6번** 푼다(점수가 서로 다르게 나오도록). `과학 · 스피드` 목록이 **5줄만** 보이고, 점수가 높은 것부터 정렬돼 있고, 가장 낮았던 점수가 사라졌다.
6. 같은 점수를 두 번 만든다. 순위표에서 **최근 기록이 위**에 있다.
7. 브라우저를 완전히 닫고 `index.html`을 다시 연다. 순위표 기록이 그대로 있다.
8. F12 → Application → Local Storage에서 `quiz.scores.v1` 값을 `{{{` 으로 바꾸고 새로 고친다. **앱이 멈추지 않고** 시작 화면이 뜨고, 순위표가 빈 상태로 보이고, 퀴즈를 풀 수 있다.
9. 새로 고친 뒤 F12 콘솔에서 저장을 차단한다:

```js
Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })
```

그 상태로 스피드 라운드를 끝까지 푼다. **퀴즈가 정상 동작하고** `이 브라우저에서는 점수를 저장할 수 없습니다` 안내가 보인다. 콘솔에 잡히지 않은 예외가 없다.

---

### Task 13: `localStorage` 저장 레이어

**Files:**
- Modify: `script.js` (섹션 9), `index.html`, `style.css`

**Interfaces:**
- Consumes: Task 9의 `MODES[...].ranked`, Task 4의 `renderResult()`, `formatScore()`.
- Produces: `STORAGE_KEY = 'quiz.scores.v1'`.
- Produces: `storageAvailable() -> boolean` — 쓰기·읽기·삭제를 `try/catch`로 한 번 시험해 판정하고 결과를 모듈 변수에 캐시한다.
- Produces: `loadScores() -> Record<string, {score:number,date:string}[]>` — 실패하거나 JSON이 깨지면 `{}`. 예외를 밖으로 던지지 않는다.
- Produces: `saveScore(mode: string, categoryId: string, score: number) -> { saved: boolean, rank: number|null }` — `MODES[mode].ranked`가 `false`면 `{ saved: false, rank: null }`. 조합 키는 `` `${mode}:${categoryId}` ``, 날짜는 `YYYY-MM-DD`. 점수 내림차순 정렬, **동점이면 최근 기록이 위**, 상위 5개만 보관. `rank`는 1부터 시작하며 5위 밖으로 밀려나면 `null`.
- Produces: `index.html`의 id — `#storage-notice`.

- [ ] **Step 1: `storageAvailable()`과 `loadScores()`를 구현한다**

`storageAvailable()`은 테스트 키로 `setItem` → `getItem` → `removeItem`을 시도하고 예외를 잡는다. 결과를 캐시해 매번 다시 시험하지 않는다. `loadScores()`는 `getItem`과 `JSON.parse`를 함께 `try/catch`로 감싸고, 파싱 결과가 객체가 아니면 `{}`를 반환한다.

- [ ] **Step 2: `saveScore()`를 구현한다** (Review Focus 6)

동점 처리: 새 기록을 배열 **앞쪽**에 넣은 뒤 점수 내림차순으로 정렬한다. `Array.prototype.sort`는 안정 정렬이므로 "동점이면 최근이 위"가 자동으로 성립한다. 정렬 후 `slice(0, 5)`. `setItem`을 `try/catch`로 감싸고 실패하면 `{ saved: false, rank: null }`.

- [ ] **Step 3: 결과 화면에 저장을 연결한다**

`renderResult()`가 아니라 라운드 종료 지점(`nextQuestion()`이 `screen = 'result'`로 바꾸는 곳)에서 한 번만 호출한다. `renderResult()`에서 부르면 화면을 다시 그릴 때마다 중복 저장된다.

복습 라운드 종료 시에는 저장하지 않는다 — 연습 모드만 복습이 있고 `ranked: false`이므로 `saveScore`가 이미 걸러내지만, `state.reviewRound`일 때 호출 자체를 건너뛴다.

- [ ] **Step 4: 결과 화면 표시를 추가한다**

`MODES[state.mode].ranked`가 `true`면 저장 결과를 쓴다 — `rank`가 1이면 `신기록!`, 2~5면 `순위표 ${rank}위에 기록됐습니다`, `null`이면 `상위 5개에 들지 못했습니다`. `saved`가 `false`인데 `ranked`가 `true`면 `#storage-notice`에 `이 브라우저에서는 점수를 저장할 수 없습니다`를 띄운다.

- [ ] **Step 5: 상위 5개 절단을 콘솔로 확인한다** (Review Focus 6)

```js
localStorage.removeItem('quiz.scores.v1'); [3,9,5,7,1,8].forEach(s => saveScore('speed','science',s)); loadScores()['speed:science'].map(r => r.score).join(',')
```

기대 출력: `9,8,7,5,3` — 가장 낮은 `1`이 밀려났다.

- [ ] **Step 6: 동점 정렬을 콘솔로 확인한다** (Review Focus 6)

```js
localStorage.removeItem('quiz.scores.v1'); saveScore('speed','science',5); saveScore('speed','science',7); saveScore('speed','science',5); loadScores()['speed:science'].map(r => r.score)
```

기대 출력: `[7, 5, 5]`. 두 번째 `5`가 나중에 넣은 기록인지(앞선 위치) 확인한다.

- [ ] **Step 7: 연습 모드가 저장되지 않는지 확인한다**

```js
localStorage.removeItem('quiz.scores.v1'); saveScore('practice','science',10); [localStorage.getItem('quiz.scores.v1'), Object.keys(loadScores()).length]
```

기대 출력: `[null, 0]`

- [ ] **Step 8: 깨진 JSON 내성을 확인한다**

```js
localStorage.setItem('quiz.scores.v1','{{{'); const a = loadScores(); localStorage.setItem('quiz.scores.v1','"문자열"'); [a, loadScores()]
```

기대 출력: `[{}, {}]` — 예외가 콘솔에 올라오지 않는다.

- [ ] **Step 9: 저장 차단 내성을 브라우저로 확인한다**

새로 고친 뒤 3단계 브라우저 확인 항목 9번을 실행한다. 기대: 퀴즈가 정상 동작하고, 결과 화면에 `이 브라우저에서는 점수를 저장할 수 없습니다`가 뜨고, 콘솔에 잡히지 않은 예외가 없다.

- [ ] **Step 10: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add localStorage score persistence with top-5 per mode and category"
```

---

### Task 14: 순위표 화면

**Files:**
- Modify: `script.js` (섹션 6·7), `index.html`, `style.css`

**Interfaces:**
- Consumes: Task 13의 `loadScores()`, `storageAvailable()`, Task 9의 `MODES`, Task 1의 `CATEGORIES`, Task 4의 `formatScore()`.
- Produces: `renderLeaderboard() -> void` — `MODES`에서 `ranked: true`인 키만 순회하고 `CATEGORIES` 4개와 곱해 목록을 그린다. 모드 이름을 코드에 직접 쓰지 않는다.
- Produces: `index.html`의 id — `#leaderboard-list`, `#leaderboard-home-btn`, 시작 화면의 `#leaderboard-btn`.

- [ ] **Step 1: 시작 화면에 순위표 열기 버튼을 추가한다**

`state.screen = 'leaderboard'`로 바꾸고 `render()`.

- [ ] **Step 2: 순위표 화면 골격과 `처음으로` 버튼을 추가한다**

- [ ] **Step 3: `renderLeaderboard()`를 구현한다**

`CATEGORIES` × `ranked: true`인 모드 = 8개 목록. 목록 제목은 `${category.name} · ${MODES[mode].label}`. 각 줄은 `${formatScore(score)} / 10 · ${date}`. 배열이 없거나 비면 `기록 없음`.

`storageAvailable()`이 `false`면 목록 대신 `이 브라우저에서는 점수를 저장할 수 없습니다` 안내 문구만 표시한다 (PRD §3.6).

- [ ] **Step 4: `render()`에 `leaderboard` 분기를 연결한다**

Task 2의 `render()`가 이미 4개 화면을 토글하므로 `renderLeaderboard()` 호출만 추가한다.

- [ ] **Step 5: 8개 목록과 연습 모드 제외를 콘솔로 확인한다**

순위표 화면에서:

```js
[document.querySelectorAll('#leaderboard-list > *').length, document.getElementById('leaderboard-list').textContent.includes('연습')]
```

기대 출력: `[8, false]` (목록 컨테이너를 한 조합당 하나로 만들었을 때).

- [ ] **Step 6: 3단계 브라우저 확인 항목 9개를 전부 실행한다**

특히 5번(6번 풀어 5줄만 남는지), 6번(동점 순서), 7번(브라우저 완전 종료 후 재방문), 8번(깨진 JSON), 9번(저장 차단).

- [ ] **Step 7: 1·2단계 회귀를 확인한다**

1단계 확인 항목 10개와 2단계 확인 항목 18개를 다시 훑는다. 특히 연습 모드 복습 라운드와 스피드 타이머가 저장 레이어 추가로 깨지지 않았는지 본다.

- [ ] **Step 8: `script.js` 줄 수를 확인한다**

```bash
wc -l script.js
```

600줄을 넘으면 PRD 부록 B에 따라 일반 `<script>` 태그 기준 파일 분리를 재검토한다. 이 과제에서 분리하지는 않고, 넘었다는 사실만 기록한다.

- [ ] **Step 9: 커밋**

```bash
git add index.html style.css script.js && git commit -m "feat: add leaderboard screen with per-category and per-mode top 5"
```

---

## 범위 밖 (PRD §8)

서버·DB·로그인, 빌드 도구·외부 라이브러리, 사용자 간 경쟁·공유, 문항 편집 UI, 다국어·다크 모드, 40문항 연속 풀기 모드, 순위표 이름 입력, 자동 테스트(`test.html`), 오답 노트·진도 추적·통계. 이 계획의 어느 과제도 위 항목을 만들지 않는다.
