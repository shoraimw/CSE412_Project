import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const frontend = path.join(root, 'frontend');
const failures = [];
const pages = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.html')) pages.push(full);
  }
}

function localAssetExists(page, rawUrl) {
  const clean = rawUrl.split('?')[0].split('#')[0];
  if (!clean || /^(?:[a-z]+:)?\/\//i.test(clean) || /^(?:data:|mailto:|tel:|#)/i.test(clean)) return true;
  const candidate = clean.startsWith('/')
    ? path.join(frontend, clean.replace(/^\/+/, ''))
    : path.resolve(path.dirname(page), clean);
  return existsSync(candidate);
}

if (!existsSync(frontend)) failures.push('Missing frontend/ output directory.');
if (!existsSync(path.join(root, 'api', '[...path].js'))) failures.push('Missing Vercel API catch-all function.');
if (!existsSync(path.join(root, 'backend', 'src', 'serverless.ts'))) failures.push('Missing NestJS serverless entrypoint.');
if (!existsSync(path.join(root, 'backend', 'src', 'database', 'database.service.ts'))) failures.push('Missing Supabase database adapter.');

const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
if (config.outputDirectory !== 'frontend') failures.push('Vercel outputDirectory must be frontend.');
if (!config.functions?.['api/[...path].js']?.includeFiles?.includes('backend/dist')) failures.push('Vercel API function must bundle backend/dist.');
if (!config.headers?.some(rule => rule.source === '/(.*)' && rule.headers?.some(h => h.key === 'Cache-Control' && h.value.includes('no-store')))) {
  failures.push('Vercel must disable stale browser/CDN caching for this multi-page release.');
}

if (existsSync(frontend)) walk(frontend);
let assetCount = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const refs = [
    ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]),
    ...[...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi)].map(m => m[1]),
  ];
  for (const ref of refs) {
    assetCount++;
    if (!localAssetExists(page, ref)) failures.push('Missing local asset referenced by ' + path.relative(root, page) + ': ' + ref);
  }
}

if (failures.length) {
  for (const failure of failures) console.error('FAIL:', failure);
  process.exit(1);
}

console.log('DRIVE smoke check passed: ' + pages.length + ' HTML pages and ' + assetCount + ' script/stylesheet references.');
