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

// Ride booking must still show useful estimates when public routing or fare APIs are unavailable.
const homeRidePath=path.join(frontend,'js','home.js');
const driveCssPath=path.join(frontend,'css','drive.css');
if(!existsSync(homeRidePath))failures.push('Missing customer ride booking script.');
else{
  const homeRide=readFileSync(homeRidePath,'utf8');
  for(const token of ['FALLBACK_FARE_RATES','approximateRoute','haversineKm','fallbackFare','/fare/estimate']){
    if(!homeRide.includes(token))failures.push('Customer ride fare workflow is missing '+token+'.');
  }
  if(!homeRide.includes("source:'fallback'"))failures.push('Customer ride fare workflow must mark fallback estimates as approximate.');
}
if(!existsSync(driveCssPath)||!readFileSync(driveCssPath,'utf8').includes('.route-summary[hidden]{display:none!important}')){
  failures.push('Hidden route summary must not display placeholder dashes before route calculation.');
}

// Driver dispatch must be isolated by the vehicle approved on the driver's application.
const ridesServiceDispatchPath=path.join(root,'backend','src','rides','rides.service.ts');
const secureClaimMigrationPath=path.join(root,'supabase','migrations','20261128183638_drive_secure_ride_claim_and_vehicle_matching.sql');
if(!existsSync(ridesServiceDispatchPath))failures.push('Missing driver request dispatch service.');
else{
  const ridesDispatch=readFileSync(ridesServiceDispatchPath,'utf8');
  for(const token of [
    "const driverVehicle=String(application.requested_vehicle_type||'').trim().toLowerCase();",
    "String(request.requested_vehicle||'').trim().toLowerCase()===driverVehicle",
    "drive_nearby_ride_requests"
  ]){
    if(!ridesDispatch.includes(token))failures.push('Driver request feed is missing exact approved-vehicle filtering: '+token);
  }
}
if(!existsSync(secureClaimMigrationPath))failures.push('Missing secure atomic ride-claim and vehicle-matching migration.');
else{
  const secureClaim=readFileSync(secureClaimMigrationPath,'utf8');
  for(const token of [
    'private.drive_claim_request',
    'security definer',
    'security invoker',
    'v_driver_vehicle is distinct from v_request.requested_vehicle',
    'rides_authorized_insert',
    'ride_requests_update'
  ]){
    if(!secureClaim.toLowerCase().includes(token.toLowerCase()))failures.push('Ride-claim migration is missing '+token+'.');
  }
}
const claimMathFixPath=path.join(root,'supabase','migrations','20261128183834_drive_secure_ride_claim_math_fix.sql');
if(!existsSync(claimMathFixPath))failures.push('Missing follow-up migration for the secure claim distance expression.');
else{
  const claimMathFix=readFileSync(claimMathFixPath,'utf8');
  if(claimMathFix.includes('pg_catalog.least')||claimMathFix.includes('pg_catalog.greatest'))failures.push('LEAST/GREATEST must remain unqualified PostgreSQL expressions.');
  if(!claimMathFix.includes('least(1.0, greatest(0.0,'))failures.push('Secure claim distance must clamp the haversine expression.');
}



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
if(!existsSync(customerCancellationMigrationPath)||!readFileSync(customerCancellationMigrationPath,'utf8').includes('drive_require_cancel_rpc'))failures.push('Missing database guard for reasoned ride cancellation.');
if(!existsSync(customerCancellationMigrationPath)||!readFileSync(customerCancellationMigrationPath,'utf8').includes("'driver'::public.drive_role"))failures.push('Missing database permission for Driver-as-customer cancellation.');
const rlsOptimizationPath=path.join(root,'supabase','migrations','20261128045610_drive_rls_policy_initplan_optimization.sql');
if(!existsSync(rlsOptimizationPath)||!readFileSync(rlsOptimizationPath,'utf8').includes('auth.uid()'))failures.push('Missing RLS policy initplan optimization migration.');
const profileUiPath=path.join(frontend,'profile.html');
const profileScriptPath=path.join(frontend,'js','profile.js');
const exploreUiPath=path.join(frontend,'explore.html');
const exploreScriptPath=path.join(frontend,'js','explore.js');
const receiptUiPath=path.join(frontend,'payment-result.html');
const receiptScriptPath=path.join(frontend,'js','payment-result.js');
if(!existsSync(profileUiPath)||!readFileSync(profileUiPath,'utf8').includes('profileLanguage'))failures.push('Profile must expose the saved language preference.');
if(!existsSync(profileScriptPath)||!readFileSync(profileScriptPath,'utf8').includes('preferred_language'))failures.push('Profile must persist preferred_language.');
if(!existsSync(exploreUiPath)||!readFileSync(exploreUiPath,'utf8').includes('exploreLanguage'))failures.push('Tourist Mode must expose English/Bangla language selection.');
if(!existsSync(exploreScriptPath)||!readFileSync(exploreScriptPath,'utf8').includes("bn:"))failures.push('Tourist Mode must include Bangla interface labels.');
if(!existsSync(receiptUiPath)||!readFileSync(receiptUiPath,'utf8').includes('printReceipt'))failures.push('Confirmed payment receipt must be printable.');
if(!existsSync(receiptScriptPath)||!readFileSync(receiptScriptPath,'utf8').includes('window.print()'))failures.push('Printable receipt action must be wired.');

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
