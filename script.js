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

// ---- 4. 유틸 (셔플, 점수 서식) ----

// Fisher-Yates. 새 배열을 반환하고 입력을 수정하지 않는다.
function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function categoryName(categoryId) {
  for (let i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].id === categoryId) return CATEGORIES[i].name;
  }
  return '';
}

function sourceHost(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
}

// 정수면 소수점을 붙이지 않는다 (PRD §2.3). toFixed(1) 한 줄로 끝내면 8 이 8.0 이 된다.
function formatScore(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

// MODES 테이블을 읽어 점수를 낸다. 모드 이름으로 분기하지 않는다 (PRD §5.4).
// hintedScore 가 null 인 모드는 힌트 개념이 없으므로 correctScore 를 쓴다.
function scoreFor(mode, correct, hintUsed) {
  const config = MODES[mode];
  if (!config || !correct) return 0;
  if (hintUsed && config.hintedScore !== null && config.hintedScore !== undefined) {
    return config.hintedScore;
  }
  return config.correctScore;
}

// ---- 5. 덱 생성 (buildDeck) (PRD §3.8.1) ----

// 문항 순서를 섞고, 문항마다 보기를 섞은 뒤 정답의 새 위치를 다시 계산한다.
// 보기 섞기는 인덱스 순열 방식이다 — 정답 문자열을 indexOf 로 찾으면
// 같은 문자열 보기가 둘 있을 때 엉뚱한 위치를 가리킨다.
// QUESTIONS 원본은 건드리지 않는다.
function buildDeck(categoryId) {
  const source = Array.isArray(QUESTIONS[categoryId]) ? QUESTIONS[categoryId] : [];
  const ordered = shuffle(source);
  const deck = [];

  for (let i = 0; i < ordered.length; i++) {
    const q = ordered[i];
    const positions = [];
    for (let p = 0; p < q.options.length; p++) positions.push(p);
    const perm = shuffle(positions);

    const options = [];
    for (let n = 0; n < perm.length; n++) options.push(q.options[perm[n]]);

    deck.push({
      id: q.id,
      question: q.question,
      options: options,
      answerIndex: perm.indexOf(q.answerIndex),
      explanation: q.explanation,
      source: { title: q.source.title, url: q.source.url },
    });
  }

  return deck;
}

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
  else if (state.screen === 'quiz') renderQuiz();
  else if (state.screen === 'result') renderResult();
}

function renderHome() {
  // 순위표 기록 여부는 모드 이름이 아니라 MODES 테이블로 판단한다 (PRD §2.2, §3.2, §5.4).
  const notice = document.getElementById('unranked-notice');
  if (notice) {
    const mode = MODES[state.mode];
    notice.textContent = mode.label + ' 모드 · 순위표에 기록되지 않음';
    notice.hidden = mode.ranked;
  }

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

// phase 가 'answering' 이면 문제까지, 'explaining' 이면 해설까지 그린다.
function renderQuiz() {
  const item = state.deck[state.index];
  if (!item) return;

  const explaining = state.phase === 'explaining';
  const record = explaining ? state.answers[state.answers.length - 1] : null;

  setText('progress', (state.index + 1) + ' / ' + state.deck.length);
  setText('round-label', categoryName(state.categoryId) + ' · ' + MODES[state.mode].label);
  setText('question-text', item.question);

  const list = document.getElementById('option-list');
  if (list) {
    list.innerHTML = '';
    for (let i = 0; i < item.options.length; i++) {
      list.appendChild(buildOptionButton(item, i, explaining, record));
    }
  }

  const area = document.getElementById('explain-area');
  if (area) area.hidden = !explaining;

  if (explaining && record) {
    setText('feedback', record.correct ? '✓ 정답' : '✗ 오답');
    const feedback = document.getElementById('feedback');
    if (feedback) {
      feedback.classList.remove('is-correct', 'is-wrong');
      feedback.classList.add(record.correct ? 'is-correct' : 'is-wrong');
    }
    setText('explanation', item.explanation);
    setText('source', '출처: ' + item.source.title + ' · ' + sourceHost(item.source.url));
    setText('next-btn', state.index === state.deck.length - 1 ? '결과 보기' : '다음');
  }
}

function buildOptionButton(item, i, explaining, record) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option';
  button.textContent = item.options[i];
  button.dataset.optionIndex = String(i);
  button.disabled = explaining;

  if (explaining && record) {
    if (i === item.answerIndex) button.classList.add('is-answer');
    if (i === record.chosenIndex && !record.correct) button.classList.add('is-chosen-wrong');
    if (i === record.chosenIndex && record.correct) button.classList.add('is-chosen-right');
  }

  button.addEventListener('click', function () {
    selectOption(i);
  });
  return button;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// 만점은 모든 모드에서 10점이다 (PRD §2.3).
function renderResult() {
  setText('result-score', formatScore(state.score) + ' / ' + QUESTIONS_PER_CATEGORY);
  setText('result-label', categoryName(state.categoryId) + ' · ' +
    MODES[state.mode].label + ' 모드');
}

// ---- 7. 이벤트 핸들러 ----

function startRound(mode, categoryId) {
  if (dataBlocked) return;
  state.mode = mode;
  state.categoryId = categoryId;
  state.deck = buildDeck(categoryId);
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

// 해설 상태나 시간 초과 뒤의 클릭은 받지 않는다 (PRD §3.4, §3.9.3).
// 버튼 disabled 만으로는 키보드·라벨 경로가 남으므로 여기서 phase 를 본다.
function selectOption(index) {
  if (state.phase !== 'answering') return;
  const item = state.deck[state.index];
  if (!item) return;

  const correct = index === item.answerIndex;
  state.answers.push({
    questionId: item.id,
    chosenIndex: index,
    correct: correct,
    hintUsed: state.hintUsed,
  });
  state.score += scoreFor(state.mode, correct, state.hintUsed);
  state.phase = 'explaining';
  render();
}

function nextQuestion() {
  state.index += 1;
  state.phase = 'answering';
  state.hintUsed = false;
  state.hintRemoved = [];
  state.deadline = null;

  if (state.index >= state.deck.length) {
    state.screen = 'result';
  }
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

  const next = document.getElementById('next-btn');
  if (next) next.addEventListener('click', nextQuestion);

  const retry = document.getElementById('retry-btn');
  if (retry) retry.addEventListener('click', function () {
    startRound(state.mode, state.categoryId);
  });

  const home = document.getElementById('home-btn');
  if (home) home.addEventListener('click', function () {
    state.screen = 'home';
    render();
  });

  state.screen = 'home';
  render();
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('DOMContentLoaded', init);
}
