'use strict';

const testConfig = window.AKIZ_TEST_CONFIG;
const testRoot = document.querySelector('[data-test]');

if (testConfig && testRoot && !window.AKIZ_TEST_ENGINE.validQuestions(testConfig.questions)) {
  testRoot.querySelector('[data-question-form]').hidden = true;
  testRoot.querySelector('.test-progress__meta').hidden = true;
  testRoot.querySelector('[data-progress]').hidden = true;
  testRoot.dataset.configuration = 'missing-questions';
  console.warn('AKIZ: final 15 questions and correct answers are missing.');
}
if (testConfig && testRoot && window.AKIZ_TEST_ENGINE.validQuestions(testConfig.questions)) {
  const previousState = window.AKIZ_TEST_ENGINE.readState();
  const savedState = previousState?.version === 2 ? previousState : null;
  const state = { version: 2, index: 0, answers: {} };
  if (savedState && !savedState.complete) {
    state.index = Number.isInteger(savedState.index) ? Math.max(0, Math.min(14, savedState.index)) : 0;
    testConfig.questions.forEach((q) => {
      if (q.answers.some((a) => a.id === savedState.answers?.[q.id])) state.answers[q.id] = savedState.answers[q.id];
    });
    const firstMissing = testConfig.questions.findIndex((q) => !state.answers[q.id]);
    if (firstMissing >= 0) state.index = Math.min(state.index, firstMissing);
  }
  const questionElement = testRoot.querySelector('[data-question]');
  const answersElement = testRoot.querySelector('[data-answers]');
  const form = testRoot.querySelector('[data-question-form]');
  const backButton = testRoot.querySelector('[data-back]');
  const nextButton = testRoot.querySelector('[data-next]');
  const progress = testRoot.querySelector('[data-progress]');

  window.akizTrack('test_start');

  const save = () => sessionStorage.setItem('akiz_test_state', JSON.stringify(state));
  const render = (animateChange = false) => {
    const question = testConfig.questions[state.index];
    const total = testConfig.questions.length;
    const percent = Math.round(((state.index + 1) / total) * 100);
    questionElement.textContent = question.text;
    testRoot.querySelector('[data-question-context]').textContent = question.context || '';
    testRoot.querySelector('[data-question-korean]').textContent = question.korean || '';
    testRoot.querySelector('[data-question-number]').textContent = state.index + 1;
    testRoot.querySelector('[data-progress-label]').textContent = `Вопрос ${state.index + 1} из ${total}`;
    testRoot.querySelector('[data-progress-percent]').textContent = `${percent}%`;
    testRoot.querySelector('[data-progress-fill]').style.transform = `scaleX(${(state.index + 1) / total})`;
    progress.setAttribute('aria-valuemax', String(total));
    progress.setAttribute('aria-valuenow', String(state.index + 1));
    answersElement.replaceChildren(...question.answers.map((answer, index) => {
      const label = document.createElement('label');
      label.className = 'answer-option';
      label.innerHTML = `<input type="radio" name="answer" value="${answer.id}"><span class="answer-letter" aria-hidden="true">${'ABCD'[index]})</span><span>${answer.text}</span>`;
      const input = label.querySelector('input');
      input.checked = state.answers[question.id] === answer.id;
      return label;
    }));
    backButton.hidden = state.index === 0;
    nextButton.disabled = !state.answers[question.id];
    nextButton.firstChild.textContent = state.index === total - 1 ? 'Узнать результат ' : 'Следующий вопрос ';
    save();
    if (animateChange && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      testRoot.querySelectorAll('[data-question-context], [data-question-korean], [data-question], [data-answers]').forEach((element) => {
        element.getAnimations().forEach((animation) => animation.cancel());
        element.animate([
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 280, easing: 'ease-out' });
      });
    }
  };

  answersElement.addEventListener('change', (event) => {
    const question = testConfig.questions[state.index];
    state.answers[question.id] = event.target.value;
    nextButton.disabled = false;
    window.akizTrack('test_answer', { question_id: question.id, answer_id: event.target.value });
    save();
  });

  backButton.addEventListener('click', () => { if (state.index > 0) { state.index -= 1; render(true); } });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.answers[testConfig.questions[state.index].id]) return;
    if (state.index < testConfig.questions.length - 1) { state.index += 1; render(true); questionElement.focus?.(); return; }
    const totalScore = window.AKIZ_TEST_ENGINE.score(testConfig.questions, state.answers);
    const result = window.AKIZ_TEST_ENGINE.result(totalScore, testConfig);
    sessionStorage.setItem('akiz_test_state', JSON.stringify({ ...state, totalScore, complete: true,
      test_score: result.test_score, test_level: result.test_level,
      result_id: result.result_id, recommended_group: result.recommended_group }));
    window.akizTrack('test_complete', { total_score: totalScore, result_id: result.result_id });
    window.location.href = '/test/result';
  });
  render();
}
