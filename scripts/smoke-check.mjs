import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const frontend=path.join(root,'frontend');
const failures=[];
const pages=[];
const scripts=[];

function walk(dir){
  for(const entry of readdirSync(dir)){
    const full=path.join(dir,entry);
    if(statSync(full).isDirectory())walk(full);
    else if(full.endsWith('.html'))pages.push(full);
    else if(full.endsWith('.js'))scripts.push(full);
  }
}
function localAssetExists(page,rawUrl){
  const clean=rawUrl.split('?')[0].split('#')[0];
  if(!clean||clean.startsWith('//')||clean.startsWith('#')||/^[a-z][a-z0-9+.-]*:/i.test(clean))return true;
  const candidate=clean.startsWith('/')
    ?path.join(frontend,clean.slice(1))
    :path.resolve(path.dirname(page),clean);
  return existsSync(candidate);
}

if(!existsSync(frontend))failures.push('Missing frontend/ assets directory.');
if(!existsSync(path.join(root,'backend','src','worker.ts')))failures.push('Missing Cloudflare Worker entrypoint.');
if(!existsSync(path.join(root,'backend','src','database','database.service.ts')))failures.push('Missing Supabase database adapter.');
const configPath=path.join(root,'wrangler.jsonc');
if(!existsSync(configPath))failures.push('Missing wrangler.jsonc deployment configuration.');
else{
  try{
    const config=JSON.parse(readFileSync(configPath,'utf8'));
    if(config.main!=='backend/src/worker.ts')failures.push('wrangler.jsonc must point to backend/src/worker.ts.');
    if(config.assets?.directory!=='./frontend')failures.push('Cloudflare Worker assets directory must be ./frontend.');
    if(!config.assets?.run_worker_first?.includes('/api/*'))failures.push('Worker must handle /api/* before static asset fallback.');
  }catch(error){failures.push('wrangler.jsonc is not valid JSON: '+error.message);}
}
if(existsSync(path.join(root,'vercel.json')))failures.push('Legacy Vercel deployment config must be removed.');
if(existsSync(path.join(root,'api','[...path].js')))failures.push('Legacy Vercel API catch-all must be removed.');


// Keep ride cancellation on the audited role-checked RPC path.
const ridesServicePath=path.join(root,'backend','src','rides','rides.service.ts');
const driverUiPath=path.join(frontend,'js','driver.js');
const cancellationMigrationPath=path.join(root,'supabase','migrations','20261128044619_drive_authorized_driver_midtrip_cancellation.sql');
const customerCancellationMigrationPath=path.join(root,'supabase','migrations','20261128045317_drive_customer_driver_cancellation_and_guard_null_safety.sql');
if(!existsSync(ridesServicePath))failures.push('Missing rides service cancellation workflow.');
else{
  const ridesService=readFileSync(ridesServicePath,'utf8');
  if(!ridesService.includes("if(!['passenger','driver','vehicle_owner'].includes(role))"))failures.push('Customer cancellation must allow only Passenger, Driver or Vehicle Owner roles before the database participant check.');
  if(!ridesService.includes("matched:['driver_arriving'],driver_arriving:['in_progress'],in_progress:['completed']"))failures.push('Direct ride status updates must not bypass the reasoned cancellation RPC.');
}
if(!existsSync(driverUiPath)||!readFileSync(driverUiPath,'utf8').includes("['matched','driver_arriving','in_progress'].includes(status)"))failures.push('Assigned Driver cancellation UI must support active-trip ending.');
if(!existsSync(cancellationMigrationPath)||!readFileSync(cancellationMigrationPath,'utf8').includes('drive_require_cancel_rpc'))failures.push('Missing database guard for reasoned ride cancellation.');
if(!existsSync(customerCancellationMigrationPath)||!readFileSync(customerCancellationMigrationPath,'utf8').includes("'driver'::public.drive_role"))failures.push('Missing database permission for Driver-as-customer cancellation.');

if(existsSync(frontend))walk(frontend);
let assetCount=0;
for(const page of pages){
  const html=readFileSync(page,'utf8');
  const refs=[
    ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1]),
    ...[...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi)].map(m=>m[1]),
  ];
  for(const ref of refs){
    assetCount++;
    if(!localAssetExists(page,ref))failures.push('Missing local asset referenced by '+path.relative(root,page)+': '+ref);
  }
}
for(const file of scripts){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)failures.push('JavaScript syntax check failed for '+path.relative(root,file)+': '+(result.stderr||result.stdout||'unknown parser error').trim());
}
if(failures.length){
  for(const failure of failures)console.error('FAIL:',failure);
  process.exit(1);
}
console.log('DRIVE Cloudflare smoke check passed: '+pages.length+' HTML pages, '+assetCount+' script/stylesheet references and '+scripts.length+' JavaScript files.');
