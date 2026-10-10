// 상식 퀴즈 — 모든 로직이 이 파일에 들어간다 (PRD §5.2, §5.3).
// 섹션 순서는 PRD §5.3 을 따른다. 채우지 않은 섹션은 주석만 둔다.

// ---- 1. MODES 설정 테이블 (PRD §5.4) ----
// 모드 차이는 코드 분기가 아니라 이 테이블의 데이터로 표현한다.
// 모드 규칙(PRD §2.2)과 점수 규칙(PRD §2.3)의 구현상 단일 출처다. 규칙이 바뀌면 여기만 고친다.
// timeLimit 은 문항당 제한 시간(초), null 이면 제한 없음.
// hintedScore 는 힌트를 쓰고 맞혔을 때 점수, null 이면 그 모드에 힌트 개념이 없다.

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
  speed: {
    label: '스피드',
    timeLimit: 15,
    hintAllowed: false,
    correctScore: 1,
    hintedScore: null,
    ranked: true,
    retryWrong: false,
  },
  hint: {
    label: '힌트',
    timeLimit: null,
    hintAllowed: true,
    correctScore: 1,
    hintedScore: 0.5,
    ranked: true,
    retryWrong: false,
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
// 인자를 주지 않으면 실제 QUESTIONS 를 본다. 자체 점검(§11)은 가짜 데이터를 넣어 부른다.
function validateQuestions(questions) {
  const data = questions === undefined ? QUESTIONS : questions;
  const errors = [];
  const seenIds = {};

  if (!data || typeof data !== 'object') {
    return ['문항 데이터가 객체가 아닙니다'];
  }

  for (let c = 0; c < CATEGORIES.length; c++) {
    const categoryId = CATEGORIES[c].id;
    const list = data[categoryId];

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
  renderModeList();
  renderUnrankedNotice('unranked-notice', true);

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
      startRound(state.mode, category.id);
    });
    list.appendChild(button);
  }
}

// 모드 이름을 코드에 적지 않고 MODES[key].label 에서 읽는다. 모드를 더해도 이 함수는 그대로다.
function renderModeList() {
  const list = document.getElementById('mode-list');
  if (!list) return;
  list.innerHTML = '';

  const keys = Object.keys(MODES);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = MODES[key].label;
    button.dataset.mode = key;

    const selected = key === state.mode;
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    if (selected) button.classList.add('is-selected');

    button.addEventListener('click', function () {
      selectMode(key);
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
  setText('score', '점수 ' + formatScore(state.score));
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
    const sourceLink = document.getElementById('source-link');
    if (sourceLink) {
      sourceLink.textContent = item.source.title;
      sourceLink.href = item.source.url;
    }
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

// 순위표 기록 여부는 모드 이름이 아니라 MODES 테이블로 판단한다 (PRD §2.2, §3.2, §5.4).
// 두 화면이 같은 문구를 쓰므로 한 곳에서만 만든다. 시작 화면은 어떤 모드인지 알 길이
// 따로 없어 모드 이름을 앞에 붙이고, 결과 화면은 바로 윗줄이 이미 모드를 말하므로 붙이지 않는다.
function renderUnrankedNotice(elementId, withModeLabel) {
  const notice = document.getElementById(elementId);
  if (!notice) return;
  const mode = MODES[state.mode];
  const prefix = withModeLabel ? mode.label + ' 모드 · ' : '';
  notice.textContent = prefix + '순위표에 기록되지 않음';
  notice.hidden = mode.ranked;
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
  renderUnrankedNotice('result-unranked');
  renderResultList();
}

// 한 판에서 문항마다 맞혔는지와 정답을 보여 준다 (노트 5.3.2.5).
function renderResultList() {
  const list = document.getElementById('result-list');
  if (!list) return;
  list.innerHTML = '';

  for (let i = 0; i < state.answers.length; i++) {
    const answer = state.answers[i];
    const item = deckItemById(answer.questionId);

    const li = document.createElement('li');
    li.classList.add(answer.correct ? 'result-correct' : 'result-wrong');

    const question = document.createElement('p');
    question.textContent = item ? item.question : answer.questionId;

    const detail = document.createElement('p');
    detail.classList.add('result-detail');
    detail.textContent = (answer.correct ? '정답' : '오답') + ' · 정답: ' +
      (item ? item.options[item.answerIndex] : '');

    li.appendChild(question);
    li.appendChild(detail);
    list.appendChild(li);
  }
}

function deckItemById(questionId) {
  for (let i = 0; i < state.deck.length; i++) {
    if (state.deck[i].id === questionId) return state.deck[i];
  }
  return null;
}

// ---- 7. 이벤트 핸들러 ----

// 모드를 고르는 것만으로 라운드가 시작되지 않는다. 시작은 카테고리를 고를 때다 (PRD §3.2).
function selectMode(mode) {
  if (!MODES[mode]) return;
  state.mode = mode;
  render();
}

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

// ---- 11. 자체 점검 (주소 끝에 ?test) ----
// 눈으로 안 보이는 로직을 브라우저에서 바로 확인한다. 결과는 콘솔에만 찍는다.
// 파일을 늘리지 않으려고 앱 안에 두었다 (PRD §7).

const SELF_TESTS = [];

function selfTest(name, run) {
  SELF_TESTS.push({ name: name, run: run });
}

function runSelfTests() {
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < SELF_TESTS.length; i++) {
    const test = SELF_TESTS[i];
    const failures = [];
    const check = function (condition, message) {
      if (!condition) failures.push(message);
    };
    try {
      test.run(check);
    } catch (error) {
      failures.push('예외: ' + error.message);
    }
    if (failures.length === 0) {
      passed += 1;
      console.log('통과: ' + test.name);
    } else {
      failed += 1;
      console.error('실패: ' + test.name + '\n  - ' + failures.join('\n  - '));
    }
  }

  console.log('자체 점검 결과: 통과 ' + passed + ', 실패 ' + failed);
  return { passed: passed, failed: failed };
}

// 점검용 가짜 문항 묶음. 실제 QUESTIONS 를 건드리지 않는다.
function sampleSet() {
  const data = {};
  for (let c = 0; c < CATEGORIES.length; c++) {
    const key = CATEGORIES[c].id;
    data[key] = [];
    for (let i = 1; i <= QUESTIONS_PER_CATEGORY; i++) {
      const id = key + '-' + (i < 10 ? '0' + i : String(i));
      data[key].push({
        id: id,
        question: id + ' 문제',
        options: ['보기 하나', '보기 둘', '보기 셋', '보기 넷'],
        answerIndex: 0,
        explanation: '점검용 해설 한 줄.',
        source: { title: '점검용 출처', url: 'https://example.org/' + id },
      });
    }
  }
  return data;
}

selfTest('shuffle은 같은 원소를 모두 담은 새 배열을 반환한다', function (check) {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(input);
  check(out !== input, '같은 배열 참조를 돌려줌');
  check(input.join(',') === '1,2,3,4,5,6,7,8', '입력 배열이 바뀜');
  check(out.slice().sort().join(',') === input.slice().sort().join(','), '원소 집합이 달라짐');
});

selfTest('shuffle은 random 값에 따라 순서를 바꾼다', function (check) {
  const realRandom = Math.random;
  try {
    Math.random = function () { return 0; };
    const low = shuffle([1, 2, 3, 4, 5]).join(',');
    Math.random = function () { return 0.999999; };
    const high = shuffle([1, 2, 3, 4, 5]).join(',');
    check(low !== high, 'random 값을 바꿔도 결과가 같음');
  } finally {
    Math.random = realRandom;
  }
});

selfTest('buildDeck은 해당 카테고리 문항만 모두 담는다', function (check) {
  for (let c = 0; c < CATEGORIES.length; c++) {
    const key = CATEGORIES[c].id;
    const deck = buildDeck(key);
    const want = QUESTIONS[key].map(function (q) { return q.id; }).sort().join(',');
    const got = deck.map(function (d) { return d.id; }).sort().join(',');
    check(deck.length === QUESTIONS[key].length, key + ': 문항 수가 다름');
    check(got === want, key + ': 문항 구성이 다름');
  }
});

selfTest('buildDeck은 보기를 섞어도 정답 위치를 맞게 다시 계산한다', function (check) {
  for (let run = 0; run < 20; run++) {
    for (let c = 0; c < CATEGORIES.length; c++) {
      const key = CATEGORIES[c].id;
      const deck = buildDeck(key);
      for (let i = 0; i < deck.length; i++) {
        const d = deck[i];
        const origin = QUESTIONS[key].filter(function (q) { return q.id === d.id; })[0];
        check(d.options[d.answerIndex] === origin.options[origin.answerIndex],
          d.id + ': 정답 보기가 바뀜');
        check(d.options.slice().sort().join('|') === origin.options.slice().sort().join('|'),
          d.id + ': 보기 집합이 바뀜');
      }
    }
  }
});

selfTest('buildDeck은 원본 문항을 바꾸지 않는다', function (check) {
  const before = JSON.stringify(QUESTIONS);
  for (let i = 0; i < 10; i++) {
    for (let c = 0; c < CATEGORIES.length; c++) buildDeck(CATEGORIES[c].id);
  }
  check(JSON.stringify(QUESTIONS) === before, 'QUESTIONS 가 바뀜');
});

selfTest('scoreFor: 맞히면 1점, 틀리면 0점', function (check) {
  check(scoreFor('practice', true, false) === 1, '정답이 1점이 아님');
  check(scoreFor('practice', false, false) === 0, '오답이 0점이 아님');
  check(scoreFor('practice', false, true) === 0, '힌트를 쓴 오답이 0점이 아님');
});

selfTest('formatScore: 정수에 소수점을 붙이지 않는다', function (check) {
  check(formatScore(0) === '0', 'formatScore(0) 이 "0" 이 아님');
  check(formatScore(7) === '7', 'formatScore(7) 이 "7" 이 아님');
  check(formatScore(10) === '10', 'formatScore(10) 이 "10" 이 아님');
  check(formatScore(7.5) === '7.5', 'formatScore(7.5) 가 "7.5" 가 아님');
  check(formatScore(0.5) === '0.5', 'formatScore(0.5) 가 "0.5" 가 아님');
});

selfTest('validateQuestions: 올바른 40문항은 오류가 없다', function (check) {
  const errors = validateQuestions(sampleSet());
  check(errors.length === 0, '오류가 나옴: ' + errors.join(' / '));
});

selfTest('validateQuestions: 카테고리마다 문항 수가 다르면 오류', function (check) {
  const key = CATEGORIES[0].id;
  const few = sampleSet();
  few[key].pop();
  check(validateQuestions(few).some(function (e) { return e.indexOf(key) === 0; }),
    '문항 9개가 통과됨');

  const many = sampleSet();
  many[key].push(many[key][0]);
  check(validateQuestions(many).length > 0, '문항 11개가 통과됨');

  const missing = sampleSet();
  missing[key] = null;
  check(validateQuestions(missing).some(function (e) { return e.indexOf('문항 배열이 없습니다') !== -1; }),
    '문항 배열이 없는데 통과됨');

  check(validateQuestions(null).length > 0, 'null 이 통과됨');
});

selfTest('validateQuestions: 보기 수, 빈 보기, answerIndex 범위를 검사한다', function (check) {
  const key = CATEGORIES[0].id;

  const three = sampleSet();
  three[key][0].options = ['하나', '둘', '셋'];
  check(validateQuestions(three).some(function (e) { return e.indexOf('options') !== -1; }),
    '보기 3개가 통과됨');

  const blank = sampleSet();
  blank[key][1].options[2] = '   ';
  check(validateQuestions(blank).some(function (e) { return e.indexOf('비어 있습니다') !== -1; }),
    '빈 보기가 통과됨');

  const outOfRange = sampleSet();
  outOfRange[key][2].answerIndex = 4;
  check(validateQuestions(outOfRange).some(function (e) { return e.indexOf('answerIndex') !== -1; }),
    'answerIndex 4 가 통과됨');

  const notInteger = sampleSet();
  notInteger[key][3].answerIndex = '1';
  check(validateQuestions(notInteger).some(function (e) { return e.indexOf('answerIndex') !== -1; }),
    '문자열 answerIndex 가 통과됨');
});

selfTest('validateQuestions: 필수 항목, id 중복, 출처를 검사한다', function (check) {
  const key = CATEGORIES[0].id;
  const other = CATEGORIES[1].id;

  const noExplanation = sampleSet();
  noExplanation[key][0].explanation = '';
  check(validateQuestions(noExplanation).some(function (e) { return e.indexOf('explanation') !== -1; }),
    '빈 해설이 통과됨');

  const duplicateId = sampleSet();
  duplicateId[other][0].id = duplicateId[key][0].id;
  check(validateQuestions(duplicateId).some(function (e) { return e.indexOf('중복') !== -1; }),
    'id 중복이 통과됨');

  const noTitle = sampleSet();
  noTitle[key][1].source.title = '';
  check(validateQuestions(noTitle).some(function (e) { return e.indexOf('source.title') !== -1; }),
    '출처 이름 없음이 통과됨');

  const noUrl = sampleSet();
  noUrl[key][2].source.url = '';
  check(validateQuestions(noUrl).some(function (e) { return e.indexOf('source.url') !== -1; }),
    '출처 주소 없음이 통과됨');
});

selfTest('실제 문항 데이터(QUESTIONS)가 규칙을 통과한다', function (check) {
  const errors = validateQuestions();
  check(errors.length === 0, '오류 ' + errors.length + '건: ' + errors.join(' / '));

  let total = 0;
  for (let c = 0; c < CATEGORIES.length; c++) total += QUESTIONS[CATEGORIES[c].id].length;
  check(total === CATEGORIES.length * QUESTIONS_PER_CATEGORY, '전체 문항이 ' + total + '개');
});

// 주소 끝에 ?test 가 있으면 점검을 돌린다 (노트 5.3.2.8).
if (typeof location !== 'undefined' && /[?&]test\b/.test(location.search)) {
  runSelfTests();
}
