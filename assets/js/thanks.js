'use strict';

const telegramLink = document.querySelector('[data-telegram]');
if (telegramLink && window.AKIZ_CONFIG?.telegramUrl) { telegramLink.href = window.AKIZ_CONFIG.telegramUrl; telegramLink.hidden = false; }
let stateOnThanks = null;
try { stateOnThanks = JSON.parse(sessionStorage.getItem('akiz_test_state') || 'null'); } catch { /* Invalid or unavailable state is treated as a direct visit. */ }
const thanksForm = new URLSearchParams(window.location.search).get('form');
const isQuizSubmission = thanksForm === 'quiz' || (!thanksForm && stateOnThanks?.complete);
const testThanks = document.querySelector('[data-test-thanks]');
if (testThanks) testThanks.hidden = !isQuizSubmission;
