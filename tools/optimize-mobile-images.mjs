// Generate mobile delivery variants without changing the original artwork.
// Requires the local site on :4173 and a Chromium debugging session on :9223.
import fs from 'node:fs/promises';
const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id);
  message.error ? task.reject(message.error) : task.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
try {
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await new Promise(resolve => setTimeout(resolve, 1000));
  for (const [name, width] of [
    ['hero-teacher-cutout', 980],
    ['learning-sakura-branch-v3', 460],
    ['application-sakura-branch-user', 360],
  ]) {
    const result = await send('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `(async () => {
        const img = new Image();
        img.src = '/assets/images/${name}.webp';
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(${width}, img.naturalWidth);
        canvas.height = Math.round(img.naturalHeight * canvas.width / img.naturalWidth);
        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/webp', .9);
      })()`,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    const data = result.result.value;
    if (!data.startsWith('data:image/webp;base64,')) throw new Error('WebP encoding unavailable');
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    const original = await fs.stat(`assets/images/${name}.webp`);
    if (bytes.length >= original.size) throw new Error(`Variant is not smaller: ${name}`);
    await fs.writeFile(`assets/images/${name}-mobile.webp`, bytes);
    console.log(`${name}: ${original.size} -> ${bytes.length} bytes`);
  }
} finally { ws.close(); }
