// Static deployment allowlist: never publish source documents, CRM scripts or previews.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = await fs.realpath(process.cwd());
const output = path.resolve(root, 'dist');
const routes = ['admin', 'agreement', 'application', 'offer', 'personal-data', 'privacy', 'rules', 'test', 'test/result', 'thanks'];
const files = ['index.html', '_headers', ...routes.map(route => `${route}/index.html`)];
const scripts = new Set(['admin.js', 'application.js', 'cms-client.js', 'cms-config.js', 'cms-content.js', 'config.js', 'forms.js', 'layout.js', 'main.js', 'result.js', 'test-config.js', 'test-engine.js', 'test.js', 'thanks.js']);
const publicFiles = new Set(['robots.txt', 'sitemap.xml', 'favicon.png', 'CNAME', 'yandex_1fb1de68f8dacca4.html']);
const documents = new Set(['lesson-rules.pdf', 'lesson-rules.docx', 'personal-data-consent.pdf', 'privacy-policy.pdf', 'public-offer.pdf', 'public-offer.docx', 'user-agreement.pdf', 'user-agreement.docx']);
async function checkPath(relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symlink is not a build input: ${relative}`);
  }
}
async function collect(directory, accepts) {
  await checkPath(directory);
  for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) throw new Error(`Unsafe build input: ${relative}`);
    if (relative === 'assets/vendor/README.md') continue; // Internal update instructions, not a runtime asset.
    if (entry.isDirectory()) await collect(relative, accepts);
    else if (entry.isFile() && accepts(relative, entry.name)) files.push(relative);
    else throw new Error(`File is not approved for publication: ${relative}`);
  }
}
await collect('assets/images', file => /\.(png|jpe?g|webp|svg|gif|avif|ico)$/i.test(file));
await collect('assets/fonts', file => /\.(woff2?|ttf|otf)$/i.test(file));
await collect('assets/css', file => /\.css$/i.test(file));
await collect('assets/js', (file, name) => file === `assets/js/${name}` && scripts.has(name));
await collect('assets/vendor', file => ['assets/vendor/supabase-2.57.4.js', 'assets/vendor/SUPABASE-LICENSE'].includes(file));
await collect('assets/documents', (file, name) => file === `assets/documents/${name}` && documents.has(name));
await collect('public', (file, name) => file === `public/${name}` && (publicFiles.has(name) || /^(yandex_[a-f0-9]+|google[a-f0-9]+)\.html$/.test(name)));
for (const file of publicFiles) await fs.access(path.join(root, 'public', file));
for (const file of files) await checkPath(file);
if ((await fs.readFile(path.join(root, 'public/CNAME'), 'utf8')).trim() !== 'akizkorean.ru') throw new Error('Unexpected CNAME');
// Check the resolved target before removing regenerable contents, preserving the deployment repository.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unexpected output directory');
const existing = await fs.lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
if (existing && (existing.isSymbolicLink() || !existing.isDirectory() || await fs.realpath(output) !== output)) throw new Error('Unsafe output directory');
await fs.mkdir(output, { recursive: true });
for (const name of await fs.readdir(output)) {
  if (name.toLowerCase() === '.git') continue;
  const target = path.resolve(output, name);
  if (path.dirname(target) !== output) throw new Error('Unsafe cleanup target');
  await fs.rm(target, { recursive: true, force: true });
}
// Public files are collected last and keep their root URLs in the build.
for (const file of files) {
  const destination = path.join(output, file.startsWith('public/') ? file.slice(7) : file);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, file), destination);
}
console.log('Static site ready: dist/ (no long-running Node server required)');
