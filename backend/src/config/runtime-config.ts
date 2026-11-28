export interface DriveRuntimeConfig {
  supabaseUrl:string;
  supabaseAnonKey:string;
  supabaseServiceRoleKey:string;
  corsOrigin:string;
  appBaseUrl:string;
  sslcommerzStoreId:string;
  sslcommerzStorePassword:string;
  sslcommerzMode:'sandbox'|'live';
  drivePaymentWebhookSecret:string;
  nodeEnv:string;
}
let runtimeConfig:DriveRuntimeConfig|undefined;
export function setDriveRuntimeConfig(config:DriveRuntimeConfig):void{runtimeConfig=config;}
export function getDriveRuntimeConfig():DriveRuntimeConfig{
  return runtimeConfig??{
    supabaseUrl:process.env.SUPABASE_URL||'',
    supabaseAnonKey:process.env.SUPABASE_ANON_KEY||'',
    supabaseServiceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY||'',
    corsOrigin:process.env.CORS_ORIGIN||'',
    appBaseUrl:process.env.DRIVE_PUBLIC_URL||'https://drive-ewu.pages.dev',
    sslcommerzStoreId:process.env.SSLCOMMERZ_STORE_ID||'',
    sslcommerzStorePassword:process.env.SSLCOMMERZ_STORE_PASSWORD||'',
    sslcommerzMode:process.env.SSLCOMMERZ_MODE==='live'?'live':'sandbox',
    drivePaymentWebhookSecret:process.env.DRIVE_PAYMENT_WEBHOOK_SECRET||'',
    nodeEnv:process.env.NODE_ENV||'development',
  };
}
