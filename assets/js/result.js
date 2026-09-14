'use strict';
(() => {
  const page = document.querySelector('[data-result-page]');
  if (!page) return;
  const state = window.AKIZ_TEST_ENGINE.readState();
  const result = state?.version === 2 && state.complete ? window.AKIZ_TEST_ENGINE.result(state.test_score, window.AKIZ_TEST_CONFIG) : null;
  page.querySelector('[data-result-content]').hidden = !result;
  page.querySelector('[data-result-empty]').hidden = Boolean(result);
  if (!result) return;
  page.querySelector('[data-result-score]').textContent = result.test_score;
  page.querySelector('[data-result-title]').textContent = result.title.charAt(0) + result.title.slice(1).toLocaleLowerCase('ru');
  page.querySelector('[data-result-level]').textContent = result.korean;
  const description = page.querySelector('[data-result-description]');
  description.replaceChildren(...result.description.split('\n\n').map((text) => {
    const paragraph = document.createElement('p'); paragraph.textContent = text; return paragraph;
  }));
  description.hidden = !result.description;
  const dial = page.querySelector('[data-result-dial]');
  dial.style.setProperty('--score-angle', `${result.angle}deg`);
  dial.setAttribute('aria-label', `${result.test_score}/15`);
  const artwork = page.querySelector('[data-result-image]');
  artwork.src = result.test_score === 0
    ? '/assets/images/current/result-ring-zero.png'
    : '/assets/images/current/result-ring-' + result.test_score + '.webp';
  dial.classList.toggle('result-dial--zero', result.test_score === 0);
  window.akizTrack('result_view', { total_score: result.test_score, result_id: result.result_id });
})();
