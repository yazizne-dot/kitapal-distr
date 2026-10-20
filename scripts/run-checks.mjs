import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const checks = readdirSync(new URL('.', import.meta.url)).filter(name => /^check-.*\.mjs$/.test(name)).sort();
let failures = 0;
for (const name of checks) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { stdio: 'inherit', timeout: 60000 });
  if (result.status !== 0) {
    failures++;
    console.error(`FAIL ${name}${result.error ? `: ${result.error.message}` : ''}`);
  }
}
console.log(`${checks.length - failures}/${checks.length} checks passed`);
process.exitCode = failures ? 1 : 0;
