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
for (const invalid of [
  null, [], {...base, request_id: ['test-request-00000001']},
  {...base, company: 'bot'}, {...base, company: {}},
  {...base, telegram: {}}, {...base, telegram: 'x'.repeat(101)},
  {...base, utm_source: 'x'.repeat(501)}, {...base, page_url: 'x'.repeat(2001)},
  {...base, marketing_consent: 'true'}, {...base, unexpected: 'not allowed'},
  {...base, test_score: '0'}, {...base, name: 'x'.repeat(201)},
  {...base, phone: 'abcdefg'}, {...base, email: 'x'.repeat(255)},
  JSON.parse(JSON.stringify(base).replace('{', '{"__proto__":{},'))
]) assert.equal(post(invalid).ok, false);
for (const contents of ['{', '', ' '.repeat(16001), null, 42]) {
  assert.equal(context.doPost({postData: {contents}}).ok, false);
}
assert.equal(context.doPost(null).ok, false);
assert.equal(rows.length, 0, 'Malformed input must never reach appendRow');
for (const input of ['=1+1', '+123', '-123', '@SUM(A1)', '\t=1', '\r\n=1', '  =1']) {
  assert.equal(context.cleanCell(input)[0], "'");
}
assert.equal(context.cleanCell('Normal text'), 'Normal text');
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
console.log('PASS mocked Sheets backend: strict field/type/length allowlist, honeypot, malformed/oversized JSON, consent, all formula prefixes, zero and level boundaries, home form, receipt, retry deduplication, rate limit. No Google writes performed.');
