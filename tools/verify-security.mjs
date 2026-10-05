// Offline regression checks. Never contact production CMS/CRM.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = { AKIZ_CMS_CONFIG: { supabaseUrl: 'https://cms-test.invalid', supabaseKey: 'sb_publishable_fixture_only' } };
const cms = await import('../assets/js/cms-client.js');
assert.equal(cms.configured(), true);
for (const value of ['javascript:alert(1)', 'https://other.invalid/x.png', '//other.invalid/x.png', 'teachers/../x.png', '/assets/images/../x.png', 'reviews/a.svg']) assert.equal(cms.imageUrl(value), '');
assert.equal(cms.imageUrl('teachers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'), 'https://cms-test.invalid/storage/v1/object/public/cms-images/teachers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png');
assert.equal(cms.imageUrl('/assets/images/teacher-hwain.webp'), '/assets/images/teacher-hwain.webp');
assert.ok(!cms.errorMessage(new Error('private server details')).includes('private server details'));
assert.equal(cms.errorMessage(new cms.CmsInputError('Safe validation message')), 'Safe validation message');
let calls = 0;
await assert.rejects(cms.cleanupMedia({ rpc() { calls++; } }, () => { throw new Error('session changed'); }));
assert.equal(calls, 0);
let active = true;
const fakeApi = {
  rpc: async () => ({ data: [{ path: 'reviews/a.png' }] }),
  storage: { from: () => ({ remove: async () => { active = false; return { data: [] }; } }) },
  from() { calls++; throw new Error('Must not continue after logout'); }
};
await assert.rejects(cms.cleanupMedia(fakeApi, () => { if (!active) throw new Error('session changed'); }));
assert.equal(calls, 0);
console.log('PASS CMS URL restrictions, safe errors, interrupted cleanup');

const thanksNode = { hidden: true };
const thanksContext = vm.createContext({ window: { location: { search: '' } }, sessionStorage: { getItem: () => '{invalid' }, URLSearchParams,
  document: { querySelector: selector => selector === '[data-test-thanks]' ? thanksNode : null } });
vm.runInContext(await fs.readFile('assets/js/thanks.js', 'utf8'), thanksContext);
assert.equal(thanksNode.hidden, true);
const storage = new Map([['akiz_utm_source', 'x'.repeat(700)], ['akiz_utm_unexpected', 'ignored'], ['akiz-cms-auth', 'not a lead field']]);
const formsContext = vm.createContext({ window: { AKIZ_CONFIG: {}, location: { href: 'https://akizkorean.ru/application/' } },
  document: { querySelectorAll: () => [] }, sessionStorage: { getItem: key => storage.get(key) },
  FormData: class { entries() { return [['name', 'Visitor'], ['phone', '+70000000000'], ['company', '']]; } } });
vm.runInContext(await fs.readFile('assets/js/forms.js', 'utf8'), formsContext);
formsContext.form = { elements: { email: {}, personal_data_consent: { checked: true } }, dataset: {} };
const payload = vm.runInContext('makePayload(form)', formsContext);
assert.equal(payload.utm_source.length, 500);
assert.equal(payload.company, '');
assert.equal(payload.utm_unexpected, undefined);
assert.equal(payload['akiz-cms-auth'], undefined);
console.log('PASS malformed thanks state, expected UTM only, honeypot retained');

// Build a small isolated project, including a stale private file in its old output.
const cache = path.resolve('.cache');
await fs.mkdir(cache, { recursive: true });
const fixture = await fs.mkdtemp(path.join(cache, 'security-build-'));
try {
  const routes = ['admin', 'agreement', 'application', 'offer', 'personal-data', 'privacy', 'rules', 'test', 'test/result', 'thanks'];
  async function put(file, contents = 'fixture') { const target = path.join(fixture, file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, contents); }
  for (const file of ['index.html', '_headers', ...routes.map(route => `${route}/index.html`)]) await put(file);
  for (const dir of ['images', 'fonts', 'css', 'js', 'vendor', 'documents']) await fs.mkdir(path.join(fixture, 'assets', dir), { recursive: true });
  for (const file of ['robots.txt', 'sitemap.xml', 'favicon.png', 'yandex_1fb1de68f8dacca4.html']) await put(`public/${file}`);
  await put('public/CNAME', 'akizkorean.ru');
  await put('assets/vendor/README.md');
  await put('assets/vendor/SUPABASE-LICENSE');
  await put('admin/private-notes.txt');
  await put('dist/private-old.sql');
  const build = () => spawnSync(process.execPath, [path.resolve('tools/build-pages.mjs')], { cwd: fixture, encoding: 'utf8', windowsHide: true });
  let run = build(); assert.equal(run.status, 0, run.stderr);
  await assert.rejects(fs.access(path.join(fixture, 'dist/.git')), 'Build must not create a Git repository');
  const gitFiles = new Map([
    ['HEAD', 'ref: refs/heads/main\n'],
    ['config', '[remote "origin"]\n\turl = https://example.invalid/deployment.git\n'],
    ['objects/ab/fixture', Buffer.from([0, 1, 2, 255])]
  ]);
  for (const [file, content] of gitFiles) await put(`dist/.git/${file}`, content);
  await put('dist/stale-directory/file.txt');
  await put('dist/.stale-hidden');
  for (let attempt = 0; attempt < 2; attempt++) {
    run = build(); assert.equal(run.status, 0, run.stderr);
    for (const [file, content] of gitFiles) assert.deepEqual(await fs.readFile(path.join(fixture, 'dist/.git', file)), Buffer.from(content));
  }
  await assert.rejects(fs.access(path.join(fixture, 'dist/stale-directory')));
  await assert.rejects(fs.access(path.join(fixture, 'dist/.stale-hidden')));
  console.log('PASS repeated builds preserve existing .git/config/objects unchanged and never create .git');
  await assert.rejects(fs.access(path.join(fixture, 'dist/private-old.sql')));
  await assert.rejects(fs.access(path.join(fixture, 'dist/admin/private-notes.txt')));
  await assert.rejects(fs.access(path.join(fixture, 'dist/assets/vendor/README.md')));
  await fs.access(path.join(fixture, 'dist/assets/vendor/SUPABASE-LICENSE'));
  for (const route of routes) await fs.access(path.join(fixture, 'dist', route, 'index.html'));
  for (const file of ['robots.txt', 'sitemap.xml', 'favicon.png', 'CNAME', 'yandex_1fb1de68f8dacca4.html']) assert.deepEqual(await fs.readFile(path.join(fixture, 'public', file)), await fs.readFile(path.join(fixture, 'dist', file)));
  await put('public/.env', 'audit sentinel, not a secret');
  run = build(); assert.notEqual(run.status, 0); await fs.unlink(path.join(fixture, 'public/.env'));
  await put('assets/js/debug.js'); run = build(); assert.notEqual(run.status, 0); await fs.unlink(path.join(fixture, 'assets/js/debug.js'));
  await put('public/admin/index.html'); run = build(); assert.notEqual(run.status, 0);
  console.log('PASS clean build removes stale files, preserves routes/public/license, rejects private files and public route overrides');
} finally {
  if (path.dirname(fixture) !== cache || (await fs.lstat(fixture)).isSymbolicLink() || await fs.realpath(fixture) !== fixture) throw new Error('Unsafe fixture cleanup');
  await fs.rm(fixture, { recursive: true, force: true });
}

for (const dir of ['assets/js', 'tools']) {
  for (const file of await fs.readdir(dir)) {
    if (!/\.(js|mjs)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(dir, file)], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, `${dir}/${file}: ${result.stderr}`);
  }
}
console.log('PASS JavaScript syntax for all application scripts and tools');
