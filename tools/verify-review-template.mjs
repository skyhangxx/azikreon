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

const injection = await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync('tools/cms-fixture.js','utf8')+'\nwindow.__cmsFixture.fail=true;' });
try {
 await navigate('/'); await until(`document.querySelector('.teachers__grid').dataset.cmsLoad==='unavailable'`);
 for(const width of [1920,1536,1440,768,390,320]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<641});
  for(const count of [1,2,3,4,5,8]) {
   await evaluate(`(async()=>{const {renderContent}=await import('/assets/js/cms-content.js?v=8');renderContent('reviews',Array.from({length:${count}},(_,i)=>({id:String(i),name:'\u0410\u043b\u0435\u043a\u0441\u0430\u043d\u0434\u0440 '.repeat(4),location:'\u0421\u0430\u043d\u043a\u0442-\u041f\u0435\u0442\u0435\u0440\u0431\u0443\u0440\u0433 '.repeat(4),description:'\u041e\u0442\u0437\u044b\u0432 '.repeat(i?200:20),image_path:i%2?'':'/assets/images/teacher-hwain.webp',stars:i%5+1})))})()`); await delay(200);
   const data=await evaluate(`(()=>{const cards=[...document.querySelectorAll('.cms-review')];return cards.map(c=>{const a=c.querySelector('.review-template__avatar'),r=c.querySelector('.review-template__rating'),s=getComputedStyle(c);return {overflow:c.scrollWidth>c.clientWidth,stars:r.textContent,avatar:a.clientWidth,radius:s.borderRadius,flower:getComputedStyle(c,'::after').backgroundImage,quote:!!c.querySelector('.review-template__body b'),closing:getComputedStyle(c.querySelector('.review-template__body'),'::after').content,visible:getComputedStyle(c).display!=='none'}})})()`);
   assert.equal(data.length,count);
   assert.equal(await evaluate(`!document.querySelector('.cms-reviews-carousel .reviews-carousel__arrow--next').hidden`),width>640&&count>3);
   if(width>=1100) {
    const positions=await evaluate(`(()=>{const t=document.querySelector('.cms-reviews'),r=t.getBoundingClientRect();return [...t.children].slice(0,3).map(c=>{const x=c.getBoundingClientRect();return {left:x.left,right:x.right,fits:x.left>=r.left-1&&x.right<=r.right+1}})})()`);
    assert.ok(positions[0].fits); if(width>=1536 && count<=3 || width>=1920) assert.ok(positions.every(p=>p.fits)); assert.ok(positions.every(p=>Math.abs(p.right-p.left-480)<1));
    assert.ok(positions.every((p,i)=>!i||p.left>positions[i-1].right));
   }
   assert.equal(await evaluate(`new Set([...document.querySelectorAll('.cms-reviews .cms-review')].map(c=>c.offsetHeight)).size`),1,'equal card heights');
   if(count>1){
    assert.equal(await evaluate(`document.querySelectorAll('.cms-review-more')[1].hidden`),false);
    await evaluate(`document.querySelectorAll('.cms-review-more')[1].click()`);
    assert.equal(await evaluate(`document.querySelector('dialog').open`),true);
    assert.equal(await evaluate(`document.querySelector('dialog .cms-review-copy').textContent === document.querySelectorAll('.cms-reviews .cms-review-copy')[1].textContent`),true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('dialog .cms-review-copy')).webkitLineClamp`),'none');
    assert.ok(await evaluate(`(()=>{const s=document.querySelector('.cms-review-dialog-scroll');s.scrollTop=100000;return s.scrollHeight<=s.clientHeight || s.scrollTop>0})()`));
    await click('.cms-review-close');await delay(50);
    assert.equal(await evaluate(`!!document.querySelector('dialog')`),false);
    await evaluate(`document.querySelectorAll('.cms-review-more')[1].click()`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(50);
    assert.equal(await evaluate(`!!document.querySelector('dialog')`),false);
   }
   data.forEach((d,i)=>{assert.equal(d.overflow,false);assert.equal(d.stars,'\u2605'.repeat(i%5+1)+'\u2606'.repeat(4-i%5));assert.equal(d.avatar,72);assert.equal(d.radius,'22px');assert.ok(d.flower.includes('review-flower.webp'));assert.ok(d.quote&&d.closing!=='none'&&d.visible)});
   if(width>640 && count>3) {
    for(let i=1;i<count;i++) { await click('.cms-reviews-carousel .reviews-carousel__arrow--next'); await delay(60); }
    assert.equal(await evaluate(`document.querySelector('.cms-reviews-carousel .reviews-carousel__arrow--next').disabled`),true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.cms-review:last-child')).visibility`),'visible');
    for(let i=1;i<count;i++) { await click('.cms-reviews-carousel .reviews-carousel__arrow--prev'); await delay(60); }
    assert.equal(await evaluate(`document.querySelector('.cms-reviews-carousel .reviews-carousel__arrow--prev').disabled`),true);
   }
   if(width<=640) assert.equal(await evaluate('document.documentElement.scrollWidth'),width);
  }
  await evaluate(`document.querySelector('.cms-review').scrollIntoView({block:'center',behavior:'instant'})`);await delay(100);
  fs.mkdirSync('.cache/reviews',{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('.cache/reviews/'+width+'.png',Buffer.from(shot.data,'base64'));
  console.log('PASS '+width+'px: 1/5/8 reviews, ratings 1-5, long content, missing avatar, original decorations');
 }
} finally {await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});await send('Page.navigate',{url:'http://127.0.0.1:4173/'});socket.close();}
