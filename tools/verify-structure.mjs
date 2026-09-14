// Local verification only. Fixtures never become production website content.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {}, sessionStorage: { getItem: () => null } });
for (const file of ['test-config.js', 'test-engine.js']) vm.runInContext(fs.readFileSync(`assets/js/${file}`, 'utf8'), context);
const engine = context.window.AKIZ_TEST_ENGINE;
const config = context.window.AKIZ_TEST_CONFIG;
const questions = JSON.parse(JSON.stringify(config.questions));
assert.equal(engine.validQuestions(config.questions), true);
assert.equal(engine.validQuestions(questions), true);
for (let n = 0; n <= 15; n++) {
  const answers = Object.fromEntries(questions.map((q, i) => [q.id, i < n ? 'a' : 'b']));
  assert.equal(engine.score(questions, answers), n);
  const result = engine.result(n, config);
  assert.equal(result.angle, n * 24);
  assert.equal(result.title, n <= 4 ? 'НАЧИНАЮЩИЙ' : n <= 8 ? 'РОСТОК' : n <= 12 ? 'НА ПОВЫШЕНИЕ' : 'УВЕРЕННЫЙ');
}
for (const value of [-1, 16, 0.5, null, '5']) assert.equal(engine.result(value, config), null);
assert.throws(() => engine.score(questions, {}));
console.log('PASS engine: all 16 scores, ranges, arcs, missing/invalid data');

const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  const entry = pending.get(message.id);
  if (entry) { pending.delete(message.id); clearTimeout(entry.timer); message.error ? entry.reject(message.error) : entry.resolve(message.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const call = ++id;
  const timer = setTimeout(() => { pending.delete(call); reject(new Error(`Timeout: ${method}`)); }, 15000);
  pending.set(call, { resolve, reject, timer }); socket.send(JSON.stringify({ id: call, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async expression => {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate(expression).catch(() => false)) return;
    await delay(100);
  }
  throw new Error(`Not ready: ${expression}`);
};
const navigate = async path => {
  await send('Page.navigate', { url: `http://127.0.0.1:4173${path}` });
  await until(`document.readyState === 'complete' && location.pathname.split('/').filter(Boolean).join('/') === ${JSON.stringify(path.split('?')[0].split('/').filter(Boolean).join('/'))}`);
  await evaluate('document.fonts.ready');
};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
try {
  await navigate('/');
  await evaluate('sessionStorage.clear()');
  for (const path of ['/', '/test', '/test/result', '/application', '/privacy/', '/offer/']) {
    await navigate(path);
    if (!path.includes('privacy') && !path.includes('offer')) {
      assert.equal(await evaluate('document.querySelectorAll("footer nav a").length'), 3);
      assert.equal(await evaluate('document.querySelector("header nav a").getAttribute("href")'), '/#learning');
    }
  }
  await navigate('/test');
  assert.equal(await evaluate('document.querySelectorAll("[data-answers] input").length'), 4);
  console.log('PASS routes, shared navigation/footer, supplied questions');

  // Only this browser receives a fixture config via a property setter.
  const injected = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window, 'AKIZ_TEST_CONFIG', { configurable: true, set(value) {
      value.questions = ${JSON.stringify(questions)};
      value.scoreCards.forEach(card => card.id = 'fixture_result_' + card.score);
      value.results.forEach((level, i) => level.recommendedGroup = 'fixture_group_' + i);
      Object.defineProperty(window, 'AKIZ_TEST_CONFIG', { value, writable: true, configurable: true });
    }});` });
  await navigate('/test?utm_source=fixture&utm_medium=test&utm_campaign=qa&utm_term=word&utm_content=button');
  const answer = async value => evaluate(`document.querySelector('input[value="${value}"]').click()`);
  const next = async () => evaluate('document.querySelector("[data-next]").click()');
  await answer('b'); await next();
  await evaluate('document.querySelector("[data-back]").click()');
  assert.equal(await evaluate('document.querySelector("input:checked").value'), 'b');
  await navigate('/test');
  assert.equal(await evaluate('document.querySelector("input:checked").value'), 'b');
  for (let i = 0; i < 15; i++) {
    assert.equal(await evaluate('document.querySelector("[data-progress-label]").textContent'), `Вопрос ${i + 1} из 15`);
    assert.equal(await evaluate('document.querySelector("[data-next]").firstChild.textContent.trim()'), i === 14 ? 'Узнать результат' : 'Следующий вопрос');
    await answer(i < 9 ? 'a' : 'b'); await next();
  }
  await until('location.pathname.startsWith("/test/result") && document.querySelector("[data-result-score]")?.textContent === "9"');
  assert.equal(await evaluate('document.querySelectorAll("form").length'), 0);
  assert.equal(await evaluate('document.querySelector("[data-result-dial]").style.getPropertyValue("--score-angle")'), '216deg');
  await evaluate('document.querySelector("[data-application-source]").click()');
  await until('location.pathname.startsWith("/application") && document.querySelector("form")?.dataset.source === "website_test"');
  assert.deepEqual(await evaluate(`Object.fromEntries(['test_score','test_level','result_id','recommended_group'].map(k=>[k,document.querySelector('form').elements[k].value]))`),
    { test_score: '9', test_level: 'НА ПОВЫШЕНИЕ', result_id: 'fixture_result_9', recommended_group: 'fixture_group_2' });
  console.log('PASS question/back/reload/progress/result/application flow using isolated fixtures');

  const fill = `const f = document.querySelector('form'); f.elements.name.value='QA'; f.elements.phone.value='+70000000000'; f.elements.email.value='qa@example.invalid'; ['personal_data_consent','user_agreement_consent','offer_consent'].forEach(k=>f.elements[k].checked=true);`;
  await evaluate(`{ ${fill} }`);
  for (const name of ['name', 'phone', 'email', 'personal_data_consent', 'user_agreement_consent', 'offer_consent']) {
    await evaluate(`{ ${fill} const field=f.elements[${JSON.stringify(name)}]; if(field.type==='checkbox')field.checked=false; else field.value=''; f.requestSubmit(); }`);
    assert.equal(await evaluate(`document.querySelector('form').elements[${JSON.stringify(name)}].getAttribute('aria-invalid')`), 'true');
  }
  await evaluate(`{ ${fill} f.requestSubmit(); }`);
  assert.equal(await evaluate('document.querySelector("dialog").open'), false);
  assert.equal(await evaluate('document.querySelector("[name=name]").value'), 'QA');
  await evaluate(`window.AKIZ_CONFIG.crmEndpoint='/test-fixture-only'; window.AKIZ_CONFIG.confirmCrmSuccess=body=>body.crmConfirmed===true;
    window.fetch=async (url,options)=>{window.testPayload=JSON.parse(options.body);return {ok:true,json:async()=>({crmConfirmed:false})}};`);
  await evaluate('document.querySelector("form").requestSubmit()');
  await until('!document.querySelector("[type=submit]").disabled');
  assert.equal(await evaluate('document.querySelector("dialog").open'), false);
  assert.equal(await evaluate('window.testPayload.utm_content'), 'button');
  assert.equal(await evaluate('window.testPayload.test_score'), 9);
  await evaluate(`window.fetch=async()=>({ok:false,status:500}); document.querySelector('form').requestSubmit();`);
  await until('!document.querySelector("[type=submit]").disabled');
  assert.equal(await evaluate('document.querySelector("dialog").open'), false);
  await evaluate(`window.fetch=async()=>{throw Error('network')}; document.querySelector('form').requestSubmit();`);
  await until('!document.querySelector("[type=submit]").disabled');
  assert.equal(await evaluate('document.querySelector("[name=name]").value'), 'QA');
  await evaluate(`window.fetch=async()=>({ok:true,json:async()=>({crmConfirmed:true})}); document.querySelector('form').requestSubmit();`);
  await until('document.querySelector("dialog").open');
  assert.equal(await evaluate('document.querySelector("dialog h2").textContent'), 'Заявка отправлена!');
  assert.equal(await evaluate('document.querySelector("dialog a").getAttribute("href")'), '/');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.querySelector("dialog").getBoundingClientRect().right <= innerWidth'), true);
  fs.mkdirSync('.cache/structure', { recursive: true });
  const successShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('.cache/structure/success-390.png', Buffer.from(successShot.data, 'base64'));
  for (const width of [1440, 768, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 });
    await navigate('/test');
    assert.equal(await evaluate('document.querySelectorAll("[data-answers] input").length'), 4);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await evaluate('document.querySelector("[data-answers] input").click(); document.querySelector("[data-next]").scrollIntoView({block:"center",behavior:"instant"})');
    assert.equal(await evaluate(`(() => { const b=document.querySelector('[data-next]'); const r=b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })()`), true, `Next button hit-test at ${width}`);
    await evaluate('scrollTo({top:0,behavior:"instant"})');
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(`.cache/structure/test-fixture-${width}.png`, Buffer.from(shot.data, 'base64'));
  }
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier });
  console.log('PASS required/optional fields, UTM, CRM failures, confirmed success modal (mock only)');

  await navigate('/');
  await evaluate(`sessionStorage.setItem('akiz_test_state', JSON.stringify({version:2,complete:true,test_score:9,test_level:'НА ПОВЫШЕНИЕ',result_id:'fixture_result_9',recommended_group:'fixture_group_2'})); sessionStorage.setItem('akiz_application_source','website_test');`);
  await evaluate('document.querySelector("header [data-application-source]").click()');
  await until('location.pathname.startsWith("/application") && document.querySelector("form")?.dataset.source === "website_direct"');
  assert.equal(await evaluate('document.querySelectorAll("[name=test_score]").length'), 0);
  console.log('PASS direct application does not inherit stale test metadata');

  fs.mkdirSync('.cache/structure', { recursive: true });
  for (const width of [1440, 768, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 });
    for (const path of ['/', '/application', '/test/result']) {
      if (path === '/test/result') await evaluate(`sessionStorage.setItem('akiz_test_state', JSON.stringify({version:2,complete:true,test_score:9}))`);
      await navigate(path);
      await evaluate(`Promise.all([...document.images].map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); }))`);
      assert.deepEqual(await evaluate(`[...document.images].filter(img => !img.naturalWidth).map(img => img.src)`), [], `${path}: broken images`);
      await delay(150);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${path} overflow at ${width}`);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(`.cache/structure/${path.replaceAll('/', '') || 'home'}-${width}.png`, Buffer.from(shot.data, 'base64'));
      if (path === '/') {
        const heroShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(`.cache/structure/hero-${width}.png`, Buffer.from(heroShot.data, 'base64'));
      }
      if (width === 390) {
        await evaluate('document.querySelector("[data-menu-toggle]").click()');
        assert.equal(await evaluate('document.querySelector("[data-menu-toggle]").getAttribute("aria-expanded")'), 'true');
      }
    }
  }
  for (let n = 0; n <= 15; n++) {
    await evaluate(`sessionStorage.setItem('akiz_test_state', JSON.stringify({version:2,complete:true,test_score:${n}}))`);
    await navigate('/test/result');
    assert.equal(await evaluate('document.querySelector("[data-result-score]").textContent'), String(n));
    assert.equal(await evaluate('document.querySelector("[data-result-dial]").style.getPropertyValue("--score-angle")'), `${n * 24}deg`);
  }
  await evaluate('sessionStorage.clear()');
  console.log('PASS all 16 rendered results including 0/15 and 15/15; modal fits mobile');
  assert.deepEqual(errors, []);
  console.log('PASS desktop/tablet/mobile overflow and menu; no browser exceptions. Screenshots saved.');
} finally { socket.close(); }
