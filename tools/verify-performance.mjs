// Check the resources actually selected by the browser at mobile/desktop widths.
import assert from 'node:assert/strict';
const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const task = pending.get(message.id);
  if (task) {
    pending.delete(message.id);
    message.error ? task.reject(message.error) : task.resolve(message.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
try {
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const width of [320, 390, 640, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 2, mobile: width <= 640 });
    await send('Page.navigate', { url: `http://127.0.0.1:4173/?performance=${width}` });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      ready = await evaluate(`location.search === '?performance=${width}' && document.readyState === 'complete'`);
      if (ready) break;
    }
    assert(ready, 'Page load timed out');
    const result = await evaluate(`(async () => {
      await document.fonts.ready;
      const img = document.querySelector('.hero__teacher');
      await img.decode();
      return {
        image: img.currentSrc,
        overflow: document.documentElement.scrollWidth > innerWidth,
        resources: performance.getEntriesByType('resource').map(entry => entry.name),
        background: ['.learning__sakura-branch', '.application__sakura-branch'].map(selector => getComputedStyle(document.querySelector(selector)).backgroundImage),
        testLink: document.querySelector('.learning-cta .button').getAttribute('href')
      };
    })()`);
    const mobile = width <= 640;
    assert.equal(result.image.endsWith(mobile ? 'hero-teacher-cutout-mobile.webp' : 'hero-teacher-cutout.webp'), true);
    assert.equal(result.overflow, false);
    assert.equal(result.testLink, '/test');
    assert(result.background.every(url => url.includes('-mobile.webp') === mobile));
    if (mobile) {
      for (const name of ['hero-teacher-cutout', 'learning-sakura-branch-v3', 'application-sakura-branch-user']) {
        assert(!result.resources.some(url => url.endsWith(`/${name}.webp`)), `Desktop image downloaded on mobile: ${name}`);
      }
    }
    assert.equal(result.resources.filter(url => url.endsWith('/montserrat-cyrillic.woff2')).length, 1);
    console.log(`PASS ${width}px: correct images, no duplicate font or desktop image downloads, no overflow`);
  }
} finally { ws.close(); }
