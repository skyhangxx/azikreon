// Local browser integration tests with an explicitly simulated Supabase transport.
// These are NOT a substitute for testing the real project's Auth / RLS / Storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0; const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.method === 'Fetch.requestPaused') {
    send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: fs.readFileSync('assets/images/footer-icon-business.png').toString('base64') });
  }
  const entry = pending.get(m.id); if (entry) { pending.delete(m.id); clearTimeout(entry.timer); m.error ? entry.reject(m.error) : entry.resolve(m.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const call = ++id; const timer = setTimeout(() => reject(new Error(method + ' timeout')), 20000); pending.set(call, { resolve, reject, timer }); socket.send(JSON.stringify({ id: call, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const delay = ms => new Promise(r => setTimeout(r, ms));
const until = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression).catch(() => false)) return; await delay(50); } throw new Error('Not ready: ' + expression); };
const navigate = async path => { await send('Page.navigate', { url: 'http://127.0.0.1:4173' + path }); await until(`location.pathname === '${path}' && document.readyState === 'complete'`); };
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fill = values => evaluate(`Object.entries(${JSON.stringify(values)}).forEach(([key,value])=>{const f=document.querySelector('#editor-form').elements[key];if(f.type==='checkbox')f.checked=value;else f.value=value;f.dispatchEvent(new Event('input',{bubbles:true}))})`);
await send('Page.enable'); await send('Runtime.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const injection = await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync('tools/cms-fixture.js', 'utf8') + '\nwindow.__cmsFixture.fail = true;' });
try {
  await navigate('/');
  await until(`document.querySelector('.teachers__grid').dataset.cmsLoad === 'unavailable'`);
  for (const width of [1920,1440,1024,768,390,320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 641 });
    await evaluate('document.fonts.ready'); await delay(200);
    const baseline = await evaluate('document.documentElement.scrollWidth');
    for (const count of [1,2,3,4,5,6,8,10,12]) {
      await evaluate(`(async()=>{const {renderContent}=await import('/assets/js/cms-content.js?v=11');renderContent('teachers',Array.from({length:${count}},(_,i)=>({id:String(i),name:i%2?'Тестовый преподаватель':'김민수 선생님',description:'Описание преподавателя. '.repeat(25),image_path:i%2?'/assets/images/teacher-hwain.webp':'/assets/images/footer-background.webp'})));await document.fonts.ready})()`);
      await delay(100);
      const data = await evaluate(`(()=>{const t=document.querySelector('.cms-teachers'),cs=[...t.children];return {count:cs.length,tops:cs.map(c=>c.offsetTop),overflow:document.documentElement.scrollWidth,cardOverflow:cs.some(c=>c.scrollWidth>c.clientWidth+1),names:cs.map(c=>{const h=c.querySelector('h3');return [h.textContent,h.clientWidth,h.scrollWidth,getComputedStyle(h).fontSize,h.style.fontSize]}),nameOverflow:cs.some(c=>c.querySelector('h3').scrollWidth>c.querySelector('h3').clientWidth+1),arrows:!document.querySelector('.teachers-carousel-controls').hidden,needed:t.scrollWidth>t.clientWidth+2,left:document.querySelector('.teachers-carousel-arrow').disabled,order:cs.map(c=>c.dataset.contentId)}})()`);
      assert.equal(data.count,count); assert.equal(new Set(data.tops).size,1);
      assert.ok(data.overflow <= Math.max(width,baseline)); assert.equal(data.cardOverflow,false,JSON.stringify({width,count,...data})); assert.equal(data.nameOverflow,false,JSON.stringify({width,count,...data}));
      assert.equal(data.arrows,width>640 && data.needed); assert.equal(data.left,true); assert.deepEqual(data.order,Array.from({length:count},(_,i)=>String(i)));
      const layout = await evaluate(`(()=>{const t=document.querySelector('.cms-teachers'),r=t.getBoundingClientRect(),h=document.querySelector('.teachers-swipe-hint'),buttons=[...document.querySelectorAll('.teachers-carousel-arrow')].map(b=>b.getBoundingClientRect());return {visible:[...t.children].filter(c=>{const a=c.getBoundingClientRect();return a.left>=r.left-1&&a.right<=r.right+1}).length,hint:!h.hidden,side:buttons[0].right<=r.left && buttons[1].left>=r.right,snap:getComputedStyle(t).scrollSnapType}})()`);
      if(width>=1100) assert.ok(layout.visible>=1);
      if(width<=640) {assert.equal(layout.visible,1);assert.equal(layout.hint,count>1);}
      if(data.arrows) assert.equal(layout.side,true,'arrows outside cards');
      assert.equal(layout.snap,'x mandatory');
      if(data.needed){
        await click('.teachers-carousel-arrow:last-child');await delay(100);
        assert.ok(await evaluate(`document.querySelector('.cms-teachers').scrollLeft>0`));
        await evaluate(`document.querySelector('.cms-teachers').scrollLeft=100000`);await delay(100);
        assert.equal(await evaluate(`document.querySelector('.teachers-carousel-arrow:last-child').disabled`),true);
        await click('.teachers-carousel-arrow:first-child');await delay(100);
        assert.equal(await evaluate(`document.querySelector('.teachers-carousel-arrow:last-child').disabled`),false);
      }
    }
    await evaluate(`document.querySelector('.cms-teachers').scrollLeft=0;document.querySelector('.cms-teachers').scrollIntoView({block:'start',behavior:'instant'})`);await delay(100);
    if(width===390){
      await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:310,y:300}]});
      for(let x=290;x>=30;x-=20){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:300}]});await delay(20);}
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(700);
      assert.ok(await evaluate(`document.querySelector('.cms-teachers').scrollLeft>0`),'touch swipe');
      assert.equal(await evaluate(`document.querySelector('.teachers-swipe-hint').classList.contains('is-dismissed')`),true);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.teachers-swipe-hint')).animationName`),'none');
      assert.ok(await evaluate(`(()=>{const t=document.querySelector('.cms-teachers');return [...t.children].some(c=>Math.abs(c.offsetLeft-t.firstElementChild.offsetLeft-t.scrollLeft)<2)})()`),'swipe snaps to card');
    }
    fs.mkdirSync('.cache/teachers',{recursive:true});
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`.cache/teachers/${width}.png`,Buffer.from(shot.data,'base64'));
    console.log(`PASS ${width}px: 1/2/3/4/5/6/8/10/12 cards, single row, long names/text, mixed images, navigation, rerender; page width <= baseline ${baseline}`);
  }
  console.log('PASS mobile touch swipe; all data stayed in browser fixtures, no Supabase writes');
} finally {
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/'});socket.close();
}
