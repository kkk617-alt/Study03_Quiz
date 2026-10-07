// 상식 퀴즈 — 모든 로직이 이 파일에 들어간다 (PRD §5.2, §5.3).
// 섹션 순서는 PRD §5.3 을 따른다. 채우지 않은 섹션은 주석만 둔다.

// ---- 1. MODES 설정 테이블 (PRD §5.4) ----
// 모드 차이는 코드 분기가 아니라 이 테이블의 데이터로 표현한다.
// speed / hint 는 Task 9 가 채운다.

const MODES = {
  practice: {
    label: '연습',
    timeLimit: null,
    hintAllowed: false,
    correctScore: 1,
    hintedScore: null,
    ranked: false,
    retryWrong: true,
  },
};

// ---- 2. state 상태 객체 (PRD §3.7) ----
// 화면은 state 를 읽어서 그린다. DOM 에 상태를 저장하지 않는다.
// 2·3단계에서만 쓰이는 필드도 지금 선언해 객체 모양이 뒤에서 바뀌지 않게 한다.

const state = {
  screen: 'home',        // home | quiz | result | leaderboard
  mode: 'practice',      // MODES 의 키
  categoryId: null,
  deck: [],              // 섞인 문항 + 섞인 보기 + 재계산된 정답 위치
  index: 0,
  score: 0,
  answers: [],           // { questionId, chosenIndex, correct, hintUsed }
  phase: 'answering',    // answering | explaining
  hintUsed: false,       // 현재 문항에서 힌트를 썼는지
  hintRemoved: [],       // 힌트로 지운 보기 인덱스
  deadline: null,        // 스피드 모드: Date.now() + 15000
  reviewRound: false,    // 복습 라운드 진행 중인지
  baseScore: null,       // 복습 라운드 중 보존하는 원점수
};

// ---- 3. validateQuestions() — 로드 시 데이터 검증 (PRD §4.5) ----

const QUESTIONS_PER_CATEGORY = 10;
const OPTIONS_PER_QUESTION = 4;

function isFilled(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// 사람이 읽을 수 있는 오류 문자열의 배열을 돌려준다. 빈 배열이면 통과.
// 문제를 하나 찾고 멈추지 않는다 — 전체 목록을 모아 돌려준다.
function validateQuestions() {
  const errors = [];
  const seenIds = {};

  for (let c = 0; c < CATEGORIES.length; c++) {
    const categoryId = CATEGORIES[c].id;
    const list = QUESTIONS[categoryId];

    if (!Array.isArray(list)) {
      errors.push(categoryId + ': QUESTIONS 에 이 카테고리의 문항 배열이 없습니다');
      continue;
    }
    if (list.length !== QUESTIONS_PER_CATEGORY) {
      errors.push(categoryId + ': 문항 수가 ' + list.length + '개입니다 (정확히 ' +
        QUESTIONS_PER_CATEGORY + '개여야 합니다)');
    }

    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      if (!q || typeof q !== 'object') {
        errors.push(categoryId + ' #' + (i + 1) + ': 문항이 객체가 아닙니다');
        continue;
      }
      const where = isFilled(q.id) ? q.id : categoryId + ' #' + (i + 1);

      if (!isFilled(q.id)) {
        errors.push(where + ': id 가 비어 있습니다');
      } else if (seenIds[q.id]) {
        errors.push(q.id + ': id 가 중복됩니다');
      } else {
        seenIds[q.id] = true;
      }

      if (!isFilled(q.question)) {
        errors.push(where + ': question 이 비어 있습니다');
      }

      if (!Array.isArray(q.options) || q.options.length !== OPTIONS_PER_QUESTION) {
        const got = Array.isArray(q.options) ? q.options.length + '개' : typeof q.options;
        errors.push(where + ': options 가 ' + OPTIONS_PER_QUESTION + '개가 아닙니다 (' + got + ')');
      } else {
        for (let o = 0; o < q.options.length; o++) {
          if (!isFilled(q.options[o])) {
            errors.push(where + ': ' + (o + 1) + '번 보기가 비어 있습니다');
          }
        }
      }

      if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 ||
          q.answerIndex > OPTIONS_PER_QUESTION - 1) {
        errors.push(where + ': answerIndex 가 0~' + (OPTIONS_PER_QUESTION - 1) +
          ' 의 정수가 아닙니다 (' + JSON.stringify(q.answerIndex) + ')');
      }

      if (!isFilled(q.explanation)) {
        errors.push(where + ': explanation 이 비어 있습니다');
      }
      if (!q.source || !isFilled(q.source.title)) {
        errors.push(where + ': source.title 이 비어 있습니다');
      }
      if (!q.source || !isFilled(q.source.url)) {
        errors.push(where + ': source.url 이 비어 있습니다');
      }
    }
  }

  return errors;
}

// ---- 4. 유틸 (셔플, 점수 서식) — Task 3·4 ----

// ---- 5. 덱 생성 (buildDeck) — Task 3 ----

// ---- 6. 렌더 함수 ----

const SCREEN_IDS = {
  home: 'screen-home',
  quiz: 'screen-quiz',
  result: 'screen-result',
  leaderboard: 'screen-leaderboard',
};

// 화면 전환의 단일 진입점. state.screen 을 보고 해당 화면만 보이게 한다.
function render() {
  const keys = Object.keys(SCREEN_IDS);
  for (let i = 0; i < keys.length; i++) {
    const el = document.getElementById(SCREEN_IDS[keys[i]]);
    if (el) el.hidden = keys[i] !== state.screen;
  }
  if (state.screen === 'home') renderHome();
}

function renderHome() {
  const list = document.getElementById('category-list');
  if (!list) return;
  list.innerHTML = '';

  for (let i = 0; i < CATEGORIES.length; i++) {
    const category = CATEGORIES[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category.name;
    button.dataset.categoryId = category.id;
    button.disabled = dataBlocked;
    button.addEventListener('click', function () {
      startRound('practice', category.id);
    });
    list.appendChild(button);
  }
}

// ---- 7. 이벤트 핸들러 ----

// 1단계에서는 state 를 채우고 화면만 바꾼다. 덱 생성은 Task 3.
function startRound(mode, categoryId) {
  if (dataBlocked) return;
  state.mode = mode;
  state.categoryId = categoryId;
  state.index = 0;
  state.score = 0;
  state.answers = [];
  state.phase = 'answering';
  state.hintUsed = false;
  state.hintRemoved = [];
  state.deadline = null;
  state.reviewRound = false;
  state.baseScore = null;
  state.screen = 'quiz';
  render();
}

// ---- 8. 타이머 — Task 10 ----

// ---- 9. 순위표 저장/조회 — Task 13·14 ----

// ---- 10. 초기화 ----

// 데이터에 오류가 있으면 한 카테고리만 막지 않고 전체를 막는다 (PRD §4.5).
let dataBlocked = false;

function init() {
  const errors = validateQuestions();
  dataBlocked = errors.length > 0;

  if (dataBlocked) {
    console.error('문항 데이터 오류 ' + errors.length + '건:');
    for (let i = 0; i < errors.length; i++) console.error('  - ' + errors[i]);
    const notice = document.getElementById('data-error');
    if (notice) notice.hidden = false;
  }

  state.screen = 'home';
  render();
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('DOMContentLoaded', init);
}
