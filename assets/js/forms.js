'use strict';

const formConfig = window.AKIZ_CONFIG || {};

function setFieldError(form, fieldName, message) {
  const field = form.elements[fieldName];
  const error = form.querySelector(`[data-error-for="${fieldName}"]`);
  if (field) field.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (error) error.textContent = message;
}

function validateLeadForm(form) {
  let isValid = true;
  const requiredMessages = {
    name: 'Укажите имя.', phone: 'Укажите телефон.', email: 'Укажите E-mail.',
    personal_data_consent: 'Необходимо согласие на обработку персональных данных.',
    user_agreement_consent: 'Необходимо согласие с пользовательским соглашением.',
    offer_consent: 'Необходимо согласие с публичной офертой.'
  };
  Object.entries(requiredMessages).forEach(([name, message]) => {
    const field = form.elements[name];
    if (!field) return;
    const empty = field?.type === 'checkbox' ? !field.checked : !field?.value.trim();
    setFieldError(form, name, empty ? message : '');
    if (empty) isValid = false;
  });
  const email = form.elements.email;
  if (email?.value && !email.validity.valid) {
    setFieldError(form, 'email', 'Проверьте адрес электронной почты.');
    isValid = false;
  }
  return isValid;
}

function makePayload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  delete data.company;
  ['personal_data_consent', 'user_agreement_consent', 'offer_consent', 'marketing_consent'].forEach((name) => {
    data[name] = Boolean(form.elements[name]?.checked);
  });
  if (form.dataset.source === 'website_test') data.test_score = Number(data.test_score);
  data.source = form.dataset.source || 'website_direct';
  data.form_kind = form.elements.email ? 'application' : 'home';
  data.page_url = window.location.href;
  data.created_at = new Date().toISOString();
  Object.keys(sessionStorage).filter((key) => key.startsWith('akiz_utm_')).forEach((key) => {
    data[key.slice(5)] = sessionStorage.getItem(key);
  });
  return data;
}

document.querySelectorAll('[data-lead-form]').forEach((form) => {
  const submitButton = form.querySelector('[type="submit"]');
  const status = form.querySelector('[data-form-status]');
  let pendingSubmission = null;
  form.addEventListener('input', (event) => { if (event.target.name) setFieldError(form, event.target.name, ''); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    status.textContent = '';
    status.className = 'form-status form-field--wide';
    if (form.elements.company?.value) return;
    if (!validateLeadForm(form)) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
    const payload = makePayload(form);
    const fingerprint = JSON.stringify({ ...payload, created_at: undefined });
    if (!pendingSubmission || pendingSubmission.fingerprint !== fingerprint) {
      pendingSubmission = { fingerprint, requestId: crypto.randomUUID(), createdAt: payload.created_at };
    }
    payload.request_id = pendingSubmission.requestId;
    payload.created_at = pendingSubmission.createdAt;
    window.akizTrack(payload.source === 'website_test' ? 'result_application_submit' : 'application_submit');
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    if (!formConfig.crmEndpoint || typeof formConfig.confirmCrmSuccess !== 'function') {
      status.classList.add('is-error');
      status.textContent = 'Отправка пока не подключена к CRM. Поля останутся заполненными, чтобы данные не пришлось вводить заново.';
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      return;
    }
    try {
      if (payload.source === 'website_test' && (!payload.result_id || !payload.recommended_group)) {
        throw new Error('Final result/group mapping has not been supplied.');
      }
      const response = await fetch(formConfig.crmEndpoint, {
        method: 'POST',
        headers: formConfig.crmTransport === 'google-apps-script'
          ? { 'Content-Type': 'text/plain;charset=UTF-8' }
          : { 'Content-Type': 'application/json', 'Idempotency-Key': payload.request_id },
        body: JSON.stringify(payload),
        redirect: 'follow',
        credentials: 'omit',
        signal: AbortSignal.timeout(45000)
      });
      if (!response.ok) throw new Error(`CRM response: ${response.status}`);
      const body = await response.json();
      if (await formConfig.confirmCrmSuccess(body, payload) !== true) throw new Error('CRM success is not confirmed.');
      window.akizTrack('crm_success');
      if (payload.source === 'website_test') sessionStorage.removeItem('akiz_application_source');
      submitButton.removeAttribute('aria-busy');
      status.textContent = 'Заявка отправлена! Менеджер свяжется с вами в ближайшее время.';
      const dialog = document.querySelector('[data-success-dialog]');
      const telegram = dialog?.querySelector('[data-telegram]');
      if (telegram && formConfig.telegramUrl) {
        telegram.href = formConfig.telegramUrl;
        telegram.hidden = false;
      }
      if (dialog && !dialog.open) dialog.showModal();
    } catch (error) {
      window.akizTrack('crm_error');
      status.classList.add('is-error');
      status.textContent = 'Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз. Введённые данные сохранены в форме.';
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  });
});
