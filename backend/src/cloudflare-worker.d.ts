interface Env {
  SUPABASE_URL?:string;
  SUPABASE_ANON_KEY?:string;
  SUPABASE_SERVICE_ROLE_KEY?:string;
  CORS_ORIGIN?:string;
  DRIVE_PUBLIC_URL?:string;
  SSLCOMMERZ_STORE_ID?:string;
  SSLCOMMERZ_STORE_PASSWORD?:string;
  SSLCOMMERZ_MODE?:'sandbox'|'live';
  ASSETS:Fetcher;
}
declare module 'cloudflare:node' {
  export function httpServerHandler(options:{port:number}):{fetch(request:Request):Promise<Response>};
}
declare module 'cloudflare:workers' { export const env:Env; }
interface ExecutionContext { waitUntil(promise:Promise<unknown>):void; passThroughOnException():void; }
