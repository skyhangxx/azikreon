// Current routes/forms/quiz smoke checks. All CRM requests are intercepted locally.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(m.error) : p.resolve(m.result); } });
const send = (method, params = {}) => new Promise((resolve,reject) => { const call=++id; const timer=setTimeout(()=>reject(new Error(method)),20000); pending.set(call,{resolve,reject,timer}); ws.send(JSON.stringify({id:call,method,params})); });
const evaluate = async expression => { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value; };
const until = async expression => { for(let i=0;i<150;i++){if(await evaluate(expression).catch(()=>false))return;await new Promise(r=>setTimeout(r,50));}throw Error(expression); };
const navigate = async path => { await send('Page.navigate',{url:'http://127.0.0.1:4173'+path});await until(`location.pathname === '${path}' && document.readyState==='complete'`); };
await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
const injection=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input, options={})=>{
    const url=String(typeof input==='string'?input:input.url);
    if(!url.includes('script.google.com')&&!url.includes('script.googleusercontent.com')) return originalFetch(input,options);
    const data=JSON.parse(options.body);sessionStorage.setItem('qa_last_payload',JSON.stringify(data));
    const mode=sessionStorage.getItem('qa_crm_mode');
    if(mode==='network') throw new TypeError('Fixture network error');
    return new Response(JSON.stringify({ok:mode==='success',request_id:data.request_id}),{status:200,headers:{'Content-Type':'application/json'}});
  };
`});
try {
  await navigate('/'); await evaluate(`sessionStorage.clear()`);
  for(const route of ['/','/application/','/test/','/test/result/','/thanks/','/privacy/','/offer/','/agreement/','/personal-data/','/rules/','/admin/']) {
    await navigate(route); assert.equal(await evaluate(`document.querySelector('h1')!==null`),true,route);
  }
  console.log('PASS all 11 routes and existing headings');
  for (const route of ['/','/application/']) {
    await navigate(route);
    await evaluate(`document.querySelector('[data-lead-form]').requestSubmit()`);
    assert.equal(await evaluate(`document.querySelector('[name=name]').getAttribute('aria-invalid')`),'true');
    await evaluate(`{const f=document.querySelector('[data-lead-form]');f.elements.name.value='QA fixture';f.elements.phone.value='+70000000000';if(f.elements.email)f.elements.email.value='qa@example.invalid';['personal_data_consent','user_agreement_consent','offer_consent'].forEach(k=>f.elements[k].checked=true);sessionStorage.setItem('qa_crm_mode','network');f.requestSubmit();}`);
    await until(`!document.querySelector('[data-lead-form] [type=submit]').disabled`);
    assert.equal(await evaluate(`document.querySelector('[name=name]').value`),'QA fixture');
    const first=await evaluate(`JSON.parse(sessionStorage.getItem('qa_last_payload')).request_id`);
    await evaluate(`sessionStorage.setItem('qa_crm_mode','unconfirmed');document.querySelector('[data-lead-form]').requestSubmit()`);
    await until(`!document.querySelector('[data-lead-form] [type=submit]').disabled`);
    assert.equal(await evaluate(`location.pathname`),route);
    assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('qa_last_payload')).request_id`),first);
    await evaluate(`sessionStorage.setItem('qa_crm_mode','success');document.querySelector('[data-lead-form]').requestSubmit()`);
    await until(`location.pathname==='/thanks/index.html'`);
    assert.equal(await evaluate(`location.search`),'?form=lead');
  }
  console.log('PASS both CRM forms: validation, network failure, unconfirmed response, preserved input, retry ID, confirmed thanks redirect (no Google writes)');
  await navigate('/test/');
  for(let i=0;i<15;i++){
    await evaluate(`document.querySelector('[data-answers] input').click();document.querySelector('[data-next]').click()`);
    if(i<14)await until(`window.AKIZ_TEST_ENGINE.readState()?.index === ${i+1} || document.querySelector('[data-question-number]')?.textContent === '${i+2}'`);
  }
  await until(`location.pathname.startsWith('/test/result')`);
  await until(`document.querySelector('[data-result-score]')?.textContent === '15'`);
  assert.equal(await evaluate(`document.querySelector('[data-result-score]').textContent`),'15');
  console.log('PASS full quiz to result');
  for(const width of [1440,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});
    await navigate('/admin/');await evaluate('document.fonts.ready');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    fs.mkdirSync('.cache/cms',{recursive:true});
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('.cache/cms/admin-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
  await navigate('/');
  await evaluate(`document.querySelector('[data-menu-toggle]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded')`),'true');
  await evaluate(`document.querySelector('[data-menu] a').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded')`),'false');
  console.log('PASS admin desktop/tablet/mobile and existing mobile menu');
} finally {
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
  await evaluate('sessionStorage.clear()').catch(()=>{});
  await navigate('/admin/');ws.close();
}
