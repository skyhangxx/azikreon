import fs from 'node:fs';
import assert from 'node:assert/strict';
const targets=await(await fetch('http://127.0.0.1:9223/json')).json();
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id)}});const send=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))});const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
for(const width of [320,390,640,1440]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<=640});
 for(const route of ['/','/test/','/application/','/test/result/']){
  await send('Page.navigate',{url:'http://127.0.0.1:4173'+route});await new Promise(r=>setTimeout(r,250));
  if(route==='/test/result/') {await evaluate(`sessionStorage.setItem('akiz_test_state',JSON.stringify({version:2,complete:true,test_score:3}))`);await send('Page.reload');await new Promise(r=>setTimeout(r,250));}
  const metrics=await evaluate(`({w:innerWidth,s:document.documentElement.scrollWidth,broken:[...document.images].filter(i=>i.src&&i.complete&&!i.naturalWidth).map(i=>i.src)})`);
  console.log(width,route,JSON.stringify(metrics));if(width<=640) assert.equal(metrics.s,width,route+' overflow');assert.equal(metrics.broken.length,0);
  if(width===390){const shot=await send('Page.captureScreenshot',{captureBeyondViewport:false});fs.writeFileSync('mobile-'+(route.split('/').filter(Boolean).join('-')||'home')+'.png',Buffer.from(shot.data,'base64'));}
  if(width<=640){assert(await evaluate(`(()=>{let b=document.querySelector('[data-menu-toggle]');b.click();let ok=b.getAttribute('aria-expanded')==='true'&&document.querySelector('[data-menu]').classList.contains('is-open');b.click();return ok})()`));}
 }
}
ws.close();
