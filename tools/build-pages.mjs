// Static deployment allowlist: never publish source documents, CRM scripts or previews.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const output = path.resolve(root, 'dist');
if (output !== path.join(root, 'dist')) throw new Error('Unexpected output directory');
await fs.mkdir(output, { recursive: true });
for (const entry of ['index.html', 'admin', 'agreement', 'application', 'offer', 'personal-data', 'privacy', 'rules', 'test', 'thanks', '_headers']) {
  await fs.cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
await fs.cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
console.log('Static site ready: dist/ (no long-running Node server required)');
