// Run an existing CDP check in a fresh tab, with production services disabled.
// The check may install its own local fetch fixtures after this initial guard.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const name = process.argv[2];
if (!/^(verify-[a-z-]+|check-mobile)\.mjs$/.test(name || '')) throw new Error('Expected a local check script');
await fs.access(path.join('tools', name));
const endpoint = 'http://127.0.0.1:9223';
const existing = await (await fetch(`${endpoint}/json`)).json();
const tab = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const calls = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const call = calls.get(message.id);
  if (call) { calls.delete(message.id); message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  calls.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
try {
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*://script.google.com/*', '*://script.googleusercontent.com/*', '*://*.supabase.co/*'] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window, 'AKIZ_CMS_CONFIG', { configurable: true, get: () => ({}), set: () => {} });
  ` });
  // Existing checks select the first page target: remove only this isolated browser's old tabs.
  for (const old of existing.filter(item => item.type === 'page')) await fetch(`${endpoint}/json/close/${old.id}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join('tools', name)], { stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Browser check exceeded 180 seconds')); }, 180000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
  process.exitCode = code ?? 1;
} finally {
  socket.close();
  await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' });
  await fetch(`${endpoint}/json/close/${tab.id}`);
}
