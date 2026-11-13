import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required Preview build variable: ${name}`);
}

const file = join(tmpdir(), `drive-preview-secrets-${process.pid}.json`);
writeFileSync(file, JSON.stringify({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
}));

try {
  const result = spawnSync('npx', [
    'wrangler', 'preview', 'base-config', 'secret', 'bulk', file,
    '--worker-name', 'cse412-project',
  ], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not configure Cloudflare Preview base secrets.');
} finally {
  rmSync(file, { force: true });
}
