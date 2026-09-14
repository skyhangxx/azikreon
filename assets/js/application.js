'use strict';
(() => {
  const form = document.querySelector('[data-lead-form]');
  if (!form) return;
  const state = window.AKIZ_TEST_ENGINE.readState();
  const source = sessionStorage.getItem('akiz_application_source');
  const validResult = state?.version === 2 && state.complete && window.AKIZ_TEST_ENGINE.result(state.test_score, window.AKIZ_TEST_CONFIG);
  form.dataset.source = source === 'website_test' && validResult ? 'website_test' : 'website_direct';
  if (form.dataset.source !== 'website_test') return;
  ['test_score', 'test_level', 'result_id', 'recommended_group'].forEach((name) => {
    const field = document.createElement('input'); field.type = 'hidden'; field.name = name;
    field.value = validResult[name] ?? ''; form.append(field);
  });
})();
