'use strict';

/* Заполняется после получения CRM webhook и ссылки Telegram. Секреты здесь не хранить. */
window.AKIZ_CONFIG = {
  crmEndpoint: 'https://script.google.com/macros/s/AKfycbwX9osqfeRArGZkykSciXVtlqydlxHvmk3XSB_iyPD3xCbMLKtLLG-ZegFXhpBuNIzF/exec',
  telegramUrl: '',
  // Set an adapter only after the backend/CRM response contract is supplied.
  // It must return true exclusively for a confirmed CRM success, not HTTP 2xx alone.
  crmTransport: 'google-apps-script',
  confirmCrmSuccess: (body, payload) => body?.ok === true && body.request_id === payload.request_id
};
