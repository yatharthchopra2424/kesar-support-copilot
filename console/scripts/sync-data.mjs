// Refreshes the files the Console bundles (src/data) from the rest of the repo.
//   npm run sync              uses the saved runs in eval/results
//   npm run sync -- --live    first downloads fresh runs from the data API (needs the URL in config)
// Needs Python 3 (the same scorer the TEST_REPORT uses), so the Console never re-implements scoring.
import { execFileSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const out = (f) => resolve(here, '..', 'src', 'data', f);
const from = (f) => resolve(repo, f);

if (process.argv.includes('--live')) {
  const base = process.env.DATA_API;
  if (!base) throw new Error('Set DATA_API to the data API URL first.');
  for (const v of ['v2', 'v1']) {
    const res = await fetch(v === 'v1' ? base + '?v=v1' : base);
    if (!res.ok) throw new Error(v + ' fetch failed: HTTP ' + res.status);
    writeFileSync(from(`eval/results/${v}_run.json`), JSON.stringify(await res.json()));
  }
}

for (const v of ['v2', 'v1']) {
  copyFileSync(from(`eval/results/${v}_run.json`), out(`${v}.json`));
  execFileSync('python', [from('eval/score.py'), '--run', from(`eval/results/${v}_run.json`), '--label', v, '--json', out(`score_${v}.json`)],
    { stdio: 'ignore', env: { ...process.env, PYTHONUTF8: '1' } });
}
copyFileSync(from('data/test_emails.json'), out('emails.json'));
copyFileSync(from('config/policy.json'), out('policy.json'));
copyFileSync(from('eval/expected.json'), out('expected.json'));
console.log('Console data refreshed in src/data');
