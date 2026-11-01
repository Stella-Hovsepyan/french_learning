// French A0 -> A2/B1 study plan. Content comes from content.json; this file only
// generates the daily schedule from units + the day template, and handles
// localStorage-backed progress, flashcards and the unit exams.

const STORAGE_KEY = 'frenchPlanProgress';
const DAYS_PER_UNIT = 14;

let content = null;
let units = [];
let dayTemplate = [];
let progress = loadProgress();
let viewDay = progress.currentDay || 1;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const res = await fetch('content.json');
    content = await res.json();
    units = content.units;
    dayTemplate = content.dayTemplate;
  } catch (err) {
    document.getElementById('app').innerHTML =
      '<p class="empty-state">Could not load content.json. If running from a local file:// path, serve it with a local server instead (e.g. <code>python3 -m http.server</code>) — browsers block fetch() on file:// for security.</p>';
    return;
  }

  setupNav();
  setupToday();
  setupPlanList();
  setupFlashcards();
  setupQuiz();
  setupResources();
  setupProgress();

  renderToday();
}

// ---------- storage & progress helpers ----------

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw);
    return { ...defaultProgress(), ...parsed };
  } catch {
    return defaultProgress();
  }
}

function defaultProgress() {
  return {
    completedDays: {},
    currentDay: 1,
    streak: 0,
    lastCompleteDate: null,
    examResults: {}
  };
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function totalDays() {
  return units.length * DAYS_PER_UNIT;
}

function unitIndexForGlobalDay(globalDay) {
  return Math.floor((globalDay - 1) / DAYS_PER_UNIT);
}

function dayInUnitForGlobalDay(globalDay) {
  return ((globalDay - 1) % DAYS_PER_UNIT) + 1;
}

function globalDayFor(unitOrder, dayInUnit) {
  return (unitOrder - 1) * DAYS_PER_UNIT + dayInUnit;
}

function isDayComplete(globalDay) {
  return !!progress.completedDays[String(globalDay)];
}

function unitCompletedCount(unit) {
  let n = 0;
  for (let d = 1; d <= DAYS_PER_UNIT; d++) {
    if (isDayComplete(globalDayFor(unit.order, d))) n++;
  }
  return n;
}

function firstIncompleteDayInUnit(unit) {
  for (let d = 1; d <= DAYS_PER_UNIT; d++) {
    if (!isDayComplete(globalDayFor(unit.order, d))) return d;
  }
  return DAYS_PER_UNIT;
}

// ---------- nav ----------

function setupNav() {
  const buttons = document.querySelectorAll('.nav-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('is-active'));
      document.getElementById('mode-' + btn.dataset.mode).classList.add('is-active');
      if (btn.dataset.mode === 'plan') renderPlanList();
      if (btn.dataset.mode === 'resources') renderResources();
      if (btn.dataset.mode === 'progress') renderProgress();
    });
  });
}

function goToMode(mode) {
  document.querySelector(`.nav-btn[data-mode="${mode}"]`).click();
}

// ---------- Today ----------

function setupToday() {
  document.getElementById('jump-prev-day').addEventListener('click', () => {
    viewDay = Math.max(1, viewDay - 1);
    renderToday();
  });
  document.getElementById('jump-next-day').addEventListener('click', () => {
    viewDay = Math.min(totalDays(), viewDay + 1);
    renderToday();
  });
  document.getElementById('today-complete').addEventListener('click', () => {
    markDayComplete(viewDay);
    renderToday();
  });
}

function markDayComplete(globalDay) {
  progress.completedDays[String(globalDay)] = true;
  progress.currentDay = Math.min(totalDays(), globalDay + 1);

  const today = new Date().toISOString().slice(0, 10);
  if (progress.lastCompleteDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    progress.streak = progress.lastCompleteDate === yesterday ? progress.streak + 1 : 1;
    progress.lastCompleteDate = today;
  }
  viewDay = progress.currentDay;
  saveProgress();
}

function renderToday() {
  const unitIndex = unitIndexForGlobalDay(viewDay);
  const unit = units[unitIndex];
  const dayInUnit = dayInUnitForGlobalDay(viewDay);
  const tpl = dayTemplate.find(t => t.day === dayInUnit);
  const tier = content.resourceTiers[unit.resourceTier];
  const done = isDayComplete(viewDay);

  document.getElementById('streak-number').textContent = progress.streak;
  document.getElementById('level-value').textContent = unit.level;
  document.getElementById('daycount-value').textContent = `${viewDay} / ${totalDays()}`;

  let html = `<p class="today-unit-title">Unit ${unit.order} · ${escapeHtml(unit.title)} (day ${dayInUnit} of 14)</p>`;
  html += `<span class="skill-badge">${escapeHtml(tpl.label)}</span>`;
  if (done) html += `<span class="day-complete-tag">Done</span>`;
  html += `<p class="today-task">${escapeHtml(tpl.task)}</p>`;

  if (tpl.skill === 'grammar') {
    const points = tpl.slot === 2 ? unit.grammar : [unit.grammar[tpl.slot]];
    points.forEach(g => { html += renderGrammarBlock(g); });
  }

  if (tpl.skill === 'review' && dayInUnit === 13) {
    unit.grammar.forEach(g => { html += renderGrammarBlock(g); });
    html += renderVocabGrid(unit.vocab);
  }

  if (tpl.skill === 'review' && dayInUnit === 7) {
    html += renderVocabGrid(unit.vocab.slice(0, 6));
  }

  if (tpl.skill === 'vocab' || tpl.skill === 'writing') {
    html += renderVocabGrid(unit.vocab);
  }

  if (tpl.skill === 'pronunciation') {
    html += renderPronunciationBlock(unit.pronunciation);
  }

  if (tpl.skill === 'speaking') {
    html += renderPronunciationBlock(unit.pronunciation);
    html += renderResourceList('Speaking practice', content.alwaysOnResources.speakingPractice);
  }

  if (tpl.skill === 'listening') {
    html += renderResourceList('Listening resources', tier.listening);
  }

  if (tpl.skill === 'reading') {
    html += renderResourceList('Reading resources', tier.reading);
  }

  if (tpl.skill === 'exam') {
    html += `<p>Head to <strong>Unit Exam</strong> in the top navigation, choose "${escapeHtml(unit.title)}", and take the exam. It's self-graded with explanations for every question you get wrong, so review those before moving to the next unit.</p>`;
  }

  document.getElementById('today-card').innerHTML = html;
}

function renderGrammarBlock(g) {
  let html = `<div class="grammar-block"><h4>${escapeHtml(g.title)}</h4><p>${escapeHtml(g.explanation)}</p>`;
  g.examples.forEach(ex => {
    html += `<p class="example-pair"><span class="example-fr">${escapeHtml(ex.fr)}</span><br><span class="example-en">${escapeHtml(ex.en)}</span></p>`;
  });
  html += `</div>`;
  return html;
}

function renderPronunciationBlock(p) {
  let html = `<div class="pronunciation-block"><h4>${escapeHtml(p.title)}</h4><p>${escapeHtml(p.tip)}</p>`;
  p.examples.forEach(ex => {
    html += `<p class="example-pair"><span class="example-fr">${escapeHtml(ex.fr)}</span><br><span class="example-en">${escapeHtml(ex.hint)}</span></p>`;
  });
  html += `</div>`;
  return html;
}

function renderVocabGrid(vocab) {
  let html = `<div class="vocab-grid">`;
  vocab.forEach(v => {
    html += `<div class="vocab-item"><span class="vocab-fr">${escapeHtml(v.fr)}</span><span class="vocab-en">${escapeHtml(v.en)}</span></div>`;
  });
  html += `</div>`;
  return html;
}

function renderResourceList(label, list) {
  let html = `<p class="label">${escapeHtml(label)}</p><ul class="resource-list">`;
  list.forEach(r => {
    html += `<li><a href="${escapeAttr(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a></li>`;
  });
  html += `</ul>`;
  return html;
}

// ---------- Full plan ----------

function setupPlanList() {
  renderPlanList();
}

function renderPlanList() {
  const list = document.getElementById('plan-list');
  list.innerHTML = '';
  units.forEach(unit => {
    const done = unitCompletedCount(unit);
    const row = document.createElement('div');
    row.className = 'unit-row';
    row.innerHTML = `
      <div class="unit-row-main">
        <p class="unit-row-level">${escapeHtml(unit.level)}</p>
        <p class="unit-row-title">Unit ${unit.order} · ${escapeHtml(unit.title)}</p>
      </div>
      <p class="unit-row-progress ${done === DAYS_PER_UNIT ? 'is-done' : ''}">${done} / ${DAYS_PER_UNIT} days</p>
    `;
    row.addEventListener('click', () => {
      viewDay = globalDayFor(unit.order, firstIncompleteDayInUnit(unit));
      goToMode('today');
      renderToday();
    });
    list.appendChild(row);
  });
}

// ---------- Flashcards ----------

let flashOrder = [];
let flashIndex = 0;
let flashVocab = [];

function setupFlashcards() {
  const select = document.getElementById('flashcard-unit-select');
  units.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `Unit ${u.order} · ${u.title}`;
    select.appendChild(opt);
  });
  select.value = units[unitIndexForGlobalDay(viewDay)].id;
  select.addEventListener('change', () => loadFlashcardDeck(select.value));

  const card = document.getElementById('flashcard');
  document.getElementById('flashcard-shuffle').addEventListener('click', () => {
    shuffle(flashOrder);
    flashIndex = 0;
    card.classList.remove('is-flipped');
    renderFlashcard();
  });
  document.getElementById('flashcard-prev').addEventListener('click', () => {
    flashIndex = (flashIndex - 1 + flashOrder.length) % flashOrder.length;
    card.classList.remove('is-flipped');
    renderFlashcard();
  });
  document.getElementById('flashcard-next').addEventListener('click', () => {
    flashIndex = (flashIndex + 1) % flashOrder.length;
    card.classList.remove('is-flipped');
    renderFlashcard();
  });
  card.addEventListener('click', () => card.classList.toggle('is-flipped'));
  card.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      card.classList.toggle('is-flipped');
    }
  });

  loadFlashcardDeck(select.value);
}

function loadFlashcardDeck(unitId) {
  const unit = units.find(u => u.id === unitId);
  flashVocab = unit.vocab;
  flashOrder = flashVocab.map((_, i) => i);
  flashIndex = 0;
  document.getElementById('flashcard').classList.remove('is-flipped');
  renderFlashcard();
}

function renderFlashcard() {
  const v = flashVocab[flashOrder[flashIndex]];
  document.getElementById('flashcard-front-text').textContent = v.fr;
  document.getElementById('flashcard-back-text').textContent = v.en;
  document.getElementById('flashcard-progress').textContent =
    `Card ${flashIndex + 1} of ${flashOrder.length}`;
}

// ---------- Quiz / Unit exam ----------

let quizUnit = null;
let quizOrder = [];
let quizIndex = 0;
let quizAnswers = [];
let furthestIndex = 0;

function setupQuiz() {
  const select = document.getElementById('quiz-unit-select');
  units.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `Unit ${u.order} · ${u.title}`;
    select.appendChild(opt);
  });
  select.value = units[unitIndexForGlobalDay(viewDay)].id;

  document.getElementById('quiz-start').addEventListener('click', () => startQuiz(select.value));
  document.getElementById('quiz-prev').addEventListener('click', prevQuestion);
  document.getElementById('quiz-next').addEventListener('click', nextQuestion);
  document.getElementById('quiz-restart').addEventListener('click', () => startQuiz(quizUnit.id));
}

function startQuiz(unitId) {
  quizUnit = units.find(u => u.id === unitId);
  quizOrder = quizUnit.quiz.map((_, i) => i);
  quizIndex = 0;
  furthestIndex = 0;
  quizAnswers = new Array(quizOrder.length).fill(null);

  document.getElementById('quiz-active').hidden = false;
  document.getElementById('quiz-results').hidden = true;
  renderQuizNavDots();
  renderQuizQuestion();
}

function renderQuizNavDots() {
  const wrap = document.getElementById('quiz-nav-dots');
  wrap.innerHTML = '';
  quizOrder.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'quiz-dot' + (i === quizIndex ? ' is-current' : '') + (quizAnswers[i] !== null ? ' is-answered' : '');
    dot.textContent = i + 1;
    dot.disabled = i > furthestIndex;
    dot.addEventListener('click', () => { quizIndex = i; renderQuizQuestion(); });
    wrap.appendChild(dot);
  });
}

function renderQuizQuestion() {
  const q = quizUnit.quiz[quizOrder[quizIndex]];
  document.getElementById('quiz-progress').textContent = `Question ${quizIndex + 1} of ${quizOrder.length}`;
  document.getElementById('quiz-question').textContent = q.q;

  const optionsWrap = document.getElementById('quiz-options');
  optionsWrap.innerHTML = '';
  const feedback = document.getElementById('quiz-feedback');
  feedback.hidden = true;

  const chosen = quizAnswers[quizIndex];

  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quiz-option';
    btn.textContent = opt;
    if (chosen !== null) {
      btn.disabled = true;
      if (i === q.correctIndex) btn.classList.add('is-correct');
      if (i === chosen && chosen !== q.correctIndex) btn.classList.add('is-incorrect');
      if (i === chosen) btn.classList.add('is-selected');
    }
    btn.addEventListener('click', () => selectAnswer(i));
    optionsWrap.appendChild(btn);
  });

  if (chosen !== null) {
    feedback.hidden = false;
    feedback.textContent = (chosen === q.correctIndex ? 'Correct. ' : 'Not quite. ') + q.explanation;
  }

  document.getElementById('quiz-prev').disabled = quizIndex === 0;
  const isLast = quizIndex === quizOrder.length - 1;
  const nextBtn = document.getElementById('quiz-next');
  nextBtn.hidden = chosen === null;
  nextBtn.textContent = isLast ? 'See results →' : 'Next question →';

  renderQuizNavDots();
}

function selectAnswer(i) {
  quizAnswers[quizIndex] = i;
  furthestIndex = Math.max(furthestIndex, quizIndex);
  renderQuizQuestion();
}

function prevQuestion() {
  if (quizIndex > 0) { quizIndex--; renderQuizQuestion(); }
}

function nextQuestion() {
  if (quizIndex < quizOrder.length - 1) {
    quizIndex++;
    furthestIndex = Math.max(furthestIndex, quizIndex);
    renderQuizQuestion();
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  const mistakes = [];
  let score = 0;
  quizOrder.forEach((qIdx, i) => {
    const q = quizUnit.quiz[qIdx];
    const answer = quizAnswers[i];
    if (answer === q.correctIndex) {
      score++;
    } else {
      mistakes.push({
        question: q.q,
        yourAnswer: answer === null ? '(no answer)' : q.options[answer],
        correctAnswer: q.options[q.correctIndex],
        explanation: q.explanation
      });
    }
  });

  progress.examResults[quizUnit.id] = {
    unitTitle: quizUnit.title,
    score, total: quizOrder.length,
    date: new Date().toISOString().slice(0, 10),
    mistakes
  };
  saveProgress();

  document.getElementById('quiz-active').hidden = true;
  document.getElementById('quiz-results').hidden = false;
  document.getElementById('quiz-score-text').textContent = `${score} / ${quizOrder.length} correct`;

  const reviewWrap = document.getElementById('quiz-mistake-review');
  if (mistakes.length === 0) {
    reviewWrap.innerHTML = '<p class="empty-state">No mistakes — great work!</p>';
  } else {
    reviewWrap.innerHTML = '<h3>Review your mistakes</h3>' + mistakes.map(m => `
      <div class="mistake-item">
        <p class="q-text">${escapeHtml(m.question)}</p>
        <p>Your answer: <span class="your-answer">${escapeHtml(m.yourAnswer)}</span></p>
        <p>Correct answer: <span class="correct-answer">${escapeHtml(m.correctAnswer)}</span></p>
        <p class="explanation">${escapeHtml(m.explanation)}</p>
      </div>
    `).join('');
  }
}

// ---------- Resources ----------

function setupResources() {
  renderResources();
}

function renderResources() {
  const unit = units[unitIndexForGlobalDay(viewDay)];
  const tier = content.resourceTiers[unit.resourceTier];

  const tierWrap = document.getElementById('resources-current-tier');
  tierWrap.innerHTML = `
    <div class="resource-group">
      <h3>Matched to your current unit (${escapeHtml(unit.level)})</h3>
      ${renderResourceList('Listening', tier.listening)}
      ${renderResourceList('Reading', tier.reading)}
    </div>
  `;

  const always = content.alwaysOnResources;
  const alwaysWrap = document.getElementById('resources-always-on');
  alwaysWrap.innerHTML = `
    <div class="resource-group">
      <h3>Grammar reference</h3>
      ${renderResourceList('', always.grammarReference)}
    </div>
    <div class="resource-group">
      <h3>Pronunciation</h3>
      ${renderResourceList('', always.pronunciation)}
    </div>
    <div class="resource-group">
      <h3>Speaking practice / exchange</h3>
      ${renderResourceList('', always.speakingPractice)}
    </div>
    <div class="resource-group">
      <h3>Vocabulary apps</h3>
      ${renderResourceList('', always.vocabApps)}
    </div>
    <div class="resource-group">
      <h3>Verb conjugation</h3>
      ${renderResourceList('', always.conjugation)}
    </div>
  `;
}

// ---------- Progress ----------

function setupProgress() {
  document.getElementById('reset-progress').addEventListener('click', () => {
    if (confirm('Reset all progress? This clears your streak, completed days and exam history on this browser.')) {
      progress = defaultProgress();
      saveProgress();
      viewDay = 1;
      renderProgress();
      renderToday();
    }
  });
  renderProgress();
}

function renderProgress() {
  const total = totalDays();
  let done = 0;
  for (let d = 1; d <= total; d++) if (isDayComplete(d)) done++;
  const pct = Math.round((done / total) * 100);

  document.getElementById('progress-overview').innerHTML = `
    <p class="label">Overall completion</p>
    <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    <p>${done} of ${total} days complete (${pct}%) · current streak: ${progress.streak} day(s)</p>
  `;

  const historyWrap = document.getElementById('exam-history');
  const entries = Object.values(progress.examResults).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (entries.length === 0) {
    historyWrap.innerHTML = '<p class="empty-state">No unit exams taken yet.</p>';
    return;
  }
  historyWrap.innerHTML = entries.map(e => `
    <div class="exam-history-item">
      <span>${escapeHtml(e.unitTitle)}</span>
      <span>${e.score} / ${e.total} · ${e.date}${e.mistakes.length ? ` · ${e.mistakes.length} mistake(s)` : ''}</span>
    </div>
  `).join('');
}

// ---------- utils ----------

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
