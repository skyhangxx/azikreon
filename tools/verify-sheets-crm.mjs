import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const rows = [];
let flushes = 0;
const cache = new Map();
const context = vm.createContext({
  ContentService: {MimeType: {JSON: 'json'}, createTextOutput: text => ({setMimeType: () => JSON.parse(text)})},
  LockService: {getScriptLock: () => ({waitLock() {}, hasLock: () => true, releaseLock() {}})},
  SpreadsheetApp: {
    openById: () => ({getSheetByName: () => ({
      getLastRow: () => rows.length + 1,
      getRange: (row) => ({
        getValues: () => [vm.runInContext('HEADERS', context)],
        createTextFinder: id => ({matchEntireCell: () => ({findNext: () => rows.find(r => r[0] === id)})})
      }),
      appendRow: row => rows.push(row)
    })}),
    flush: () => { flushes++; }
  },
  CacheService: {getScriptCache: () => ({get: key => cache.get(key), put: (key, value) => cache.set(key, value)})},
  Utilities: {DigestAlgorithm: {SHA_256: 'sha256'}, computeDigest: (_, value) => value, base64EncodeWebSafe: value => value}
});
vm.runInContext(fs.readFileSync('integrations/google-sheets/Code.gs', 'utf8'), context);
const base = {request_id: 'test-request-00000001', name: 'Test', phone: '+7 999 000 00 00', email: 'test@example.com', form_kind: 'application', source: 'website_test', test_score: 0, personal_data_consent: true, user_agreement_consent: true, offer_consent: true};
const post = data => context.doPost({postData: {contents: JSON.stringify(data)}});
assert.equal(post({...base, offer_consent: false}).ok, false);
assert.equal(post({...base, test_score: 16}).ok, false);
assert.equal(post({...base, email: ''}).ok, false);
assert.equal(rows.length, 0);
assert.equal(post(base).ok, true);
assert.equal(rows[0][8], 0);
assert.equal(rows[0][11], '첫걸음반');
assert.equal(flushes, 1);
assert.equal(post(base).duplicate, true);
assert.equal(rows.length, 1);
assert.equal(context.cleanCell('=IMPORTXML("https://example.com")')[0], "'");
assert.equal(post({...base, request_id: 'test-request-00000002', form_kind: 'home', source: 'website_direct', email: ''}).ok, true);
assert.equal(rows[1][8], '');
for (const score of [4, 5, 8, 9, 12, 13, 15]) {
  const data = context.validateLead({...base, test_score: score});
  assert.equal(data.recommended_group, score <= 4 ? '첫걸음반' : score <= 8 ? '새싹반' : score <= 12 ? '레벨업반' : '자신감반');
}
for (let i = 3; i <= 5; i++) assert.equal(post({...base, request_id: `test-request-0000000${i}`}).ok, true);
assert.equal(post({...base, request_id: 'test-request-00000006'}).error, 'rate_limit');
console.log('PASS mocked Sheets backend: validation, zero and level boundaries, consent, home form, receipt, retry deduplication, formula escaping, rate limit. No Google writes performed.');
