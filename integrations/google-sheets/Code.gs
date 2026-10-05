/* Paste into the spreadsheet's Extensions > Apps Script. Run setupCrm once. */
const SPREADSHEET_ID = '1rI6Ikh9yRoxYC9z0cgRv06T4nJrNEdWR-CMY4Ly6J_M';
const CRM_SHEET = 'Заявки AKIZ';
const HEADERS = ['ID заявки', 'Дата получения', 'Статус', 'Имя', 'Телефон', 'Email', 'Telegram', 'Источник', 'Баллы', 'Уровень', 'ID результата', 'Группа', 'UTM source', 'UTM medium', 'UTM campaign', 'UTM term', 'UTM content', 'Страница', 'Согласие ПД', 'Соглашение', 'Оферта', 'Рассылка', 'Ответственный', 'Комментарий', 'Следующий контакт'];
const STATUSES = ['Новая заявка', 'Связались', 'Подобрана группа', 'Пробное / первое занятие', 'Оплата', 'Ученик AKIZ', 'Не отвечает', 'Отказ', 'Отложил обучение'];

function setupCrm() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = book.getSheetByName(CRM_SHEET) || book.insertSheet(CRM_SHEET);
  if (sheet.getLastRow() && JSON.stringify(sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0]) !== JSON.stringify(HEADERS)) {
    throw new Error('Лист уже содержит другую структуру. Данные не изменены.');
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setBackground('#168c86').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 48);
  sheet.setColumnWidths(1, HEADERS.length, 150);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(24, 320);
  sheet.getRange(2, 3, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  sheet.getRange(2, 25, sheet.getMaxRows() - 1, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();
  return 'CRM готова: ' + book.getUrl();
}

function jsonReply(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return jsonReply({service: 'AKIZ CRM', version: 1}); }

function cleanCell(value, limit) {
  const text = String(value == null ? '' : value).trim().slice(0, limit || 500);
  // Treat visitor input as text, never as a spreadsheet formula.
  return /^[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
}

function validateLead(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid_payload');
  const textFields = { request_id: 80, name: 200, phone: 40, email: 254, telegram: 100, company: 200,
    form_kind: 20, source: 30, page_url: 2000, created_at: 40,
    test_level: 120, recommended_group: 120, result_id: 120,
    utm_source: 500, utm_medium: 500, utm_campaign: 500, utm_term: 500, utm_content: 500 };
  const booleans = ['personal_data_consent', 'user_agreement_consent', 'offer_consent', 'marketing_consent'];
  const allowed = new Set([...Object.keys(textFields), ...booleans, 'test_score']);
  if (Object.keys(data).some(key => !allowed.has(key))) throw new Error('unexpected_field');
  for (const key of Object.keys(textFields)) {
    if (Object.prototype.hasOwnProperty.call(data, key) && (typeof data[key] !== 'string' || data[key].length > textFields[key])) throw new Error('invalid_field');
  }
  if (booleans.some(key => Object.prototype.hasOwnProperty.call(data, key) && typeof data[key] !== 'boolean')) throw new Error('invalid_consent');
  if (Object.prototype.hasOwnProperty.call(data, 'test_score') && (!Number.isInteger(data.test_score) || data.test_score < 0 || data.test_score > 15)) throw new Error('invalid_score');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(data.request_id || '')) throw new Error('invalid_request_id');
  if (data.company) throw new Error('spam');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 200) throw new Error('invalid_name');
  if (typeof data.phone !== 'string' || !/^[+\d\s().-]{7,40}$/.test(data.phone) || data.phone.replace(/\D/g, '').length < 7) throw new Error('invalid_phone');
  if (data.email && (typeof data.email !== 'string' || data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) throw new Error('invalid_email');
  if (!['home', 'application'].includes(data.form_kind)) throw new Error('invalid_form');
  if (data.form_kind === 'application' && !data.email) throw new Error('email_required');
  if (['personal_data_consent', 'user_agreement_consent', 'offer_consent'].some(key => data[key] !== true)) throw new Error('consent_required');
  if (!['website_direct', 'website_test'].includes(data.source)) throw new Error('invalid_source');
  if (data.source === 'website_test') {
    if (!Number.isInteger(data.test_score) || data.test_score < 0 || data.test_score > 15) throw new Error('invalid_score');
    const band = data.test_score <= 4 ? 0 : data.test_score <= 8 ? 1 : data.test_score <= 12 ? 2 : 3;
    data.test_level = ['НАЧИНАЮЩИЙ', 'РОСТОК', 'НА ПОВЫШЕНИЕ', 'УВЕРЕННЫЙ'][band];
    data.recommended_group = ['첫걸음반', '새싹반', '레벨업반', '자신감반'][band];
    data.result_id = 'result_' + String(data.test_score).padStart(2, '0');
  } else {
    data.test_score = ''; data.test_level = ''; data.recommended_group = ''; data.result_id = '';
  }
  return data;
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    if (!event || !event.postData || typeof event.postData.contents !== 'string' || !event.postData.contents.length || event.postData.contents.length > 16000) return jsonReply({ok: false, error: 'invalid_payload'});
    const data = validateLead(JSON.parse(event.postData.contents));
    lock.waitLock(20000);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CRM_SHEET);
    if (!sheet || JSON.stringify(sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0]) !== JSON.stringify(HEADERS)) return jsonReply({ok: false, error: 'setup_required'});
    // A retry after a lost response returns the same receipt instead of another row.
    if (sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(data.request_id).matchEntireCell(true).findNext()) {
      return jsonReply({ok: true, request_id: data.request_id, duplicate: true});
    }
    const cache = CacheService.getScriptCache();
    const rateKey = 'phone_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data.phone.replace(/\D/g, '')));
    const recent = Number(cache.get(rateKey) || 0);
    if (recent >= 5) return jsonReply({ok: false, error: 'rate_limit'});
    const cell = key => cleanCell(data[key]);
    const yesNo = key => data[key] === true ? 'Да' : 'Нет';
    const row = [data.request_id, new Date(), STATUSES[0], cell('name'), cell('phone'), cell('email'), cell('telegram'), cell('source'), data.test_score, cell('test_level'), cell('result_id'), cell('recommended_group'), cell('utm_source'), cell('utm_medium'), cell('utm_campaign'), cell('utm_term'), cell('utm_content'), cleanCell(data.page_url, 2000), yesNo('personal_data_consent'), yesNo('user_agreement_consent'), yesNo('offer_consent'), yesNo('marketing_consent'), '', '', ''];
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    cache.put(rateKey, String(recent + 1), 600);
    return jsonReply({ok: true, request_id: data.request_id});
  } catch (error) {
    // Do not return or log personal details or internal spreadsheet errors.
    return jsonReply({ok: false, error: 'submission_failed'});
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
